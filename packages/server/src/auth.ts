import { createHash, randomBytes } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { base58 } from '@scure/base';

/** NEP-413 tags off-chain messages with 2^31 + 413 so they cannot be transactions. */
export const NEP413_TAG = 2 ** 31 + 413;

export const SESSION_COOKIE_NAME = 'airbag_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
export const NONCE_TTL_MS = 5 * 60 * 1000;

const ACCOUNT_ID_PATTERN = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function isValidAccountId(value: string): boolean {
  return value.length >= 2 && value.length <= 64 && ACCOUNT_ID_PATTERN.test(value);
}

export interface Nep413Payload {
  message: string;
  /** Exactly 32 bytes. No length prefix is written for this field. */
  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function borshString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return concatBytes(u32le(bytes.length), bytes);
}

/**
 * Borsh encoding of the NEP-413 payload: u32 tag, message, fixed 32-byte nonce,
 * recipient, and Option<string> callbackUrl. Borsh is small enough here that a
 * hand-written encoder is clearer than a dependency.
 */
export function encodeNep413Payload(payload: Nep413Payload): Uint8Array {
  if (payload.nonce.length !== 32) {
    throw new Error(`NEP-413 nonce must be exactly 32 bytes (got ${payload.nonce.length}).`);
  }
  const callback =
    payload.callbackUrl === undefined
      ? new Uint8Array([0])
      : concatBytes(new Uint8Array([1]), borshString(payload.callbackUrl));
  return concatBytes(
    u32le(NEP413_TAG),
    borshString(payload.message),
    payload.nonce,
    borshString(payload.recipient),
    callback,
  );
}

/** SHA-256 of the serialized payload: the exact 32 bytes a NEAR key signs. */
export function nep413MessageHash(payload: Nep413Payload): Uint8Array {
  return new Uint8Array(createHash('sha256').update(encodeNep413Payload(payload)).digest());
}

export interface IssueNonceOptions {
  recipient: string;
  accountId?: string;
  now?: Date;
  ttlMs?: number;
}

export interface IssuedNonce {
  nonce: string;
  recipient: string;
  message: string;
  expiresAt: string;
}

