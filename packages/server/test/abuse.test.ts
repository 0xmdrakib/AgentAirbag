import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import type { RunReportInput } from '@airbag/core';
import { createApiApp } from '../src/api';
import { nep413MessageHash } from '../src/auth';
import { RATE_RULES, checkRate, clientAddress, createMemoryHit } from '../src/rateLimit';
import {
  MAX_RUNS_PER_ACCOUNT,
  MAX_SESSIONS_PER_ACCOUNT,
  createStore,
  type RunStore,
} from '../src/store';

const START = Date.parse('2099-01-01T00:00:00.000Z');

interface Challenge {
  nonce: string;
  recipient: string;
  message: string;
}

let dataDir = '';
let store: RunStore;
let clock = START;
let app: ReturnType<typeof createApiApp>;
let report: RunReportInput;

/** The real fixture with the bulky per-scenario detail removed: still valid, much faster to save. */
async function loadReport(): Promise<RunReportInput> {
  const full = JSON.parse(
    await readFile(
      fileURLToPath(new URL('../../../fixtures/report.hardened.json', import.meta.url)),
      'utf8',
    ),
  ) as RunReportInput;
  return { ...full, laws: [] };
}

function buildApp(extra: Partial<Parameters<typeof createApiApp>[0]> = {}) {
  return createApiApp({
    store,
    allowedOrigin: null,
    now: () => new Date(clock),
    keyCheck: 'off',
    ...extra,
  });
}

