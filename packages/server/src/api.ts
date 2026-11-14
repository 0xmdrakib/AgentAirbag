import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { runReportSchema } from '@airbag/core';
import {
  NONCE_TTL_MS,
  createSessionToken,
  hashSessionToken,
  isValidAccountId,
  issueNonce,
  readSessionCookie,
  sessionCookie,
  verifyNearSignature,
} from './auth';
import { createStore, type PendingNonce, type RunStore } from './store';

const MAX_REPORT_BYTES = 512 * 1024;
const MAX_PENDING_NONCES = 10_000;
const RUNS_LIMIT = 20;

interface ApiEnv {
  Variables: {
    accountId: string;
  };
}

export interface CreateApiOptions {
  store?: RunStore;
  /** Defaults to AIRBAG_DATA_DIR, then ".data". Ignored when store is set. */
  dataDir?: string;
  /** Pass null to force the local store. Ignored when store is set. */
  databaseUrl?: string | null;
  /** Test seam for nonce and session expiry. */
  now?: () => Date;
  /** Defaults to AIRBAG_AUTH_RECIPIENT, then the request host. */
  recipient?: string;
  /** Defaults to AIRBAG_ALLOWED_ORIGIN. Pass null to force same-origin only. */
  allowedOrigin?: string | null;
  nonceTtlMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(c: Context<ApiEnv>): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await c.req.json();
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isSecureRequest(c: Context<ApiEnv>): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  if (new URL(c.req.url).protocol === 'https:') return true;
  return (c.req.header('x-forwarded-proto') ?? '').split(',')[0]?.trim().toLowerCase() === 'https';
}

function normalizeAllowedOrigin(raw: string | null | undefined): string | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`AIRBAG_ALLOWED_ORIGIN must be a valid origin (got "${value}").`);
  }
  if (url.origin === 'null' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('AIRBAG_ALLOWED_ORIGIN must be a bare origin such as https://app.example.com.');
  }
  return url.origin;
}

function resolveRecipient(c: Context<ApiEnv>, override: string | undefined): string {
  if (override && override.trim().length > 0) return override.trim();
  const fromEnv = process.env.AIRBAG_AUTH_RECIPIENT;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  return new URL(c.req.url).host;
}

/**
 * Builds the /api router. Mount it at the root of a server (it already declares
 * /api/... routes); no server is started here.
 */