/** Creates a fresh 32-byte challenge and the human-readable message to sign. */
export function issueNonce(options: IssueNonceOptions): IssuedNonce {
  const recipient = options.recipient.trim();
  if (!recipient) throw new Error('A recipient is required to issue a NEP-413 nonce.');

  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? NONCE_TTL_MS;
  const nonce = randomBytes(32).toString('base64');
  const accountLine = options.accountId ? ` for the account ${options.accountId}` : '';
  const message = [
    'Airbag authentication request',
    '',
    `Sign this message to authenticate${accountLine}.`,
    `Recipient: ${recipient}`,
    `Nonce: ${nonce}`,
    `Issued: ${now.toISOString()}`,
  ].join('\n');

  return {
    nonce,
    recipient,
    message,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export interface NearSignatureInput {
  accountId: string;
  /** "ed25519:<base58>" or "secp256k1:<base58>". */
  publicKey: string;
  /** Base64 signature bytes. */
  signature: string;
  /** Base64 of the exact 32-byte nonce. */
  nonce: string;
  message: string;
  recipient: string;
  callbackUrl?: string;
}

export type NearSignatureVerification = { valid: true } | { valid: false; error: string };

type ParsedKey =
  { curve: 'ed25519'; bytes: Uint8Array } | { curve: 'secp256k1'; bytes: Uint8Array };

function invalid(error: string): NearSignatureVerification {
  return { valid: false, error };
}

function decodeBase64(value: string): Uint8Array | undefined {
  if (!BASE64_PATTERN.test(value)) return undefined;
  const bytes = new Uint8Array(Buffer.from(value, 'base64'));
  return bytes.length > 0 ? bytes : undefined;
}

function parsePublicKey(value: string): ParsedKey | { error: string } {
  const parts = value.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { error: 'Public key must be formatted as "<ed25519|secp256k1>:<base58>".' };
  }

  let decoded: Uint8Array;
  try {
    decoded = base58.decode(parts[1]);
  } catch {
    return { error: 'Public key is not valid base58.' };
  }

  const curve = parts[0].toLowerCase();
  if (curve === 'ed25519') {
    if (decoded.length !== 32) {
      return {
        error: `Invalid ed25519 public key length: expected 32 bytes, got ${decoded.length}.`,
      };
    }
    return { curve: 'ed25519', bytes: decoded };
  }

  if (curve === 'secp256k1') {
    // NEAR stores secp256k1 keys as 64 raw bytes and re-adds the SEC1 0x04
    // prefix for verification. Accept compressed and prefixed forms too.
    if (decoded.length === 64)
      return { curve: 'secp256k1', bytes: concatBytes(new Uint8Array([4]), decoded) };
    if (decoded.length === 65) return { curve: 'secp256k1', bytes: decoded };
    if (decoded.length === 33) return { curve: 'secp256k1', bytes: decoded };
    return {
      error: `Invalid secp256k1 public key length: expected 33, 64 or 65 bytes, got ${decoded.length}.`,
    };
  }

  return { error: `Unsupported public key curve "${parts[0]}"; expected ed25519 or secp256k1.` };
}

/**
 * Verifies a NEP-413 signature locally. This proves possession of the private
 * key, but NEAR keys are per-account: without an RPC lookup of the account's
 * access keys, the caller-supplied accountId is not cryptographically bound to
 * the key. Callers that need that guarantee must check the key on-chain.
 */
export function verifyNearSignature(input: NearSignatureInput): NearSignatureVerification {
  if (typeof input.accountId !== 'string' || !isValidAccountId(input.accountId)) {
    return invalid('Account id is not a valid NEAR account id.');
  }
  if (typeof input.message !== 'string' || input.message.length === 0) {
    return invalid('Message is required.');
  }
  if (typeof input.recipient !== 'string' || input.recipient.trim().length === 0) {
    return invalid('Recipient is required.');
  }
  if (input.callbackUrl !== undefined && typeof input.callbackUrl !== 'string') {
    return invalid('Callback URL must be a string when provided.');
  }

  const nonce = decodeBase64(input.nonce);
  if (!nonce) return invalid('Nonce is not valid base64.');
  if (nonce.length !== 32) return invalid(`Nonce must be exactly 32 bytes (got ${nonce.length}).`);

  const key = parsePublicKey(input.publicKey);
  if ('error' in key) return invalid(key.error);

  const signature = decodeBase64(input.signature);
  if (!signature) return invalid('Signature is not valid base64.');

  if (key.curve === 'ed25519') {
    if (signature.length !== 64) {
      return invalid(
        `Invalid ed25519 signature length: expected 64 bytes, got ${signature.length}.`,
      );
    }
  } else if (signature.length !== 64 && signature.length !== 65) {
    return invalid(
      `Invalid secp256k1 signature length: expected 64 or 65 bytes, got ${signature.length}.`,
    );
  }

  let hash: Uint8Array;
  try {
    hash = nep413MessageHash({
      message: input.message,
      nonce,
      recipient: input.recipient,
      callbackUrl: input.callbackUrl,
    });
  } catch (error) {
    return invalid(
      error instanceof Error ? error.message : 'Could not encode the NEP-413 payload.',
    );
  }

  try {
    if (key.curve === 'ed25519') {
      return ed25519.verify(signature, hash, key.bytes, { zip215: false })
        ? { valid: true }
        : invalid('Signature does not match the NEP-413 payload.');
    }

    // NEAR emits r || s || recoveryId (65 bytes); noble verifies r || s.
    const compact = signature.length === 65 ? signature.subarray(0, 64) : signature;
    return secp256k1.verify(compact, hash, key.bytes, { prehash: false })
      ? { valid: true }
      : invalid('Signature does not match the NEP-413 payload.');
  } catch {
    return invalid('Signature verification failed for the supplied public key.');
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface SessionToken {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

/** Creates a 32-byte hex bearer token and the SHA-256 hash that is persisted. */
export function createSessionToken(now: Date = new Date()): SessionToken {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
}

export interface SessionCookieOptions {
  secure?: boolean;
  maxAgeSeconds?: number;
}

export function sessionCookie(token: string, options: SessionCookieOptions = {}): string {
  const maxAge = options.maxAgeSeconds ?? SESSION_TTL_SECONDS;
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Reads the session token out of a raw Cookie header. */
export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
