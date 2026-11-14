import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import type { RunReportInput } from '@airbag/core';
import { createApiApp } from '../src/api';
import { nep413MessageHash } from '../src/auth';
import { createStore, type RunStore, type RunSummary } from '../src/store';

const TEST_NOW = new Date('2099-01-01T00:00:00.000Z');
const ALICE_SECRET = new Uint8Array(32).fill(11);
const BOB_SECRET = new Uint8Array(32).fill(12);

interface Challenge {
  nonce: string;
  recipient: string;
  message: string;
  expiresAt: string;
}

let dataDir = '';
let store: RunStore;
let app: ReturnType<typeof createApiApp>;
let report: RunReportInput;
let originalNetwork: string | undefined;

beforeAll(async () => {
  originalNetwork = process.env.NEAR_NETWORK;
  process.env.NEAR_NETWORK = 'testnet';
  report = JSON.parse(
    await readFile(
      fileURLToPath(new URL('../../../fixtures/report.hardened.json', import.meta.url)),
      'utf8',
    ),
  ) as RunReportInput;
});

afterAll(() => {
  if (originalNetwork === undefined) delete process.env.NEAR_NETWORK;
  else process.env.NEAR_NETWORK = originalNetwork;
});

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'airbag-api-'));
  store = createStore({ databaseUrl: null, dataDir, quiet: true });
  app = createApiApp({ store, allowedOrigin: null, now: () => TEST_NOW });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function apiPost(path: string, body?: unknown, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers['cookie'] = cookie;
  return app.request(path, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function apiGet(path: string, cookie?: string): Promise<Response> {
  return app.request(path, { headers: cookie ? { cookie } : {} });
}

async function requestChallenge(accountId: string): Promise<Challenge> {
  const response = await apiPost('/api/auth/nonce', { accountId });
  expect(response.status).toBe(200);
  return (await response.json()) as Challenge;
}

function signedLogin(
  challenge: Challenge,
  accountId: string,
  secretKey: Uint8Array,
): Record<string, string> {
  const nonce = new Uint8Array(Buffer.from(challenge.nonce, 'base64'));
  const hash = nep413MessageHash({
    message: challenge.message,
    nonce,
    recipient: challenge.recipient,
  });
  const publicKey = `ed25519:${base58.encode(ed25519.getPublicKey(secretKey))}`;
  return {
    accountId,
    publicKey,
    signature: Buffer.from(ed25519.sign(hash, secretKey)).toString('base64'),
    nonce: challenge.nonce,
    message: challenge.message,
    recipient: challenge.recipient,
  };
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';')[0]!;
}

async function signIn(accountId: string, secretKey: Uint8Array): Promise<string> {
  const challenge = await requestChallenge(accountId);
  const response = await apiPost('/api/auth/verify', signedLogin(challenge, accountId, secretKey));
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

describe('GET /api/health', () => {
  it('reports the local backend and the configured network', async () => {
    const response = await apiGet('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, db: 'local', network: 'testnet' });
  });
});

describe('NEP-413 login', () => {
  it('runs nonce -> sign -> verify -> cookie -> /api/me', async () => {
    const challenge = await requestChallenge('alice.testnet');
    expect(Buffer.from(challenge.nonce, 'base64')).toHaveLength(32);
    expect(challenge.recipient).toBe('localhost');
    expect(challenge.message).toContain(challenge.nonce);

    const verify = await apiPost(
      '/api/auth/verify',
      signedLogin(challenge, 'alice.testnet', ALICE_SECRET),
    );
    expect(verify.status).toBe(200);
    expect(await verify.json()).toEqual({ accountId: 'alice.testnet' });

    const setCookie = verify.headers.get('set-cookie');
    expect(setCookie).toContain('airbag_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=604800');

    const me = await apiGet('/api/me', cookieFrom(verify));
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ accountId: 'alice.testnet' });
  });

  it('binds an optional accountId to the challenge', async () => {
    const challenge = await requestChallenge('alice.testnet');
    const response = await apiPost(
      '/api/auth/verify',
      signedLogin(challenge, 'bob.testnet', BOB_SECRET),
    );
    expect(response.status).toBe(400);
  });

  it('consumes a nonce after a successful login', async () => {
    const challenge = await requestChallenge('alice.testnet');
    const body = signedLogin(challenge, 'alice.testnet', ALICE_SECRET);
    expect((await apiPost('/api/auth/verify', body)).status).toBe(200);
    expect((await apiPost('/api/auth/verify', body)).status).toBe(400);
  });

  it('does not consume a nonce on a bad signature, so the user can retry', async () => {
    const challenge = await requestChallenge('alice.testnet');
    const body = signedLogin(challenge, 'alice.testnet', ALICE_SECRET);
    const badSignature = Buffer.alloc(64, 1).toString('base64');

    const bad = await apiPost('/api/auth/verify', { ...body, signature: badSignature });
    expect(bad.status).toBe(401);
    const retry = await apiPost('/api/auth/verify', body);
    expect(retry.status).toBe(200);
  });

  it('logs out by deleting the session and clearing the cookie', async () => {
    const cookie = await signIn('alice.testnet', ALICE_SECRET);
    const logout = await apiPost('/api/auth/logout', undefined, cookie);
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await logout.json()).toEqual({ ok: true });
    const me = await apiGet('/api/me', cookie);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ accountId: null });
  });
});

