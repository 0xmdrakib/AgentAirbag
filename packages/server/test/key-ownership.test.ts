import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { createApiApp } from '../src/api';
import { nep413MessageHash } from '../src/auth';
import { checkKeyOwnership, type KeyCheckResult } from '../src/nearKeys';
import { createStore } from '../src/store';

const SECRET = new Uint8Array(32).fill(31);
const PUBLIC_BYTES = ed25519.getPublicKey(SECRET);
const PUBLIC_KEY = `ed25519:${base58.encode(PUBLIC_BYTES)}`;
const IMPLICIT_ID = Buffer.from(PUBLIC_BYTES).toString('hex');

interface FetchStub {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; body: Record<string, unknown> }>;
}

function stubFetch(respond: (signal: AbortSignal | undefined) => Promise<Response>): FetchStub {
  const calls: FetchStub['calls'] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return respond(init?.signal ?? undefined);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function check(
  stub: FetchStub,
  overrides: Partial<Parameters<typeof checkKeyOwnership>[0]> = {},
): Promise<KeyCheckResult> {
  return checkKeyOwnership({
    accountId: 'alice.testnet',
    publicKey: PUBLIC_KEY,
    network: 'testnet',
    fetchImpl: stub.fetchImpl,
    ...overrides,
  });
}

describe('checkKeyOwnership: implicit accounts', () => {
  it('accepts the matching key without a network call', async () => {
    const stub = stubFetch(() => json({}));
    expect(await check(stub, { accountId: IMPLICIT_ID })).toEqual({ ok: true });
    expect(stub.calls).toHaveLength(0);
  });

  it('rejects a different key without a network call', async () => {
    const other = `ed25519:${base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(32)))}`;
    const stub = stubFetch(() => json({}));
    const result = await check(stub, { accountId: IMPLICIT_ID, publicKey: other });
    expect(result).toMatchObject({ ok: false, reason: 'not-owner' });
    expect(stub.calls).toHaveLength(0);
  });
});

describe('checkKeyOwnership: named accounts', () => {
  it('asks the RPC for the access key at final finality', async () => {
    const stub = stubFetch(() =>
      json({ jsonrpc: '2.0', id: 'airbag', result: { nonce: 1, permission: 'FullAccess' } }),
    );
    expect(await check(stub)).toEqual({ ok: true });
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.url).toBe('https://rpc.testnet.near.org');
    expect(stub.calls[0]!.body).toMatchObject({
      method: 'query',
      params: {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: 'alice.testnet',
        public_key: PUBLIC_KEY,
      },
    });
  });

  it('uses the mainnet RPC and the rpcUrl override', async () => {
    const stub = stubFetch(() => json({ result: { permission: 'FullAccess' } }));
    await check(stub, { network: 'mainnet' });
    await check(stub, { rpcUrl: 'https://rpc.example.test' });
    expect(stub.calls.map((call) => call.url)).toEqual([
      'https://rpc.mainnet.near.org',
      'https://rpc.example.test',
    ]);
  });

  it('accepts a function-call key', async () => {
    const stub = stubFetch(() =>
      json({
        result: {
          nonce: 5,
          permission: { FunctionCall: { allowance: null, receiver_id: 'x.near', method_names: [] } },
        },
      }),
    );
    expect(await check(stub)).toEqual({ ok: true });
  });

  it('reports not-owner for UNKNOWN_ACCESS_KEY and UNKNOWN_ACCOUNT errors', async () => {
    for (const name of ['UNKNOWN_ACCESS_KEY', 'UNKNOWN_ACCOUNT']) {
      const stub = stubFetch(() =>
        json({ error: { name: 'HANDLER_ERROR', cause: { name, info: {} }, code: -32000 } }),
      );
      expect(await check(stub)).toMatchObject({ ok: false, reason: 'not-owner' });
    }
    const byName = stubFetch(() => json({ error: { name: 'UNKNOWN_ACCESS_KEY' } }));
    expect(await check(byName)).toMatchObject({ ok: false, reason: 'not-owner' });
  });

  it('reports not-owner for the result.error string style', async () => {
    const stub = stubFetch(() =>
      json({
        result: {
          error: `access key ${PUBLIC_KEY} does not exist while viewing`,
          logs: [],
          block_height: 1,
        },
      }),
    );
    expect(await check(stub)).toMatchObject({ ok: false, reason: 'not-owner' });
  });
});

describe('checkKeyOwnership: fails closed', () => {
  it('is unavailable when fetch rejects', async () => {
    const stub = stubFetch(() => Promise.reject(new Error('offline')));
    expect(await check(stub)).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('is unavailable on a non-200 answer', async () => {
    const stub = stubFetch(() => json({ result: { permission: 'FullAccess' } }, 503));
    expect(await check(stub)).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('is unavailable when the call times out', async () => {
    const stub = stubFetch(
      (signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    expect(await check(stub, { timeoutMs: 20 })).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('is unavailable for garbage, empty and unrelated replies', async () => {
    const garbage = stubFetch(() => Promise.resolve(new Response('not json', { status: 200 })));
    expect(await check(garbage)).toMatchObject({ ok: false, reason: 'unavailable' });
    for (const body of [null, [], {}, { result: {} }, { error: { name: 'INTERNAL_ERROR' } }]) {
      expect(await check(stubFetch(() => json(body)))).toMatchObject({
        ok: false,
        reason: 'unavailable',
      });
    }
    const other = stubFetch(() => json({ result: { error: 'something else broke' } }));
    expect(await check(other)).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

describe('POST /api/auth/verify key ownership', () => {
  let dataDir = '';
  let app: ReturnType<typeof createApiApp>;
  let outcome: KeyCheckResult;
  let seen: Array<{ accountId: string; publicKey: string }>;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'airbag-keys-'));
    seen = [];
    outcome = { ok: true };
    app = createApiApp({
      store: createStore({ databaseUrl: null, dataDir, quiet: true }),
      allowedOrigin: null,
      keyCheck: async (input) => {
        seen.push(input);
        return outcome;
      },
    });
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  async function login(): Promise<Response> {
    const nonceResponse = await app.request('/api/auth/nonce', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'alice.testnet' }),
    });
    const challenge = (await nonceResponse.json()) as {
      nonce: string;
      recipient: string;
      message: string;
    };
    const hash = nep413MessageHash({
      message: challenge.message,
      nonce: new Uint8Array(Buffer.from(challenge.nonce, 'base64')),
      recipient: challenge.recipient,
    });
    return app.request('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: 'alice.testnet',
        publicKey: PUBLIC_KEY,
        signature: Buffer.from(ed25519.sign(hash, SECRET)).toString('base64'),
        nonce: challenge.nonce,
        message: challenge.message,
        recipient: challenge.recipient,
      }),
    });
  }

  it('signs in when the key belongs to the account', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('airbag_session=');
    expect(seen).toEqual([{ accountId: 'alice.testnet', publicKey: PUBLIC_KEY }]);
  });

  it('answers 401 and sets no cookie when the key is not an access key', async () => {
    outcome = { ok: false, reason: 'not-owner', message: 'nope' };
    const response = await login();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'That key is not an access key of this NEAR account.',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('answers 503 and sets no cookie when the check is unavailable', async () => {
    outcome = { ok: false, reason: 'unavailable', message: 'down' };
    const response = await login();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Could not check the key against the NEAR network. Try again in a moment.',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
