import { execa } from 'execa';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import type { AgentAdapter, SandboxHandle } from '@airbag/core';

/**
 * Bring-your-own agent as a child process.
 *
 * The process needs a real HTTP origin, not the in-process fetch shim. For each
 * scenario we start a tiny Hono server around the run's sandbox, hand the
 * process that URL, and close the server when the process exits.
 */
export function processAgent(command: string): AgentAdapter {
  return {
    id: 'process',
    label: `Bring your own: ${command}`,
    kind: 'process',
    async run(ctx) {
      const sandbox: SandboxHandle | undefined = ctx.sandbox;
      if (!sandbox) {
        throw new Error('The process adapter needs the HTTP sandbox handle; run it through the CLI.');
      }

      const app = new Hono();
      app.use('*', cors());
      app.all('/r/:runId/*', async (c) => {
        const runId = c.req.param('runId');
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
        const response = await sandbox.handle({
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

      const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
      await new Promise<void>((resolve, reject) => {
        server.once('listening', () => resolve());
        server.once('error', reject);
      });
      const address = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${address.port}/r/${ctx.task.id}`;

      try {
        ctx.message(`Starting external agent: ${command}`);
        const result = await execa(command, {
          shell: true,
          timeout: 120_000,
          reject: false,
          env: {
            ...process.env,
            AIRBAG_BASE_URL: base,
            ONECLICK_BASE_URL: base,
            NEAR_SWAP_API_URL: base,
            AIRBAG_TASK: JSON.stringify(ctx.task),
            AIRBAG_POLICY: JSON.stringify(ctx.policy),
          },
        });
        if (result.exitCode !== 0) {
          ctx.message(
            `External agent exited ${result.exitCode}: ${result.stderr.slice(0, 400) || 'no stderr'}`,
          );
        }
      } finally {
        server.close();
      }
    },
  };
}
