import tokensJson from './generated/tokens.json';
import type { TokenInfo } from './types';

export const TOKENS = tokensJson as TokenInfo[];

export const TOKEN_BY_ID = new Map(TOKENS.map((token) => [token.assetId, token]));

export function tokenById(assetId: string): TokenInfo {
  const token = TOKEN_BY_ID.get(assetId);
  if (!token) throw new Error(`Asset not in snapshot: ${assetId}`);
  return token;
}

export function tokensFor(assetIds?: string[]): TokenInfo[] {
  if (!assetIds) return TOKENS;
  const set = new Set(assetIds);
  return TOKENS.filter((token) => set.has(token.assetId));
}

export function tokenBySymbol(symbol: string, blockchain?: string): TokenInfo | undefined {
  return TOKENS.find(
    (token) =>
      token.symbol.toLowerCase() === symbol.toLowerCase() &&
      (blockchain === undefined || token.blockchain === blockchain),
  );
}
