const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const NEAR_NAMED_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const NEAR_IMPLICIT_RE = /^[0-9a-f]{64}$/;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BTC_BECH32_RE = /^(bc1|tb1)[02-9ac-hj-np-z]{11,71}$/i;
const BTC_LEGACY_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

export function isEvmAddress(value: string): boolean {
  return EVM_RE.test(value);
}

export function isNearAccount(value: string): boolean {
  if (value.length < 2 || value.length > 64) return false;
  if (EVM_RE.test(value)) return false;
  if (NEAR_IMPLICIT_RE.test(value)) return true;
  return NEAR_NAMED_RE.test(value) && value === value.toLowerCase();
}

export function isSolanaAddress(value: string): boolean {
  return SOLANA_RE.test(value);
}

export function isBitcoinAddress(value: string): boolean {
  return BTC_BECH32_RE.test(value) || BTC_LEGACY_RE.test(value);
}

export function isAddressForChain(value: string, chain: string): boolean {
  switch (chain) {
    case 'base':
    case 'eth':
    case 'arb':
    case 'pol':
    case 'bsc':
    case 'avax':
    case 'op':
    case 'gnosis':
    case 'monad':
    case 'xlayer':
      return isEvmAddress(value);
    case 'near':
      return isNearAccount(value);
    case 'sol':
    case 'sui':
    case 'aptos':
      return isSolanaAddress(value);
    case 'btc':
      return isBitcoinAddress(value);
    default:
      return value.trim().length > 0;
  }
}

export function looksLikeInjection(text: string): boolean {
  return /ignore (all )?(previous|prior) instructions|system:|send .* to 0x|send .* to .*\.near|set refund/i.test(
    text,
  );
}

export function extractAddresses(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/0x[0-9a-fA-F]{40}/g)) out.add(match[0]);
  for (const match of text.matchAll(/\b[a-z0-9][a-z0-9._-]{1,62}\.near\b/g)) out.add(match[0]);
  return [...out];
}
