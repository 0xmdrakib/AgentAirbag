import { createHash } from 'node:crypto';

/**
 * Fixed-window rate limiting. The counter itself lives in the store (a Postgres row on Neon, a
 * Map locally) so that every serverless instance sees the same number.
 *
 * The limits are deliberately loose: they exist to stop scripts that hammer the sign-in and save
 * endpoints, not to meter a person using the site. A shared office address must still work.
 */

export interface RateRule {
  /** Short stable name, part of the stored key. */
  name: string;
  /** Requests allowed in one window. */
  limit: number;
  windowMs: number;
}

/** Counts one hit for `bucket` in the window that contains `nowMs` and returns the new count. */
export type RateHit = (bucket: string, windowMs: number, nowMs: number) => Promise<number>;

export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Limits applied by the API. Per IP unless the name says account. */
export const RATE_RULES = {
  /** One sign-in asks for one or two nonces. */
  nonce: { name: 'nonce-ip-min', limit: 40, windowMs: MINUTE },
  verify: { name: 'verify-ip-min', limit: 20, windowMs: MINUTE },
  verifyDay: { name: 'verify-ip-day', limit: 200, windowMs: DAY },
  saveIp: { name: 'save-ip-min', limit: 30, windowMs: MINUTE },
  saveIpDay: { name: 'save-ip-day', limit: 300, windowMs: DAY },
  saveAccount: { name: 'save-acct-min', limit: 20, windowMs: MINUTE },
} satisfies Record<string, RateRule>;

export function windowStart(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

/** In-memory counter used by the local store and as a fallback. Per process only. */
export function createMemoryHit(): RateHit {
  const counters = new Map<string, { start: number; count: number }>();

  return async (bucket, windowMs, nowMs) => {
    const start = windowStart(nowMs, windowMs);
    if (counters.size > 5000) {
      for (const [key, entry] of counters) {
        if (entry.start < start) counters.delete(key);
      }
    }
    const current = counters.get(bucket);
    if (!current || current.start !== start) {
      counters.set(bucket, { start, count: 1 });
      return 1;
    }
    current.count += 1;
    return current.count;
  };
}

/**
 * Counts a hit and decides. A failing counter never blocks anyone: if the store cannot answer,
 * the request goes through, because refusing real users is the worse failure here.
 */
export async function checkRate(
  hit: RateHit,
  rule: RateRule,
  subject: string,
  nowMs: number,
): Promise<RateDecision> {
  try {
    const count = await hit(`${rule.name}:${subject}`, rule.windowMs, nowMs);
    if (count <= rule.limit) return { allowed: true, retryAfterSeconds: 0 };
    const endsAt = windowStart(nowMs, rule.windowMs) + rule.windowMs;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((endsAt - nowMs) / 1000)) };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * The caller's address. The live site sits behind Cloudflare, so Vercel's own headers name a
 * Cloudflare edge address that many visitors share; Cloudflare puts the real visitor address in
 * CF-Connecting-IP, which comes first. Without Cloudflare the host's headers are used (Vercel
 * sets them itself). A forged value only moves the forger to another bucket: it never grants
 * access, and the limits are loose enough that one address is never a whole site.
 */
const ADDRESS_HEADERS = [
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'x-real-ip',
  'x-forwarded-for',
];

export function clientAddress(headers: { get(name: string): string | null }): string {
  for (const name of ADDRESS_HEADERS) {
    const value = headers.get(name);
    if (value && value.trim()) return value.split(',')[0]!.trim();
  }
  return 'unknown';
}

/** Addresses are hashed before they are stored, so the table holds no raw IPs. */
export function subjectForAddress(address: string): string {
  return createHash('sha256').update(`airbag-rate:${address}`).digest('hex').slice(0, 24);
}

export function rateLimitedMessage(retryAfterSeconds: number): string {
  const wait =
    retryAfterSeconds >= 120
      ? `${Math.ceil(retryAfterSeconds / 60)} minutes`
      : `${retryAfterSeconds} seconds`;
  return `Too many requests. Wait ${wait} and try again.`;
}
