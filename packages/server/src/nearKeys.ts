import { base58 } from '@scure/base';

export type NearNetwork = 'mainnet' | 'testnet';

export interface KeyOwnershipInput {
  accountId: string;
  /** "ed25519:<base58>" or "secp256k1:<base58>". */
  publicKey: string;
  network: NearNetwork;
  /** Overrides NEAR_RPC_URL and the public default for the network. */
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
  /** Defaults to 8000 ms. */
  timeoutMs?: number;
}

export type KeyCheckResult =
  { ok: true } | { ok: false; reason: 'not-owner' | 'unavailable'; message: string };

export const DEFAULT_RPC_URLS: Record<NearNetwork, string> = {
  mainnet: 'https://rpc.mainnet.near.org',
  testnet: 'https://rpc.testnet.near.org',
};

const DEFAULT_TIMEOUT_MS = 8000;
const IMPLICIT_ACCOUNT_PATTERN = /^[0-9a-f]{64}$/;
const MISSING_KEY_NAMES = new Set(['UNKNOWN_ACCESS_KEY', 'UNKNOWN_ACCOUNT']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function notOwner(): KeyCheckResult {
  return {
    ok: false,
    reason: 'not-owner',
    message: 'That key is not an access key of this NEAR account.',
  };
}

function unavailable(detail: string): KeyCheckResult {
  return {
    ok: false,
    reason: 'unavailable',
    message: `Could not check the key against the NEAR network: ${detail}`,
  };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** An implicit account id is the hex of its ed25519 public key, so no lookup is needed. */
function checkImplicitAccount(accountId: string, publicKey: string): KeyCheckResult | undefined {
  if (!IMPLICIT_ACCOUNT_PATTERN.test(accountId)) return undefined;
  const separator = publicKey.indexOf(':');
  if (separator === -1 || publicKey.slice(0, separator).toLowerCase() !== 'ed25519') {
    return undefined;
  }
  let bytes: Uint8Array;
  try {
    bytes = base58.decode(publicKey.slice(separator + 1));
  } catch {
    return notOwner();
  }
  return bytes.length === 32 && toHex(bytes) === accountId ? { ok: true } : notOwner();
}

function resolveRpcUrl(input: KeyOwnershipInput): string {
  if (input.rpcUrl && input.rpcUrl.trim().length > 0) return input.rpcUrl.trim();
  const fromEnv = process.env.NEAR_RPC_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  return DEFAULT_RPC_URLS[input.network];
}

function errorNames(error: Record<string, unknown>): string[] {
  const names: string[] = [];
  if (typeof error['name'] === 'string') names.push(error['name']);
  const cause = error['cause'];
  if (isRecord(cause) && typeof cause['name'] === 'string') names.push(cause['name']);
  return names;
}

/** Classifies a parsed JSON-RPC reply to a view_access_key query. */
function classifyReply(reply: unknown): KeyCheckResult {
  if (!isRecord(reply)) return unavailable('the RPC reply was not an object.');

  const error = reply['error'];
  if (isRecord(error)) {
    if (errorNames(error).some((name) => MISSING_KEY_NAMES.has(name))) return notOwner();
    return unavailable('the RPC returned an error.');
  }

  const result = reply['result'];
  if (!isRecord(result)) return unavailable('the RPC reply had no result.');

  // Older nodes report a missing key or account as a string inside result.
  const resultError = result['error'];
  if (typeof resultError === 'string') {
    return /does not exist while viewing/i.test(resultError)
      ? notOwner()
      : unavailable('the RPC returned an error.');
  }

  // Full access keys and function-call keys both carry a permission.
  if (result['permission'] !== undefined && result['permission'] !== null) return { ok: true };
  return unavailable('the RPC reply had no access key permission.');
}

/**
 * Checks that publicKey is an access key of accountId on NEAR. A valid signature only proves
 * possession of a private key; without this check anyone could claim any account name.
 * Fails closed: anything other than a clear answer is "unavailable".
 */
export async function checkKeyOwnership(input: KeyOwnershipInput): Promise<KeyCheckResult> {
  const implicit = checkImplicitAccount(input.accountId, input.publicKey);
  if (implicit) return implicit;

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const response = await fetchImpl(resolveRpcUrl(input), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'airbag',
        method: 'query',
        params: {
          request_type: 'view_access_key',
          finality: 'final',
          account_id: input.accountId,
          public_key: input.publicKey,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return unavailable(`the RPC answered HTTP ${response.status}.`);
    return classifyReply(await response.json());
  } catch {
    return unavailable('the RPC was unreachable or sent an unreadable reply.');
  }
}
