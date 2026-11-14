import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { exec, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';

const smoke = process.argv.includes('--smoke');

function run(command: string): void {
  console.log(`\n$ ${command}`);
  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`Command failed: ${command}`);
    process.exit(result.status ?? 1);
  }
}

console.log('Airbag demo — building the lab');

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

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
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

const port = await freePort(4321);
server.listen(port, '127.0.0.1', async () => {
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

  if (smoke) {
    const response = await fetch(base);
    const html = await response.text();
    if (!response.ok || !html.includes('id="root"')) {
      console.error('Demo smoke failed: the built index.html did not come back.');
      server.close();
      process.exit(1);
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
        server.close();
        process.exit(1);
      }
      console.log('\nDemo smoke passed: the report card rendered in Chrome.');
    } catch (error) {
      console.error(`Demo smoke failed: ${(error as Error).message}`);
      server.close();
      process.exit(1);
    }
    server.close();
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
    server.close(() => process.exit(0));
  });
}
