import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { base58 } from '@scure/base';
import {
  NONCE_TTL_MS,
  SESSION_TTL_MS,
  createSessionToken,
  encodeNep413Payload,
  hashSessionToken,
  issueNonce,
  nep413MessageHash,
  readSessionCookie,
  sessionCookie,
  verifyNearSignature,
  type NearSignatureInput,
  type Nep413Payload,
} from '../src/auth';

const ED25519_SECRET = new Uint8Array(32).fill(7);
const ED25519_PUBLIC = ed25519.getPublicKey(ED25519_SECRET);

interface SignedLogin {
  input: NearSignatureInput;
  payload: Nep413Payload;
}

function ed25519Login(overrides: Partial<Nep413Payload> = {}): SignedLogin {
  const payload: Nep413Payload = {
    message: 'Sign in to Airbag',
    nonce: new Uint8Array(32).fill(3),
    recipient: 'airbag.test',
    ...overrides,
  };
  const signature = ed25519.sign(nep413MessageHash(payload), ED25519_SECRET);
  return {
    payload,
    input: {
      accountId: 'alice.testnet',
      publicKey: `ed25519:${base58.encode(ED25519_PUBLIC)}`,
      signature: Buffer.from(signature).toString('base64'),
      nonce: Buffer.from(payload.nonce).toString('base64'),
      message: payload.message,
      recipient: payload.recipient,
      callbackUrl: payload.callbackUrl,
    },
  };
}

describe('NEP-413 verification', () => {
  it('serializes tag, strings, fixed nonce and Option<string> as Borsh', () => {
    const nonce = Uint8Array.from({ length: 32 }, (_, index) => index);
    const expected = Buffer.concat([
      Buffer.from([0x9d, 0x01, 0x00, 0x80]), // u32 LE 2^31 + 413
      Buffer.from([0x02, 0x00, 0x00, 0x00]), // message length
      Buffer.from('hi', 'utf8'),
      Buffer.from(nonce),
      Buffer.from([0x09, 0x00, 0x00, 0x00]), // recipient length
      Buffer.from('myapp.com', 'utf8'),
      Buffer.from([0x00]), // Option::None
    ]);
    const encoded = encodeNep413Payload({ message: 'hi', nonce, recipient: 'myapp.com' });
    expect(Buffer.from(encoded).equals(expected)).toBe(true);

    const withCallback = encodeNep413Payload({
      message: 'hi',
      nonce,
      recipient: 'myapp.com',
      callbackUrl: 'x',
    });
    expect(Buffer.from(withCallback).subarray(-6).toString('hex')).toBe('010100000078');
  });

  it('accepts a correctly signed ed25519 payload', () => {
    const { input } = ed25519Login();
    expect(verifyNearSignature(input)).toEqual({ valid: true });
  });

  it('accepts a signature that covers an optional callback URL', () => {
    const { input } = ed25519Login({ callbackUrl: 'https://airbag.test/auth/callback' });
    expect(verifyNearSignature(input)).toEqual({ valid: true });
  });

  it('accepts a wallet that signed without the callback URL the site sent (Meteor)', () => {
    // The Meteor selector module never forwards callbackUrl, so it signs the payload without it.
    const { input } = ed25519Login();
    const sent = { ...input, callbackUrl: 'https://airbag.test' };
    expect(verifyNearSignature(sent)).toEqual({ valid: true });
  });

  it('rejects a signature made over a different callback URL', () => {
    const { input } = ed25519Login({ callbackUrl: 'https://other.test' });
    expect(verifyNearSignature({ ...input, callbackUrl: 'https://airbag.test' }).valid).toBe(false);
  });

  it('rejects a tampered message', () => {
    const { input } = ed25519Login();
    const result = verifyNearSignature({ ...input, message: `${input.message} tampered` });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/does not match/i);
  });

  it('rejects a tampered nonce', () => {
    const { input } = ed25519Login();
    const nonce = Buffer.alloc(32, 9).toString('base64');
    expect(verifyNearSignature({ ...input, nonce }).valid).toBe(false);
  });

  it('rejects a changed recipient', () => {
    const { input } = ed25519Login();
    expect(verifyNearSignature({ ...input, recipient: 'evil.test' }).valid).toBe(false);
  });

  it('returns a clear error for a malformed public key', () => {
    const { input } = ed25519Login();
    const result = verifyNearSignature({ ...input, publicKey: 'ed25519:not base58!' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/base58|public key/i);
  });

  it('returns a clear error for the wrong curve or key length', () => {
    const { input } = ed25519Login();
    const wrongCurve = verifyNearSignature({ ...input, publicKey: 'rsa:abc' });
    expect(wrongCurve.valid).toBe(false);
    if (!wrongCurve.valid) expect(wrongCurve.error).toMatch(/curve/i);

    const shortKey = verifyNearSignature({
      ...input,
      publicKey: `ed25519:${base58.encode(new Uint8Array(31))}`,
    });
    expect(shortKey.valid).toBe(false);
    if (!shortKey.valid) expect(shortKey.error).toMatch(/length/i);
  });

  it('returns a clear error for a malformed signature', () => {
    const { input } = ed25519Login();
    const notBase64 = verifyNearSignature({ ...input, signature: 'not base64!' });
    expect(notBase64.valid).toBe(false);
    if (!notBase64.valid) expect(notBase64.error).toMatch(/base64/i);

    const short = verifyNearSignature({
      ...input,
      signature: Buffer.alloc(12).toString('base64'),
    });
    expect(short.valid).toBe(false);
    if (!short.valid) expect(short.error).toMatch(/length/i);
  });

  it('rejects a nonce that is not exactly 32 bytes', () => {
    const { input } = ed25519Login();
    const result = verifyNearSignature({ ...input, nonce: Buffer.alloc(31).toString('base64') });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/32 bytes/i);
  });

  it('verifies a secp256k1 signature over the NEP-413 hash', () => {
    const secret = new Uint8Array(32).fill(9);
    const publicKey = secp256k1.getPublicKey(secret, false).subarray(1);
    const payload: Nep413Payload = {
      message: 'Sign in to Airbag',
      nonce: new Uint8Array(32).fill(4),
      recipient: 'airbag.test',
    };
    const hash = nep413MessageHash(payload);
    const signature = secp256k1.sign(hash, secret, { prehash: false });
    const input: NearSignatureInput = {
      accountId: 'alice.testnet',
      publicKey: `secp256k1:${base58.encode(publicKey)}`,
      signature: Buffer.from(signature).toString('base64'),
      nonce: Buffer.from(payload.nonce).toString('base64'),
      message: payload.message,
      recipient: payload.recipient,
    };

    expect(verifyNearSignature(input)).toEqual({ valid: true });

    const recovered = secp256k1.sign(hash, secret, { prehash: false, format: 'recovered' });
    const nearFormat = new Uint8Array(65);
    nearFormat.set(recovered.subarray(1), 0);
    nearFormat[64] = recovered[0]!;
    expect(
      verifyNearSignature({ ...input, signature: Buffer.from(nearFormat).toString('base64') }),
    ).toEqual({ valid: true });
  });

  it('rejects an invalid account id', () => {
    const { input } = ed25519Login();
    const result = verifyNearSignature({ ...input, accountId: 'Not A NEAR Account!' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/account id/i);
  });
});