describe('protected routes', () => {
  it('returns 401 without a session cookie', async () => {
    const me = await apiGet('/api/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ accountId: null });
    expect((await apiGet('/api/runs')).status).toBe(401);
    expect((await apiPost('/api/runs', { report })).status).toBe(401);
    expect((await apiGet('/api/runs/anything')).status).toBe(401);
  });
});

describe('saved runs', () => {
  it('saves, lists and reads a report for its owner only', async () => {
    const cookie = await signIn('alice.testnet', ALICE_SECRET);

    const save = await apiPost('/api/runs', { report }, cookie);
    expect(save.status).toBe(200);
    const saved = (await save.json()) as { id: string; createdAt: string };
    expect(saved.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(saved.createdAt))).toBe(false);

    const listResponse = await apiGet('/api/runs', cookie);
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as RunSummary[];
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: saved.id,
      createdAt: saved.createdAt,
      hash: report.hash,
      grade: report.overall.grade,
      score: report.overall.score,
      lossUsd: report.overall.simulatedLossUsd,
      passed: report.overall.passed,
      failed: report.overall.failed,
    });

    const fullResponse = await apiGet(`/api/runs/${saved.id}`, cookie);
    expect(fullResponse.status).toBe(200);
    expect(await fullResponse.json()).toEqual(report);

    const bobCookie = await signIn('bob.testnet', BOB_SECRET);
    expect((await apiGet(`/api/runs/${saved.id}`, bobCookie)).status).toBe(404);
    expect(await (await apiGet('/api/runs', bobCookie)).json()).toEqual([]);
  });

  it('rejects an invalid report with 400', async () => {
    const cookie = await signIn('alice.testnet', ALICE_SECRET);
    const response = await apiPost('/api/runs', { report: { schemaVersion: 2 } }, cookie);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/invalid run report/i);
  });

  it('rejects a report body larger than 512 KB', async () => {
    const cookie = await signIn('alice.testnet', ALICE_SECRET);
    const response = await apiPost(
      '/api/runs',
      { report: { padding: 'x'.repeat(513 * 1024) } },
      cookie,
    );
    expect(response.status).toBe(413);
  });
});

describe('CORS', () => {
  it('never reflects an unknown origin', async () => {
    const response = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows the exact configured origin with credentials', async () => {
    const configured = createApiApp({
      store,
      allowedOrigin: 'https://app.example',
      now: () => TEST_NOW,
    });
    const response = await configured.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example',
        'access-control-request-method': 'GET',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });
});
