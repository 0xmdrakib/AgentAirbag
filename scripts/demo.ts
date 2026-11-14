import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { exec, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  try {
    process.loadEnvFile(file);
  } catch {
    console.warn(`Could not load ${file}`);
  }
}

const smoke = process.argv.includes('--smoke');

function run(command: string): void {
  console.log(`\n$ ${command}`);
  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`Command failed: ${command}`);
    process.exit(result.status ?? 1);
  }
}

console.log('Airbag demo: building the lab');

run('pnpm build:scenarios');
run('pnpm build:fixtures');
if (!existsSync(join('apps', 'web', 'dist', 'index.html'))) {
  run('pnpm --filter @airbag/web build');
}

const naive = JSON.parse(readFileSync(join('fixtures', 'report.naive.json'), 'utf8')) as {
  overall: { failed: number; simulatedLossUsd: string; grade: string };
};
const hardened = JSON.parse(readFileSync(join('fixtures', 'report.hardened.json'), 'utf8')) as {
  overall: { failed: number; simulatedLossUsd: string; grade: string; passed: number };
};

if (hardened.overall.failed !== 0) {
  console.error(`\nDemo check failed: Seatbelt crashed on ${hardened.overall.failed} scenarios.`);
  process.exit(1);
}
if (naive.overall.failed < 14) {
  console.error(`\nDemo check failed: Dummy only crashed on ${naive.overall.failed} scenarios.`);
  process.exit(1);
}

const root = resolve('apps/web/dist');

function safePath(urlPath: string): string {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const requested = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const full = resolve(root, normalize(requested));
  return full.startsWith(root) ? full : join(root, 'index.html');
}

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

interface ApiHandle {
  port: number;
  close: () => void;
}

interface ApiApp {
  fetch: (request: Request) => Response | Promise<Response>;
}

interface ApiModule {
  createApiApp?: () => ApiApp | { app: ApiApp } | Promise<ApiApp | { app: ApiApp }>;
}

let api: ApiHandle | null = null;

function sendApiUnavailable(response: ServerResponse): void {
  response.writeHead(503, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify({ error: 'The API is not running in this demo build' }));
}

function proxyApi(request: IncomingMessage, response: ServerResponse): void {
  if (!api) {
    sendApiUnavailable(response);
    return;
  }
  const target = api;
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => {
    // Buffer the body before forwarding. Streaming a POST through fetch breaks on Windows.
    const body = Buffer.concat(chunks);
    const originalHost = request.headers.host;
    const headers: Record<string, string | string[] | undefined> = {
      ...request.headers,
      host: `127.0.0.1:${target.port}`,
    };
    if (originalHost) headers['x-forwarded-host'] = originalHost;
    headers['x-forwarded-proto'] = 'http';

    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port: target.port,
        path: request.url ?? '/',
        method: request.method,
        headers,
      },
      (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers };
        const location = responseHeaders.location;
        const apiOrigin = `http://127.0.0.1:${target.port}`;
        if (typeof location === 'string' && location.startsWith(apiOrigin) && originalHost) {
          responseHeaders.location = `http://${originalHost}${location.slice(apiOrigin.length)}`;
        }
        response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
        upstreamResponse.pipe(response);
      },
    );

    upstream.on('error', (error) => {
      if (!response.headersSent) {
        response.writeHead(502, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ error: 'API proxy failed', message: error.message }));
      } else {
        response.destroy(error);
      }
    });
    upstream.end(body);
  });
  request.on('error', () => response.destroy());
}

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  if ((request.url ?? '').startsWith('/api')) {
    proxyApi(request, response);
    return;
  }
  let file = safePath(request.url ?? '/');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const type = mime[extname(file)] ?? 'application/octet-stream';
  response.writeHead(200, {
    'content-type': type,
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(response);
});

