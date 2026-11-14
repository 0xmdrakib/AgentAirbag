import { execa } from 'execa';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import type { AgentAdapter, SandboxHandle } from '@airbag/core';

const AGENT_TIMEOUT_MS = 120_000;

const CHILD_ENV_KEYS = new Set([
  'PATH',
  'Path',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'TEMP',
  'TMP',
  'SystemRoot',
  'SystemDrive',
  'ComSpec',
  'APPDATA',
  'LOCALAPPDATA',
  'WINDIR',
  'NUMBER_OF_PROCESSORS',
  'OS',
]);

export interface ProcessAgent extends AgentAdapter {
  readonly failures: Map<string, string>;
}

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (CHILD_ENV_KEYS.has(key) || key.startsWith('AIRBAG_')) env[key] = value;
  }
  return env;
}

/**
 * Bring-your-own agent as a child process.
 *
 * The process needs a real HTTP origin, not the in-process fetch shim. For each
 * scenario we start a tiny Hono server around the run's sandbox, hand the
 * process that URL, and close the server when the process exits.
 */
export function processAgent(command: string): ProcessAgent {
  const failures = new Map<string, string>();
  return {
    id: 'process',
    label: `Bring your own: ${command}`,
    kind: 'process',
    failures,
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

      failures.delete(ctx.task.id);
      let failureReported = false;
      const recordFailure = (message: string) => {
        if (failureReported) return;
        failureReported = true;
        failures.set(ctx.task.id, message);
        ctx.message(message);
      };
      const onAbort = () =>
        recordFailure(`External agent timed out after ${AGENT_TIMEOUT_MS / 1000} s`);
      ctx.signal.addEventListener('abort', onAbort, { once: true });

      try {
        ctx.message(`Starting external agent: ${command}`);
        if (ctx.signal.aborted) onAbort();
        const env = childEnv();
        env.AIRBAG_BASE_URL = base;
        env.ONECLICK_BASE_URL = base;
        env.NEAR_SWAP_API_URL = base;
        env.AIRBAG_TASK = JSON.stringify(ctx.task);
        env.AIRBAG_POLICY = JSON.stringify(ctx.policy);
        const result = await execa(command, {
          shell: true,
          timeout: AGENT_TIMEOUT_MS,
          reject: false,
          killDescendants: true,
          cancelSignal: ctx.signal,
          extendEnv: false,
          env,
        });
        if (result.timedOut) {
          recordFailure(`External agent timed out after ${AGENT_TIMEOUT_MS / 1000} s`);
        } else if (result.signal) {
          recordFailure(`External agent was killed by ${result.signal}`);
        } else if (result.isCanceled) {
          recordFailure('External agent was cancelled');
        } else if (result.exitCode !== 0) {
          recordFailure(
            result.exitCode === undefined
              ? `External agent failed to run: ${result.message ?? 'unknown error'}`
              : `External agent exited ${result.exitCode}: ${result.stderr.slice(0, 400) || 'no stderr'}`,
          );
        }
      } catch (error) {
        recordFailure(
          `External agent failed to run: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      } finally {
        ctx.signal.removeEventListener('abort', onAbort);
        server.close();
      }
    },
  };
}

