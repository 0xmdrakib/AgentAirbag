import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';
import type { RunReportInput } from '@airbag/core';
import { createMemoryHit, windowStart, type RateHit } from './rateLimit';

export type StoreBackend = 'neon' | 'local';

/** Newest runs kept per account. Older ones are removed when a new run is saved. */
export const MAX_RUNS_PER_ACCOUNT = 50;
/** Newest sessions kept per account, so repeated sign-ins cannot pile up rows. */
export const MAX_SESSIONS_PER_ACCOUNT = 10;

export interface RunSummary {
  id: string;
  createdAt: string;
  hash: string;
  grade: string;
  score: number;
  lossUsd: string;
  passed: number;
  failed: number;
}

export interface SavedRun {
  id: string;
  createdAt: string;
  report: RunReportInput;
}

export interface PendingNonce {
  accountId?: string;
  recipient: string;
  message: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface RunStore {
  readonly backend: StoreBackend;
  /**
   * Optional shared nonce storage for hosts where one instance may issue a nonce and another
   * verify it (serverless). When absent, the API keeps nonces in process memory.
   */
  saveNonce?(nonce: string, pending: PendingNonce): Promise<void>;
  /** Atomically removes and returns a nonce, so it is single use. */
  takeNonce?(nonce: string): Promise<PendingNonce | null>;
  /** Counts a request against a rate-limit bucket. When absent the API counts in memory. */
  hit?: RateHit;
  ensureUser(accountId: string): Promise<void>;
  createSession(accountId: string, tokenHash: string, expiresAt: string): Promise<void>;
  /** Returns the account id for a live session, or null when missing/expired. */
  getSession(tokenHash: string): Promise<string | null>;
  deleteSession(tokenHash: string): Promise<void>;
  saveRun(accountId: string, report: RunReportInput): Promise<{ id: string; createdAt: string }>;
  listRuns(accountId: string, limit?: number): Promise<RunSummary[]>;
  getRun(accountId: string, id: string): Promise<SavedRun | null>;
}

export interface CreateStoreOptions {
  /** Pass null to force the local backend; undefined reads DATABASE_URL. */
  databaseUrl?: string | null;
  /** Defaults to AIRBAG_DATA_DIR, then ".data". */
  dataDir?: string;
  /** Suppress the one-line local-store notice (useful in tests). */
  quiet?: boolean;
}

export function createStore(options: CreateStoreOptions = {}): RunStore {
  const databaseUrl =
    options.databaseUrl === undefined ? process.env.DATABASE_URL : options.databaseUrl;
  if (databaseUrl && databaseUrl.trim().length > 0) {
    return new NeonStore(databaseUrl.trim());
  }

  const dataDir = options.dataDir ?? (process.env.AIRBAG_DATA_DIR || '.data');
  return new LocalStore(dataDir, options.quiet === true);
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * The API creates its own tables so it can boot before `pnpm db:migrate` runs.
 * Statements are split on ";" because the schema deliberately has no procedural
 * SQL or semicolons inside literals.
 */
export async function readSchemaStatements(): Promise<string[]> {
  let schema: string;
  try {
    schema = await readFile(new URL('../../../db/schema.sql', import.meta.url), 'utf8');
  } catch (error) {
    // A bundled build (the Vercel function) has no source tree next to it; the file ships with
    // the function and sits under the working directory.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    schema = await readFile(resolve(process.cwd(), 'db', 'schema.sql'), 'utf8');
  }
  return schema
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

type SqlClient = ReturnType<typeof neon>;

async function applyStatements(sql: SqlClient): Promise<string[]> {
  const statements = await readSchemaStatements();
  for (const statement of statements) {
    await sql.query(statement);
  }
  return statements;
}

/** Applies db/schema.sql through Neon. Used by the API bootstrap and db:migrate. */
export async function applySchema(databaseUrl: string): Promise<string[]> {
  return applyStatements(neon(databaseUrl));
}

export function describeSchemaStatement(statement: string): string {
  const match = /^CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/i.exec(statement);
  if (!match) return 'schema statement';
  return `${match[1]!.toLowerCase()} ${match[2]}`;
}

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid timestamp.');
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Neon backend
// ---------------------------------------------------------------------------

interface RunRow {
  id: string;
  created_at: unknown;
  hash?: string;
  grade: string;
  score: unknown;
  loss_usd: string;
  passed: number;
  failed: number;
  report?: unknown;
}

interface SessionRow {
  account_id: string;
}

interface NonceRow {
  account_id: string | null;
  recipient: string;
  message: string;
  expires_at: unknown;
}

class NeonStore implements RunStore {
  readonly backend = 'neon' as const;
  private readonly sql: SqlClient;
  private schemaReady: Promise<string[]> | undefined;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  private async ready(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = applyStatements(this.sql).catch((error: unknown) => {
        this.schemaReady = undefined;
        throw error;
      });
    }
    await this.schemaReady;
  }

  async ensureUser(accountId: string): Promise<void> {
    await this.ready();
    await this.sql.query(
      'INSERT INTO users (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING',
      [accountId],
    );
  }

  async saveNonce(nonce: string, pending: PendingNonce): Promise<void> {
    await this.ready();
    await this.sql.query('DELETE FROM auth_nonces WHERE expires_at < now()');
    await this.sql.query(
      `INSERT INTO auth_nonces (nonce, account_id, recipient, message, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        nonce,
        pending.accountId ?? null,
        pending.recipient,
        pending.message,
        new Date(pending.expiresAt).toISOString(),
      ],
    );
  }

  async takeNonce(nonce: string): Promise<PendingNonce | null> {
    await this.ready();
    const rows = (await this.sql.query(
      `DELETE FROM auth_nonces WHERE nonce = $1
       RETURNING account_id, recipient, message, expires_at`,
      [nonce],
    )) as unknown as NonceRow[];
    const row = rows[0];
    if (!row) return null;
    return {
      accountId: row.account_id ?? undefined,
      recipient: row.recipient,
      message: row.message,
      expiresAt: Date.parse(toIso(row.expires_at)),
    };
  }

  hit: RateHit = async (bucket, windowMs, nowMs) => {
    await this.ready();
    const start = new Date(windowStart(nowMs, windowMs)).toISOString();
    const rows = (await this.sql.query(
      `INSERT INTO rate_limits (bucket, window_start, hits) VALUES ($1, $2, 1)
       ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1
       RETURNING hits`,
      [bucket, start],
    )) as unknown as Array<{ hits: unknown }>;
    const hits = Number(rows[0]?.hits ?? 1);
    // A new window row was just created: a cheap moment to drop counters older than two days.
    if (hits === 1) {
      await this.sql.query(
        `DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`,
      );
    }
    return hits;
  };

  async createSession(accountId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await this.ready();
    await this.sql.query(
      `INSERT INTO sessions (token_hash, account_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO UPDATE
       SET account_id = EXCLUDED.account_id, expires_at = EXCLUDED.expires_at`,
      [tokenHash, accountId, expiresAt],
    );
    // Housekeeping: drop expired sessions, and keep only the newest few for this account.
    await this.sql.query('DELETE FROM sessions WHERE expires_at < now()');
    await this.sql.query(
      `DELETE FROM sessions
       WHERE account_id = $1
         AND token_hash NOT IN (
           SELECT token_hash FROM sessions WHERE account_id = $1
           ORDER BY created_at DESC LIMIT $2
         )`,
      [accountId, MAX_SESSIONS_PER_ACCOUNT],
    );
  }

  async getSession(tokenHash: string): Promise<string | null> {
    await this.ready();
    const rows = (await this.sql.query(
      'SELECT account_id FROM sessions WHERE token_hash = $1 AND expires_at > now() LIMIT 1',
      [tokenHash],
    )) as unknown as SessionRow[];
    return rows[0]?.account_id ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.ready();
    await this.sql.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async saveRun(
    accountId: string,
    report: RunReportInput,
  ): Promise<{ id: string; createdAt: string }> {
    await this.ready();
    const id = randomUUID();
    const rows = (await this.sql.query(
      `INSERT INTO runs (id, account_id, grade, score, loss_usd, passed, failed, report)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING created_at`,
      [
        id,
        accountId,
        report.overall.grade,
        report.overall.score,
        report.overall.simulatedLossUsd,
        report.overall.passed,
        report.overall.failed,
        JSON.stringify(report),
      ],
    )) as unknown as Array<{ created_at: unknown }>;
    // Keep only the newest runs for this account, so saving cannot grow the table without bound.
    await this.sql.query(
      `DELETE FROM runs
       WHERE account_id = $1
         AND id NOT IN (
           SELECT id FROM runs WHERE account_id = $1
           ORDER BY created_at DESC LIMIT $2
         )`,
      [accountId, MAX_RUNS_PER_ACCOUNT],
    );
    return { id, createdAt: toIso(rows[0]?.created_at) };
  }

  async listRuns(accountId: string, limit = 20): Promise<RunSummary[]> {
    await this.ready();
    const rows = (await this.sql.query(
      `SELECT id, created_at, grade, score, loss_usd, passed, failed, report->>'hash' AS hash
       FROM runs
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [accountId, limit],
    )) as unknown as RunRow[];
    return rows.map((row) => ({
      id: row.id,
      createdAt: toIso(row.created_at),
      hash: row.hash ?? '',
      grade: row.grade,
      score: Number(row.score),
      lossUsd: row.loss_usd,
      passed: Number(row.passed),
      failed: Number(row.failed),
    }));
  }

  async getRun(accountId: string, id: string): Promise<SavedRun | null> {
    await this.ready();
    const rows = (await this.sql.query(
      'SELECT id, created_at, report FROM runs WHERE account_id = $1 AND id = $2 LIMIT 1',
      [accountId, id],
    )) as unknown as RunRow[];
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      createdAt: toIso(row.created_at),
      report: parseStoredReport(row.report),
    };
  }
}

function parseStoredReport(value: unknown): RunReportInput {
  if (typeof value === 'string') return JSON.parse(value) as RunReportInput;
  return value as RunReportInput;
}

// ---------------------------------------------------------------------------
// Local JSON backend
// ---------------------------------------------------------------------------

interface LocalUser {
  createdAt: string;
}

interface LocalSession {
  accountId: string;
  expiresAt: string;
  createdAt: string;
}

interface LocalRun extends RunSummary {
  accountId: string;
  report: RunReportInput;
}

interface LocalData {
  users: Record<string, LocalUser>;
  sessions: Record<string, LocalSession>;
  runs: LocalRun[];
}

let localStoreNoticePrinted = false;

function emptyData(): LocalData {
  return { users: {}, sessions: {}, runs: [] };
}

class LocalStore implements RunStore {
  readonly backend = 'local' as const;
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(dataDir: string, quiet: boolean) {
    this.file = resolve(dataDir, 'airbag.json');
    if (!quiet && !localStoreNoticePrinted) {
      localStoreNoticePrinted = true;
      process.stderr.write('Using the local JSON store; set DATABASE_URL for Neon.\n');
    }
  }

