import type { RunReport } from '@airbag/core';

const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function statusMessage(status: number): string {
  if (status === 401) return 'Your wallet session has expired. Connect again.';
  if (status === 403) return 'The server refused this request.';
  if (status === 404) return 'The Airbag API is not running. The simulator still works.';
  if (status === 409) return 'This report is already saved.';
  if (status === 413) return 'This report is too large to save.';
  if (status === 429) return 'The server is busy. Try again in a moment.';
  if (status >= 500) {
    return `The Airbag API answered with an error (${status}). The simulator still works.`;
  }
  return `The request failed (${status}).`;
}

async function errorDetail(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const data: unknown = await response.json();
      if (isRecord(data)) {
        return asString(data.error) ?? asString(data.message);
      }
      return null;
    }
    const text = (await response.text()).trim();
    if (!text || /^<!doctype/i.test(text) || /^<html/i.test(text)) return null;
    return text.length > 200 ? `${text.slice(0, 200)}...` : text;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Cannot reach the Airbag API. The simulator still works.', 0);
  }

  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new ApiError(detail ?? statusMessage(response.status), response.status);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    // A dev server answers unknown paths with index.html. That is a missing API, not a crash.
    throw new ApiError('The Airbag API is not running. The simulator still works.', 0);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('The API returned a response the app could not read.', 0);
  }
}

function readAccountId(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const user = isRecord(raw.user) ? raw.user : {};
  const data = isRecord(raw.data) ? raw.data : {};
  return (
    asString(raw.accountId) ??
    asString(raw.account) ??
    asString(user.accountId) ??
    asString(data.accountId)
  );
}

export interface AuthSession {
  accountId: string | null;
}

export interface AuthChallenge {
  nonce: string;
  message: string;
  recipient: string;
}

export interface VerifyRequest {
  accountId: string;
  publicKey: string;
  signature: string;
  nonce: string;
  message: string;
  recipient: string;
  callbackUrl?: string;
}

export interface RunSummary {
  id: string;
  createdAt: string;
  hash: string;
  agentId: string;
  agentLabel: string;
  grade: string;
  score: number;
  lossUsd: string;
  passed: number;
  warned: number;
  failed: number;
  scenarioCount: number;
}

export interface SavedRun extends RunSummary {
  report: RunReport | null;
}

export async function getHealth(): Promise<{ ok: boolean }> {
  const raw = await request<unknown>('/health');
  return { ok: isRecord(raw) ? raw.ok !== false : true };
}

export async function fetchMe(): Promise<AuthSession> {
  const raw = await request<unknown>('/me');
  return { accountId: readAccountId(raw) };
}

export async function getAuthNonce(): Promise<AuthChallenge> {
  const raw = await request<unknown>('/auth/nonce', { method: 'POST' });
  const record = isRecord(raw) ? raw : {};
  const challenge = isRecord(record.challenge) ? record.challenge : record;
  const nonce = asString(challenge.nonce);
  const message = asString(challenge.message);
  const recipient = asString(challenge.recipient);
  if (!nonce || !message || !recipient) {
    throw new ApiError('The auth service returned an incomplete sign-in challenge.', 502);
  }
  return { nonce, message, recipient };
}

export async function verifyAuth(payload: VerifyRequest): Promise<AuthSession> {
  const raw = await request<unknown>('/auth/verify', { method: 'POST', body: payload });
  return { accountId: readAccountId(raw) };
}

export async function logout(): Promise<void> {
  await request<unknown>('/auth/logout', { method: 'POST' });
}

function asReport(value: unknown): RunReport | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.overall) || Array.isArray(value.laws)) {
    return value as unknown as RunReport;
  }
  return null;
}

function normalizeRun(raw: unknown): SavedRun | null {
  if (!isRecord(raw)) return null;

  const inner = isRecord(raw.run) ? raw.run : raw;
  const report = asReport(inner.report) ?? asReport(inner);
  const overall =
    report && isRecord(report.overall)
      ? (report.overall as unknown as JsonRecord)
      : isRecord(inner.overall)
        ? inner.overall
        : {};

  const id =
    asString(inner.id) ??
    asString(inner.runId) ??
    asString(inner._id) ??
    asString(raw.id) ??
    report?.hash ??
    '';
  const hash = asString(inner.hash) ?? asString(raw.hash) ?? report?.hash ?? id;
  const createdAt =
    asString(inner.createdAt) ??
    asString(inner.savedAt) ??
    asString(inner.created_at) ??
    asString(inner.saved_at) ??
    asString(inner.date) ??
    '';
  const passed = asNumber(inner.passed) ?? asNumber(overall.passed) ?? 0;
  const warned = asNumber(inner.warned) ?? asNumber(overall.warned) ?? 0;
  const failed = asNumber(inner.failed) ?? asNumber(overall.failed) ?? 0;

  return {
    id,
    createdAt,
    hash,
    agentId: asString(inner.agentId) ?? report?.agent.id ?? '',
    agentLabel: asString(inner.agentLabel) ?? asString(inner.agent) ?? report?.agent.label ?? '',
    grade: asString(inner.grade) ?? asString(overall.grade) ?? '',
    score: asNumber(inner.score) ?? asNumber(overall.score) ?? 0,
    lossUsd: asText(inner.lossUsd) ?? asText(inner.loss) ?? asText(overall.simulatedLossUsd) ?? '0',
    passed,
    warned,
    failed,
    scenarioCount:
      asNumber(inner.scenarioCount) ??
      report?.suite.scenarioCount ??
      passed + warned + failed,
    report,
  };
}

function summaryFromReport(report: RunReport): SavedRun {
  return {
    id: report.hash,
    createdAt: '',
    hash: report.hash,
    agentId: report.agent.id,
    agentLabel: report.agent.label,
    grade: report.overall.grade,
    score: report.overall.score,
    lossUsd: report.overall.simulatedLossUsd,
    passed: report.overall.passed,
    warned: report.overall.warned,
    failed: report.overall.failed,
    scenarioCount: report.suite.scenarioCount,
    report,
  };
}

/** Save the report for the signed-in account. The server session identifies the owner. */
export async function saveRun(report: RunReport): Promise<SavedRun> {
  const raw = await request<unknown>('/runs', { method: 'POST', body: { report } });
  const stored = normalizeRun(raw);
  const summary = summaryFromReport(report);
  return {
    ...summary,
    id: stored?.id || summary.id,
    createdAt: stored?.createdAt || summary.createdAt,
    report,
  };
}

export async function listRuns(): Promise<RunSummary[]> {
  const raw = await request<unknown>('/runs');
  const items = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.runs)
      ? raw.runs
      : isRecord(raw) && Array.isArray(raw.data)
        ? raw.data
        : [];

  const runs: RunSummary[] = [];
  for (const item of items) {
    const run = normalizeRun(item);
    if (run?.id) runs.push(run);
  }

  return runs.sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return 0;
  });
}

export async function getRun(id: string): Promise<SavedRun> {
  const raw = await request<unknown>(`/runs/${encodeURIComponent(id)}`);
  const run = normalizeRun(raw);
  if (!run) {
    throw new ApiError('That run could not be read.', 502);
  }
  return run;
}

export function isApiUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 0 || error.status === 404 || error.status === 405 || error.status === 501)
  );
}

export function describeError(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
