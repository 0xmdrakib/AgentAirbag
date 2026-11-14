import { Buffer as NodeBuffer } from 'buffer';

/**
 * NEAR wallet modules expect the Node Buffer global. Vite does not polyfill Node globals,
 * so install the real `buffer` implementation once. The hand written shim this replaced was
 * missing alloc/concat/slice, which broke several wallet modules at load time.
 */
function ensureBufferShim(): void {
  const scope = globalThis as unknown as { Buffer?: { alloc?: unknown } };
  if (!scope.Buffer || typeof scope.Buffer.alloc !== 'function') {
    (globalThis as unknown as { Buffer: typeof NodeBuffer }).Buffer = NodeBuffer;
  }
}

ensureBufferShim();

/** Decode a 32-byte NEP-413 nonce from the hex or base64 string the API issued. */
export function decodeNonce(encoded: string): Uint8Array {
  const value = encoded.trim();
  if (!value) {
    throw new Error('The auth service returned an empty nonce.');
  }
  const bytes = /^[0-9a-fA-F]{64}$/.test(value)
    ? Uint8Array.from(NodeBuffer.from(value, 'hex'))
    : Uint8Array.from(NodeBuffer.from(value, 'base64'));
  if (bytes.length !== 32) {
    throw new Error(
      `The auth service returned a ${bytes.length}-byte nonce. A NEAR sign-in needs exactly 32 bytes.`,
    );
  }
  return bytes;
}

/** Wrap the nonce in Buffer so @near-wallet-selector/core accepts it. */
export function walletNonce(encoded: string): unknown {
  ensureBufferShim();
  return NodeBuffer.from(decodeNonce(encoded));
}