  private async load(): Promise<LocalData> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyData();
      throw error;
    }

    const parsed = JSON.parse(raw) as Partial<LocalData>;
    return {
      users: parsed.users ?? {},
      sessions: parsed.sessions ?? {},
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    };
  }

  /** Writes to a sibling temp file, then renames, so readers never see partial JSON. */
  private async save(data: LocalData): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await rename(temp, this.file);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
  }

  private async mutate<T>(fn: (data: LocalData) => T): Promise<T> {
    let result!: T;
    const task = this.queue.then(async () => {
      const data = await this.load();
      result = fn(data);
      await this.save(data);
    });
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    await task;
    return result;
  }

  private async read<T>(fn: (data: LocalData) => T): Promise<T> {
    await this.queue;
    return fn(await this.load());
  }

  async ensureUser(accountId: string): Promise<void> {
    await this.mutate((data) => {
      if (!data.users[accountId]) {
        data.users[accountId] = { createdAt: new Date().toISOString() };
      }
    });
  }

  readonly hit: RateHit = createMemoryHit();

  async createSession(accountId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await this.mutate((data) => {
      data.sessions[tokenHash] = {
        accountId,
        expiresAt,
        createdAt: new Date().toISOString(),
      };
      // Housekeeping, as on Neon: drop expired sessions and keep the newest few per account.
      const nowMs = Date.now();
      const own: Array<[string, LocalSession]> = [];
      for (const [hash, session] of Object.entries(data.sessions)) {
        if (Date.parse(session.expiresAt) <= nowMs) {
          delete data.sessions[hash];
        } else if (session.accountId === accountId) {
          own.push([hash, session]);
        }
      }
      own
        .sort((left, right) => right[1].createdAt.localeCompare(left[1].createdAt))
        .slice(MAX_SESSIONS_PER_ACCOUNT)
        .forEach(([hash]) => {
          delete data.sessions[hash];
        });
    });
  }

  async getSession(tokenHash: string): Promise<string | null> {
    return this.read((data) => {
      const session = data.sessions[tokenHash];
      if (!session) return null;
      return Date.parse(session.expiresAt) > Date.now() ? session.accountId : null;
    });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.mutate((data) => {
      delete data.sessions[tokenHash];
    });
  }

  async saveRun(
    accountId: string,
    report: RunReportInput,
  ): Promise<{ id: string; createdAt: string }> {
    return this.mutate((data) => {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      data.runs.push({
        id,
        accountId,
        createdAt,
        hash: report.hash,
        grade: report.overall.grade,
        score: report.overall.score,
        lossUsd: report.overall.simulatedLossUsd,
        passed: report.overall.passed,
        failed: report.overall.failed,
        report,
      });
      // Keep only the newest runs for this account.
      const own = data.runs.filter((run) => run.accountId === accountId);
      if (own.length > MAX_RUNS_PER_ACCOUNT) {
        const drop = new Set(own.slice(0, own.length - MAX_RUNS_PER_ACCOUNT).map((run) => run.id));
        data.runs = data.runs.filter((run) => !drop.has(run.id));
      }
      return { id, createdAt };
    });
  }

  async listRuns(accountId: string, limit = 20): Promise<RunSummary[]> {
    return this.read((data) => {
      const runs: RunSummary[] = [];
      for (let index = data.runs.length - 1; index >= 0 && runs.length < limit; index -= 1) {
        const run = data.runs[index]!;
        if (run.accountId !== accountId) continue;
        runs.push({
          id: run.id,
          createdAt: run.createdAt,
          hash: run.hash ?? run.report.hash ?? '',
          grade: run.grade,
          score: run.score,
          lossUsd: run.lossUsd,
          passed: run.passed,
          failed: run.failed,
        });
      }
      return runs;
    });
  }

  async getRun(accountId: string, id: string): Promise<SavedRun | null> {
    return this.read((data) => {
      const run = data.runs.find((item) => item.id === id && item.accountId === accountId);
      if (!run) return null;
      return { id: run.id, createdAt: run.createdAt, report: run.report };
    });
  }
}