beforeEach(async () => {
  clock = START;
  report = await loadReport();
  dataDir = await mkdtemp(join(tmpdir(), 'airbag-abuse-'));
  store = createStore({ databaseUrl: null, dataDir, quiet: true });
  app = buildApp();
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> | Response {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
}

function signedLogin(challenge: Challenge, accountId: string, secret: Uint8Array) {
  const hash = nep413MessageHash({
    message: challenge.message,
    nonce: new Uint8Array(Buffer.from(challenge.nonce, 'base64')),
    recipient: challenge.recipient,
  });
  return {
    accountId,
    publicKey: `ed25519:${base58.encode(ed25519.getPublicKey(secret))}`,
    signature: Buffer.from(ed25519.sign(hash, secret)).toString('base64'),
    nonce: challenge.nonce,
    message: challenge.message,
    recipient: challenge.recipient,
  };
}

/** Signs in a throwaway implicit account, from the given client address. */
async function signIn(seed: number, ip: string): Promise<{ cookie: string; accountId: string }> {
  const secret = new Uint8Array(32).fill(seed);
  const accountId = Buffer.from(ed25519.getPublicKey(secret)).toString('hex');
  const headers = { 'x-real-ip': ip };
  const challenge = (await (
    await post('/api/auth/nonce', { accountId }, headers)
  ).json()) as Challenge;
  const response = await post(
    '/api/auth/verify',
    signedLogin(challenge, accountId, secret),
    headers,
  );
  expect(response.status).toBe(200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, accountId };
}

describe('rate limiting', () => {
  it('lets a normal sign-in through and refuses a flood of nonces with a clear 429', async () => {
    const headers = { 'x-real-ip': '203.0.113.7' };
    for (let index = 0; index < RATE_RULES.nonce.limit; index += 1) {
      expect((await post('/api/auth/nonce', {}, headers)).status).toBe(200);
    }
    const refused = await post('/api/auth/nonce', {}, headers);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = (await refused.json()) as { error: string };
    expect(body.error).toMatch(/too many requests/i);
  });

  it('counts each address separately', async () => {
    const busy = { 'x-real-ip': '203.0.113.7' };
    for (let index = 0; index <= RATE_RULES.nonce.limit; index += 1) {
      await post('/api/auth/nonce', {}, busy);
    }
    expect((await post('/api/auth/nonce', {}, busy)).status).toBe(429);
    expect((await post('/api/auth/nonce', {}, { 'x-real-ip': '198.51.100.9' })).status).toBe(200);
  });

  it('opens a fresh window after the minute passes', async () => {
    const headers = { 'x-real-ip': '203.0.113.7' };
    for (let index = 0; index <= RATE_RULES.nonce.limit; index += 1) {
      await post('/api/auth/nonce', {}, headers);
    }
    expect((await post('/api/auth/nonce', {}, headers)).status).toBe(429);
    clock += 61_000;
    expect((await post('/api/auth/nonce', {}, headers)).status).toBe(200);
  });

  it('refuses a flood of verify attempts', async () => {
    const headers = { 'x-real-ip': '203.0.113.20' };
    for (let index = 0; index < RATE_RULES.verify.limit; index += 1) {
      const response = await post('/api/auth/verify', { accountId: 'x' }, headers);
      expect(response.status).toBe(400);
    }
    expect((await post('/api/auth/verify', { accountId: 'x' }, headers)).status).toBe(429);
  });

  it('limits saves per account without touching other accounts', async () => {
    const alice = await signIn(21, '203.0.113.31');
    const bob = await signIn(22, '203.0.113.32');
    for (let index = 0; index < RATE_RULES.saveAccount.limit; index += 1) {
      const saved = await post(
        '/api/runs',
        { report },
        { cookie: alice.cookie, 'x-real-ip': '203.0.113.31' },
      );
      expect(saved.status).toBe(200);
    }
    const refused = await post(
      '/api/runs',
      { report },
      { cookie: alice.cookie, 'x-real-ip': '203.0.113.31' },
    );
    expect(refused.status).toBe(429);
    const other = await post(
      '/api/runs',
      { report },
      { cookie: bob.cookie, 'x-real-ip': '203.0.113.32' },
    );
    expect(other.status).toBe(200);
  });

  it('never blocks anyone when the counter itself fails', async () => {
    const failing = { ...store, hit: async () => Promise.reject(new Error('database is down')) };
    app = buildApp({ store: failing as unknown as RunStore });
    const response = await post('/api/auth/nonce', {}, { 'x-real-ip': '203.0.113.50' });
    expect(response.status).toBe(200);
  });

  it('can be turned off', async () => {
    app = buildApp({ rateLimit: false });
    for (let index = 0; index < RATE_RULES.nonce.limit + 5; index += 1) {
      expect((await post('/api/auth/nonce', {}, { 'x-real-ip': '203.0.113.60' })).status).toBe(200);
    }
  });

  it('reads the caller address from the host headers and hashes nothing it does not need', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    expect(clientAddress(headers)).toBe('203.0.113.5');
    expect(clientAddress(new Headers({ 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1');
    expect(clientAddress(new Headers())).toBe('unknown');
    // Behind Cloudflare the real visitor is in CF-Connecting-IP, not in the edge address.
    const proxied = new Headers({
      'cf-connecting-ip': '203.0.113.99',
      'x-vercel-forwarded-for': '104.21.33.191',
      'x-forwarded-for': '104.21.33.191',
    });
    expect(clientAddress(proxied)).toBe('203.0.113.99');
  });

  it('keeps visitors behind one Cloudflare edge address apart', async () => {
    const edge = '104.21.33.191';
    for (let index = 0; index <= RATE_RULES.nonce.limit; index += 1) {
      await post(
        '/api/auth/nonce',
        {},
        { 'x-forwarded-for': edge, 'cf-connecting-ip': '203.0.113.1' },
      );
    }
    const first = await post(
      '/api/auth/nonce',
      {},
      { 'x-forwarded-for': edge, 'cf-connecting-ip': '203.0.113.1' },
    );
    const other = await post(
      '/api/auth/nonce',
      {},
      { 'x-forwarded-for': edge, 'cf-connecting-ip': '203.0.113.2' },
    );
    expect(first.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it('counts in fixed windows', async () => {
    const hit = createMemoryHit();
    const rule = { name: 'unit', limit: 2, windowMs: 1000 };
    expect((await checkRate(hit, rule, 'a', 0)).allowed).toBe(true);
    expect((await checkRate(hit, rule, 'a', 10)).allowed).toBe(true);
    const third = await checkRate(hit, rule, 'a', 20);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(1);
    expect((await checkRate(hit, rule, 'a', 1500)).allowed).toBe(true);
  });
});

describe('request checks', () => {
  it('refuses a browser POST that names a foreign origin', async () => {
    const response = await post('/api/auth/nonce', {}, { origin: 'https://evil.example' });
    expect(response.status).toBe(403);
  });

  it('allows the same origin, a missing origin and the configured origin', async () => {
    expect((await post('/api/auth/nonce', {}, { origin: 'http://localhost' })).status).toBe(200);
    expect((await post('/api/auth/nonce', {})).status).toBe(200);
    app = buildApp({ allowedOrigin: 'https://airbag.example' });
    const allowed = await post('/api/auth/nonce', {}, { origin: 'https://airbag.example' });
    expect(allowed.status).toBe(200);
    const foreign = await post('/api/auth/nonce', {}, { origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
  });

  it('marks API responses as not cacheable', async () => {
    const response = await app.request('/api/health');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses an oversized sign-in body', async () => {
    const response = await post('/api/auth/verify', { accountId: 'a'.repeat(40_000) });
    expect(response.status).toBe(413);
  });
});

describe('storage limits', () => {
  it('keeps only the newest runs for an account', async () => {
    const account = 'limit-check.near';
    for (let index = 0; index < MAX_RUNS_PER_ACCOUNT + 5; index += 1) {
      await store.saveRun(account, { ...report, hash: `hash-${index}` });
    }
    const runs = await store.listRuns(account, 500);
    expect(runs).toHaveLength(MAX_RUNS_PER_ACCOUNT);
    expect(runs[0]?.hash).toBe(`hash-${MAX_RUNS_PER_ACCOUNT + 4}`);
  });

  it('keeps only the newest sessions for an account and drops expired ones', async () => {
    const account = 'sessions.near';
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    await store.createSession(account, 'expired', past);
    for (let index = 0; index < MAX_SESSIONS_PER_ACCOUNT + 3; index += 1) {
      await store.createSession(account, `token-${index}`, future);
    }
    expect(await store.getSession('expired')).toBeNull();
    expect(await store.getSession('token-0')).toBeNull();
    expect(await store.getSession(`token-${MAX_SESSIONS_PER_ACCOUNT + 2}`)).toBe(account);
  });
});
