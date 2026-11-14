import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { createApiApp } from '../src/api';
import { nep413MessageHash } from '../src/auth';
import { createStore, type PendingNonce, type RunStore } from '../src/store';

const SECRET = new Uint8Array(32).fill(21);
const ACCOUNT = 'carol.testnet';

interface Challenge {
  nonce: string;
  recipient: string;
  message: string;
  expiresAt: string;
}

let dataDir = '';
let clock = new Date('2099-01-01T00:00:00.000Z');
let saved: Map<string, PendingNonce>;
let calls: { saves: number; takes: number };
let app: ReturnType<typeof createApiApp>;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'airbag-nonce-'));
  clock = new Date('2099-01-01T00:00:00.000Z');
  saved = new Map();
  calls = { saves: 0, takes: 0 };
  const base = createStore({ databaseUrl: null, dataDir, quiet: true });
  const store: RunStore = {
    backend: base.backend,
    ensureUser: (accountId) => base.ensureUser(accountId),
    createSession: (accountId, tokenHash, expiresAt) =>
      base.createSession(accountId, tokenHash, expiresAt),
    getSession: (tokenHash) => base.getSession(tokenHash),
    deleteSession: (tokenHash) => base.deleteSession(tokenHash),
    saveRun: (accountId, report) => base.saveRun(accountId, report),
    listRuns: (accountId, limit) => base.listRuns(accountId, limit),
    getRun: (accountId, id) => base.getRun(accountId, id),
    saveNonce: async (nonce, pending) => {
      calls.saves += 1;
      saved.set(nonce, pending);
    },
    takeNonce: async (nonce) => {
      calls.takes += 1;
      const pending = saved.get(nonce) ?? null;
      saved.delete(nonce);
      return pending;
    },
  };
  app = createApiApp({ store, allowedOrigin: null, now: () => clock });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function post(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function challenge(): Promise<Challenge> {
  const response = await post('/api/auth/nonce', { accountId: ACCOUNT });
  expect(response.status).toBe(200);
  return (await response.json()) as Challenge;
}

function signed(c: Challenge): Record<string, string> {
  const hash = nep413MessageHash({
    message: c.message,
    nonce: new Uint8Array(Buffer.from(c.nonce, 'base64')),
    recipient: c.recipient,
  });
  return {
    accountId: ACCOUNT,
    publicKey: `ed25519:${base58.encode(ed25519.getPublicKey(SECRET))}`,
    signature: Buffer.from(ed25519.sign(hash, SECRET)).toString('base64'),
    nonce: c.nonce,
    message: c.message,
    recipient: c.recipient,
  };
}

describe('nonces kept in a shared store', () => {
  it('signs in through saveNonce and takeNonce and sets a session', async () => {
    const c = await challenge();
    expect(calls.saves).toBe(1);
    expect(saved.get(c.nonce)?.accountId).toBe(ACCOUNT);
    expect(saved.get(c.nonce)?.expiresAt).toBe(Date.parse(c.expiresAt));

    const verify = await post('/api/auth/verify', signed(c));
    expect(verify.status).toBe(200);
    expect(await verify.json()).toEqual({ accountId: ACCOUNT });
    expect(calls.takes).toBe(1);
    expect(verify.headers.get('set-cookie')).toContain('airbag_session=');
  });

  it('consumes a nonce on first use', async () => {
    const c = await challenge();
    const body = signed(c);
    expect((await post('/api/auth/verify', body)).status).toBe(200);

    const replay = await post('/api/auth/verify', body);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({
      error: 'Nonce is unknown or expired. Request a new one.',
    });
  });

  it('rejects an expired nonce', async () => {
    const c = await challenge();
    clock = new Date(Date.parse(c.expiresAt) + 1);
    const response = await post('/api/auth/verify', signed(c));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Nonce is unknown or expired. Request a new one.',
    });
  });

  it('rejects an unknown nonce', async () => {
    const c = await challenge();
    saved.clear();
    const response = await post('/api/auth/verify', signed(c));
    expect(response.status).toBe(400);
  });
});
