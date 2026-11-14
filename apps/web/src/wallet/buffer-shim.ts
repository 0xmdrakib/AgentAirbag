/**
 * The NEAR wallet selector expects the Node Buffer global when it validates and signs a
 * NEP-413 message. Vite does not polyfill Node globals and this app has no buffer package,
 * so this file provides the small subset the signing path uses.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(value: string): Uint8Array {
  const normalized = value
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const digit = BASE64_ALPHABET.indexOf(normalized.charAt(index));
    if (digit < 0) {
      throw new Error('The auth service returned a nonce that is not valid base64.');
    }
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;
    output += BASE64_ALPHABET.charAt((chunk >> 18) & 63);
    output += BASE64_ALPHABET.charAt((chunk >> 12) & 63);
    output += index + 1 < bytes.length ? BASE64_ALPHABET.charAt((chunk >> 6) & 63) : '=';
    output += index + 2 < bytes.length ? BASE64_ALPHABET.charAt(chunk & 63) : '=';
  }
  return output;
}

function decodeHex(value: string): Uint8Array {
  if (value.length % 2 !== 0) {
    throw new Error('The auth service returned a nonce that is not valid hex.');
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    if (!Number.isFinite(byte)) {
      throw new Error('The auth service returned a nonce that is not valid hex.');
    }
    bytes[index] = byte;
  }
  return bytes;
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

class AirbagBuffer {
  private readonly bytes: Uint8Array;

  readonly length: number;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.length = bytes.length;
  }

  static isBuffer(value: unknown): boolean {
    return value instanceof AirbagBuffer;
  }

  static isView(value: unknown): boolean {
    return ArrayBuffer.isView(value);
  }

  static from(value: unknown, encoding?: string): AirbagBuffer {
    if (value instanceof AirbagBuffer) {
      return new AirbagBuffer(new Uint8Array(value.bytes));
    }
    if (value instanceof Uint8Array) {
      return new AirbagBuffer(new Uint8Array(value));
    }
    if (value instanceof ArrayBuffer) {
      return new AirbagBuffer(new Uint8Array(value.slice(0)));
    }
    if (Array.isArray(value)) {
      return new AirbagBuffer(Uint8Array.from(value as number[]));
    }
    if (typeof value === 'string') {
      if (encoding === 'base64') return new AirbagBuffer(decodeBase64(value));
      if (encoding === 'hex') return new AirbagBuffer(decodeHex(value));
      return new AirbagBuffer(new TextEncoder().encode(value));
    }
    throw new Error('The wallet signer passed a value the Buffer shim cannot read.');
  }

  toString(encoding = 'utf8'): string {
    if (encoding === 'base64') return encodeBase64(this.bytes);
    if (encoding === 'hex') return encodeHex(this.bytes);
    return new TextDecoder().decode(this.bytes);
  }

  toJSON(): { type: 'Buffer'; data: number[] } {
    return { type: 'Buffer', data: Array.from(this.bytes) };
  }
}

/**
 * Install the shim in the app's realm. This runs at import time and again right before a
 * signature is requested, so the wallet selector always sees the Buffer global it expects.
 */
function ensureBufferShim(): void {
  const scope = globalThis as unknown as { Buffer?: unknown };
  scope.Buffer = AirbagBuffer;
}

ensureBufferShim();

/** Decode a 32-byte NEP-413 nonce from the hex or base64 string the API issued. */
export function decodeNonce(encoded: string): Uint8Array {
  const value = encoded.trim();
  if (!value) {
    throw new Error('The auth service returned an empty nonce.');
  }
  const bytes = /^[0-9a-fA-F]{64}$/.test(value) ? decodeHex(value) : decodeBase64(value);
  if (bytes.length !== 32) {
    throw new Error(
      `The auth service returned a ${bytes.length}-byte nonce. A NEAR sign-in needs exactly 32 bytes.`,
    );
  }
  return bytes;
}

/**
 * Wrap the nonce in the shimmed Buffer so @near-wallet-selector/core accepts it. The cast
 * to Buffer happens in the provider, where the Node type is available for type checking.
 */
export function walletNonce(encoded: string): unknown {
  ensureBufferShim();
  return AirbagBuffer.from(decodeNonce(encoded));
}
