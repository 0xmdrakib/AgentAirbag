/**
 * The only module allowed to touch the real 1Click API.
 * Read-only by construction: GET /v0/tokens and POST /v0/quote with dry:true.
 */
import { BASE_USDC, NEAR_WNEAR, USER_WALLET } from '@airbag/core';

export const ONECLICK_BASE = 'https://1click.chaindefuser.com';

export interface LiveToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt: string;
  [key: string]: unknown;
}

export async function getTokens(): Promise<LiveToken[]> {
  const response = await fetch(`${ONECLICK_BASE}/v0/tokens`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`GET /v0/tokens failed with ${response.status}`);
  return (await response.json()) as LiveToken[];
}

export async function dryQuote(overrides: Record<string, unknown> = {}): Promise<unknown> {
  const request = {
    dry: true,
    depositMode: 'SIMPLE',
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100,
    originAsset: BASE_USDC,
    destinationAsset: NEAR_WNEAR,
    depositType: 'ORIGIN_CHAIN',
    amount: '100000000',
    refundTo: USER_WALLET,
    refundType: 'ORIGIN_CHAIN',
    recipient: 'alice.near',
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
  if (request.dry !== true) {
    throw new Error('The live client is read-only: dry must be true');
  }
  const response = await fetch(`${ONECLICK_BASE}/v0/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`POST /v0/quote failed with ${response.status}`);
  return response.json();
}