describe('nonces', () => {
  it('issues 32 random bytes, a message and an expiry', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const issued = issueNonce({ recipient: 'airbag.test', accountId: 'alice.testnet', now });
    expect(Buffer.from(issued.nonce, 'base64')).toHaveLength(32);
    expect(issued.recipient).toBe('airbag.test');
    expect(issued.message).toContain(issued.nonce);
    expect(issued.message).toContain('alice.testnet');
    expect(issued.expiresAt).toBe(new Date(now.getTime() + NONCE_TTL_MS).toISOString());
  });

  it('produces a different nonce each time', () => {
    const first = issueNonce({ recipient: 'airbag.test' });
    const second = issueNonce({ recipient: 'airbag.test' });
    expect(first.nonce).not.toBe(second.nonce);
  });
});

describe('session tokens and cookies', () => {
  it('creates a 32-byte token, stores only its hash and expires after 7 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const session = createSessionToken(now);
    expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenHash).toBe(hashSessionToken(session.token));
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenHash).not.toBe(session.token);
    expect(Date.parse(session.expiresAt) - now.getTime()).toBe(SESSION_TTL_MS);
  });

  it('sets the required cookie flags and omits Secure outside production/https', () => {
    const cookie = sessionCookie('abc123');
    expect(cookie).toBe('airbag_session=abc123; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800');
    expect(cookie).not.toContain('Secure');
    expect(sessionCookie('abc123', { secure: true })).toContain('; Secure');
    expect(sessionCookie('', { maxAgeSeconds: 0 })).toContain('Max-Age=0');
  });

  it('reads the session cookie from a Cookie header', () => {
    expect(readSessionCookie('theme=dark; airbag_session=abc123; other=1')).toBe('abc123');
    expect(readSessionCookie('airbag_session=')).toBeNull();
    expect(readSessionCookie('theme=dark')).toBeNull();
    expect(readSessionCookie(undefined)).toBeNull();
  });
});
