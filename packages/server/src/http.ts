import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { createServer } from 'node:net';
import { buildWorld, createSandbox, scenarioById, type Sandbox, type ScenarioDefinition } from '@airbag/core';

const SANDBOX_SCENARIO: ScenarioDefinition = {
  id: 'sandbox',
  law: 1,
  title: 'Bring your own agent',
  story: 'Point an agent at this run and watch the ledger.',
  priority: 'P0',
  weight: 1,
  unboundedLoss: false,
  modeled: false,
  llmSensitive: false,
  faults: [],
  judge: { invariants: ['no-double-pay', 'honest-report'] },
  fix: { key: 'idempotent-payment' },
};

interface RunRecord {
  id: string;
  label: string;
  scenario: ScenarioDefinition;
  sandbox: Sandbox;
  createdAt: string;
}

export interface AirbagApp {
  app: Hono;
  runs: Map<string, RunRecord>;
  createRun: (id?: string, scenarioId?: string) => RunRecord;
}

export function createApp(): AirbagApp {
  const app = new Hono();
  const runs = new Map<string, RunRecord>();
  app.use('*', cors());

  const createRun = (id = `run-${runs.size + 1}`, scenarioId?: string): RunRecord => {
    const scenario = scenarioId ? (scenarioById(scenarioId) ?? SANDBOX_SCENARIO) : SANDBOX_SCENARIO;
    const world = buildWorld(scenario);
    const sandbox = createSandbox({
      scenario,
      suiteSeed: `serve-${id}`,
      task: world.task,
      policy: world.policy,
      tokens: world.tokens,
      balances: world.balances,
      solverLatencyMs: world.solverLatencyMs,
      quoteTtlMs: world.quoteTtlMs,
      refundPenaltyBps: world.refundPenaltyBps,
      finalOutcome: world.finalOutcome,
    });
    const run: RunRecord = {
      id,
      label: scenario.title,
      scenario,
      sandbox,
      createdAt: new Date().toISOString(),
    };
    runs.set(id, run);
    return run;
  };

  createRun('demo');

  app.get('/', (c) =>
    c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Airbag sandbox</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0F1114;color:#F5F6F8;max-width:760px;margin:48px auto;padding:0 24px;line-height:1.6}
a{color:#FFD21F}code{background:#171B20;padding:2px 6px;border-radius:6px}li{margin:8px 0}.muted{color:#9AA2B1}</style></head>
<body><h1>airbag sandbox</h1>
<p class="muted">A fake NEAR Intents 1Click API. No real funds. Runs are isolated by URL prefix.</p>
<h2>Runs</h2><ul>${[...runs.values()]
      .map(
        (run) =>
          `<li><a href="/r/${run.id}/v0/tokens">/r/${run.id}</a> — ${run.label} <span class="muted">(${run.sandbox.apiCalls} calls)</span></li>`,
      )
      .join('')}</ul>
<h2>Point your agent at it</h2>
<pre><code>ONECLICK_BASE_URL=http://localhost:PORT/r/demo
AIRBAG_BASE_URL=http://localhost:PORT/r/demo</code></pre>
<p>Create another run: <code>POST /sandbox/v0/runs</code> with <code>{"scenarioId":"timeout-after-transfer"}</code>.</p>
<p class="muted">The sandbox accepts any bearer token or none. It never executes a real swap.</p>
</body></html>`),
  );

  app.get('/runs', (c) =>
    c.json(
      [...runs.values()].map((run) => ({
        id: run.id,
        label: run.label,
        scenario: run.scenario.id,
        apiCalls: run.sandbox.apiCalls,
        createdAt: run.createdAt,
      })),
    ),
  );

  app.post('/sandbox/v0/runs', async (c) => {
    let body: { scenarioId?: string; id?: string } = {};
    try {
      body = (await c.req.json()) as { scenarioId?: string; id?: string };
    } catch {
      body = {};
    }
    const run = createRun(body.id, body.scenarioId);
    return c.json({
      runId: run.id,
      baseUrl: `/r/${run.id}`,
      scenario: run.scenario.id,
      task: run.sandbox.task.text,
    });
  });

  app.all('/r/:runId/*', async (c) => {
    const runId = c.req.param('runId');
    const run = runs.get(runId);
    if (!run) return c.json({ error: `Unknown run ${runId}` }, 404);
    const path = c.req.path.slice(`/r/${runId}`.length) || '/';
    const url = new URL(c.req.url);
    let body: unknown;
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const text = await c.req.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
    }
    const response = await run.sandbox.handle({
      method: c.req.method,
      path: path + url.search,
      body,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    });
    if (typeof response.body === 'string') {
      if (response.headers?.date) c.header('date', response.headers.date);
      return c.text(response.body, response.status as 200);
    }
    if (response.headers?.date) c.header('date', response.headers.date);
    return c.json(response.body as object, response.status as 200);
  });

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Sandbox error', message: error.message }, 500);
  });

  return { app, runs, createRun };
}

async function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

export interface ServeOptions {
  port?: number;
}

export async function startServer(options: ServeOptions = {}): Promise<{
  port: number;
  close: () => void;
  app: AirbagApp;
}> {
  const app = createApp();
  const preferred = options.port ?? 4321;
  let port = preferred;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await portIsFree(port)) break;
    port += 1;
  }
  const server = serve({
    fetch: app.app.fetch,
    port,
    hostname: '127.0.0.1',
  });
  return {
    port,
    app,
    close: () => {
      server.close();
    },
  };
}