async function freePort(start: number): Promise<number> {
  for (let port = start; port < start + 30; port += 1) {
    const available = await new Promise<boolean>((resolvePort) => {
      const probe = createNetServer();
      probe.once('error', () => resolvePort(false));
      probe.once('listening', () => probe.close(() => resolvePort(true)));
      probe.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error('No free port found');
}

function isMissingModule(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND')
  );
}

async function startApi(startPort: number): Promise<ApiHandle | null> {
  const apiModulePath = resolve('packages', 'server', 'src', 'api.ts');
  if (!existsSync(apiModulePath)) return null;
  // The schema is the API's database file. Without it Neon runs cannot create their tables.
  if (!existsSync(resolve('db', 'schema.sql'))) return null;

  let module: ApiModule;
  try {
    module = (await import(pathToFileURL(apiModulePath).href)) as ApiModule;
  } catch (error) {
    // A missing database module imported by api.ts also lands here. Keep the static demo alive.
    if (isMissingModule(error)) return null;
    throw error;
  }
  if (typeof module.createApiApp !== 'function') {
    throw new Error(`${apiModulePath} does not export createApiApp()`);
  }

  const created = await module.createApiApp();
  const app =
    typeof (created as ApiApp).fetch === 'function'
      ? (created as ApiApp)
      : (created as { app?: ApiApp }).app;
  if (!app || typeof app.fetch !== 'function') {
    throw new Error('createApiApp() did not return a Hono app');
  }

  const apiPort = await freePort(startPort);
  const requireFromServer = createRequire(resolve('packages', 'server', 'package.json'));
  const { serve } = requireFromServer('@hono/node-server') as {
    serve: (options: {
      fetch: (request: Request) => Response | Promise<Response>;
      port: number;
      hostname: string;
    }) => { close: () => void };
  };
  const apiServer = serve({
    fetch: app.fetch.bind(app),
    port: apiPort,
    hostname: '127.0.0.1',
  });
  return { port: apiPort, close: () => apiServer.close() };
}

function closeServers(): void {
  server.close();
  api?.close();
}

const port = await freePort(4321);
server.listen(port, '127.0.0.1', async () => {
  let apiMissing = false;
  try {
    api = await startApi(port + 1);
    apiMissing = api === null;
  } catch (error) {
    console.error(`Wallet API failed to start: ${(error as Error).message}`);
  }

  const base = `http://localhost:${port}`;
  const reportUrl = `${base}/#/report`;
  console.log(`\nAirbag is ready at ${base}`);
  console.log(`Report card: ${reportUrl}`);
  console.log(
    `Dummy: ${naive.overall.grade} · ${naive.overall.failed} crashed · $${naive.overall.simulatedLossUsd} simulated loss`,
  );
  console.log(
    `Seatbelt: ${hardened.overall.grade} · ${hardened.overall.passed} survived · $${hardened.overall.simulatedLossUsd} simulated loss`,
  );
  if (apiMissing) {
    console.log('API not bundled in this build; wallet connect is disabled');
  } else if (api) {
    console.log(`Wallet API: /api proxied to 127.0.0.1:${api.port}`);
  }

  if (smoke) {
    const response = await fetch(base);
    const html = await response.text();
    if (!response.ok || !html.includes('id="root"')) {
      console.error('Demo smoke failed: the built index.html did not come back.');
      closeServers();
      process.exit(1);
    }
    // When the API is present, prove the proxy forwards GET, POST bodies and status codes.
    if (api) {
      try {
        const health = await fetch(`${base}/api/health`);
        const healthBody = (await health.json()) as { ok?: boolean };
        const nonce = await fetch(`${base}/api/auth/nonce`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: 'airbag_demo_smoke=1' },
          body: JSON.stringify({ accountId: 'not a valid account!' }),
        });
        const nonceBody = (await nonce.json()) as { error?: unknown };
        if (!health.ok || healthBody.ok !== true) {
          throw new Error(`GET /api/health returned ${health.status}`);
        }
        if (nonce.status !== 400 || !String(nonceBody.error).includes('valid NEAR account id')) {
          throw new Error(`POST /api/auth/nonce returned ${nonce.status}`);
        }
        console.log('\nAPI proxy smoke passed: GET and POST bodies reached the API.');
      } catch (error) {
        console.error(`Demo smoke failed: API proxy check failed (${(error as Error).message}).`);
        closeServers();
        process.exit(1);
      }
    }
    // Load the real app in Chrome and read the report, so a broken bundle or empty route fails.
    try {
      const { chromium } = await import('playwright-core');
      const { chromePath } = await import('./preview');
      const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(reportUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('.report-hero', { timeout: 15_000 });
      const text = await page.locator('main').innerText();
      const checks: [string, boolean][] = [
        ['grade F headline', text.includes('$10,907.04')],
        ['21 crashes', text.includes('21 crashes')],
        ['Seatbelt row', text.includes('Seatbelt')],
        ['no page errors', errors.length === 0],
      ];
      const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
      await browser.close();
      if (failed.length > 0) {
        console.error(`Demo smoke failed: ${failed.join(', ')}`);
        closeServers();
        process.exit(1);
      }
      console.log('\nDemo smoke passed: the report card rendered in Chrome.');
    } catch (error) {
      console.error(`Demo smoke failed: ${(error as Error).message}`);
      closeServers();
      process.exit(1);
    }
    closeServers();
    process.exit(0);
  }

  const openCommand =
    process.platform === 'win32'
      ? `start "" "${reportUrl}"`
      : process.platform === 'darwin'
        ? `open "${reportUrl}"`
        : `xdg-open "${reportUrl}"`;
  exec(openCommand, (error) => {
    if (error) console.log(`Could not open a browser automatically. Open ${reportUrl}`);
  });
  console.log('\nCtrl+C to stop the static server.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    api?.close();
    server.close(() => process.exit(0));
  });
}