export function createApiApp(options: CreateApiOptions = {}): Hono<ApiEnv> {
  const store =
    options.store ??
    createStore({
      dataDir: options.dataDir,
      databaseUrl: options.databaseUrl,
    });
  const now = options.now ?? (() => new Date());
  const nonceTtlMs = options.nonceTtlMs ?? NONCE_TTL_MS;
  const recipientOverride = options.recipient ?? process.env.AIRBAG_AUTH_RECIPIENT;
  const allowedOrigin = normalizeAllowedOrigin(
    options.allowedOrigin === undefined ? process.env.AIRBAG_ALLOWED_ORIGIN : options.allowedOrigin,
  );

  const pendingNonces = new Map<string, PendingNonce>();

  function pruneNonces(nowMs: number): void {
    for (const [nonce, pending] of pendingNonces) {
      if (pending.expiresAt <= nowMs) pendingNonces.delete(nonce);
    }
    while (pendingNonces.size >= MAX_PENDING_NONCES) {
      const oldest = pendingNonces.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      pendingNonces.delete(oldest);
    }
  }

  const api = new Hono<ApiEnv>();

  api.use(
    '*',
    cors({
      origin: (origin, c) => {
        if (!origin) return undefined;
        if (allowedOrigin) return origin === allowedOrigin ? origin : undefined;
        return origin === new URL(c.req.url).origin ? origin : undefined;
      },
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      credentials: true,
      maxAge: 600,
    }),
  );

  const requireSession = async (
    c: Context<ApiEnv>,
    next: () => Promise<void>,
  ): Promise<Response | void> => {
    const token = readSessionCookie(c.req.header('cookie'));
    if (!token) return c.json({ error: 'Authentication required' }, 401);
    const accountId = await store.getSession(hashSessionToken(token));
    if (!accountId) return c.json({ error: 'Authentication required' }, 401);
    c.set('accountId', accountId);
    await next();
  };

  api.get('/health', (c) =>
    c.json({ ok: true, db: store.backend, network: process.env.NEAR_NETWORK || 'testnet' }),
  );

  api.post('/auth/nonce', async (c) => {
    const body = (await readJson(c)) ?? {};
    const rawAccountId = body['accountId'];
    if (rawAccountId !== undefined && typeof rawAccountId !== 'string') {
      return c.json({ error: 'accountId must be a string when provided.' }, 400);
    }
    const accountId = typeof rawAccountId === 'string' ? rawAccountId.trim() : undefined;
    if (accountId !== undefined && !isValidAccountId(accountId)) {
      return c.json({ error: 'accountId is not a valid NEAR account id.' }, 400);
    }

    const time = now();
    const issued = issueNonce({
      recipient: resolveRecipient(c, recipientOverride),
      accountId,
      now: time,
      ttlMs: nonceTtlMs,
    });
    const expiresAt = Date.parse(issued.expiresAt);
    const pending: PendingNonce = {
      accountId,
      recipient: issued.recipient,
      message: issued.message,
      expiresAt,
    };
    if (store.saveNonce) {
      await store.saveNonce(issued.nonce, pending);
    } else {
      pruneNonces(time.getTime());
      pendingNonces.set(issued.nonce, pending);
    }
    return c.json(issued);
  });

  api.post('/auth/verify', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'Expected a JSON body.' }, 400);

    const accountId = stringField(body, 'accountId');
    const publicKey = stringField(body, 'publicKey');
    const signature = stringField(body, 'signature');
    const nonce = stringField(body, 'nonce');
    const message = stringField(body, 'message');
    const recipient = stringField(body, 'recipient');
    if (!accountId || !publicKey || !signature || !nonce || !message || !recipient) {
      return c.json(
        { error: 'accountId, publicKey, signature, nonce, message and recipient are required.' },
        400,
      );
    }
    if (!isValidAccountId(accountId)) {
      return c.json({ error: 'accountId is not a valid NEAR account id.' }, 400);
    }

    const rawCallbackUrl = body['callbackUrl'];
    if (rawCallbackUrl !== undefined && typeof rawCallbackUrl !== 'string') {
      return c.json({ error: 'callbackUrl must be a string when provided.' }, 400);
    }
    const callbackUrl = typeof rawCallbackUrl === 'string' ? rawCallbackUrl : undefined;

    const time = now();
    // A shared store consumes the nonce atomically here; the in-memory path deletes it on success.
    const pending = store.takeNonce ? await store.takeNonce(nonce) : pendingNonces.get(nonce);
    if (!pending || pending.expiresAt <= time.getTime()) {
      if (!store.takeNonce) pendingNonces.delete(nonce);
      return c.json({ error: 'Nonce is unknown or expired. Request a new one.' }, 400);
    }
    if (pending.accountId !== undefined && pending.accountId !== accountId) {
      return c.json({ error: 'Nonce was issued for a different account.' }, 400);
    }
    if (pending.recipient !== recipient || pending.message !== message) {
      return c.json({ error: 'Signed message does not match the issued challenge.' }, 400);
    }

    const result = verifyNearSignature({
      accountId,
      publicKey,
      signature,
      nonce,
      message,
      recipient,
      callbackUrl,
    });
    if (!result.valid) return c.json({ error: result.error }, 401);

    if (!store.takeNonce) pendingNonces.delete(nonce);
    await store.ensureUser(accountId);
    const session = createSessionToken(time);
    await store.createSession(accountId, session.tokenHash, session.expiresAt);
    c.header('Set-Cookie', sessionCookie(session.token, { secure: isSecureRequest(c) }));
    return c.json({ accountId });
  });

  api.post('/auth/logout', async (c) => {
    const token = readSessionCookie(c.req.header('cookie'));
    if (token) await store.deleteSession(hashSessionToken(token));
    c.header('Set-Cookie', sessionCookie('', { secure: isSecureRequest(c), maxAgeSeconds: 0 }));
    return c.json({ ok: true });
  });

  api.get('/me', async (c) => {
    // A signed-out visitor is a normal state, not an error, so this returns 200 with null.
    const token = readSessionCookie(c.req.header('cookie'));
    if (!token) return c.json({ accountId: null });
    const accountId = await store.getSession(hashSessionToken(token));
    return c.json({ accountId: accountId ?? null });
  });

  api.post(
    '/runs',
    requireSession,
    bodyLimit({
      maxSize: MAX_REPORT_BYTES,
      onError: (c) => c.json({ error: 'Run report exceeds 512 KB.' }, 413),
    }),
    async (c) => {
      const body = await readJson(c);
      if (!body) return c.json({ error: 'Expected a JSON body with a report.' }, 400);

      const parsed = runReportSchema.safeParse(body['report']);
      if (!parsed.success) {
        return c.json(
          {
            error: 'Invalid run report.',
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
          400,
        );
      }

      const saved = await store.saveRun(c.get('accountId'), parsed.data);
      return c.json(saved);
    },
  );

  api.get('/runs', requireSession, async (c) =>
    c.json(await store.listRuns(c.get('accountId'), RUNS_LIMIT)),
  );

  api.get('/runs/:id', requireSession, async (c) => {
    const id = c.req.param('id');
    if (!id || id.length > 128) return c.json({ error: 'Run not found.' }, 404);
    const run = await store.getRun(c.get('accountId'), id);
    if (!run) return c.json({ error: 'Run not found.' }, 404);
    return c.json(run.report);
  });

  const app = new Hono<ApiEnv>();
  app.route('/api', api);
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Internal server error.' }, 500);
  });
  return app;
}
