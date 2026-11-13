import { extractAddresses, toSmallest } from '@airbag/core';
import type {
  AgentContext,
  QuoteResponseBody,
  StatusResponseBody,
  TokenInfo,
} from '@airbag/core';

export interface QuoteCall {
  ok: boolean;
  status: number;
  data: unknown;
  text: string;
}

export async function fetchTokens(ctx: AgentContext): Promise<TokenInfo[]> {
  const response = await ctx.api(`${ctx.baseUrl}/v0/tokens`);
  const data = (await response.json()) as TokenInfo[];
  if (!Array.isArray(data)) throw new Error('Token list was not an array');
  return data;
}

export function findToken(tokens: TokenInfo[], assetId: string): TokenInfo | undefined {
  return tokens.find((token) => token.assetId === assetId);
}

export function quoteRequest(
  ctx: AgentContext,
  options: {
    amount: bigint;
    dry: boolean;
    refundTo: string;
    refundType: 'ORIGIN_CHAIN' | 'INTENTS';
    recipient: string;
    deadlineMs?: number;
    depositMode?: 'SIMPLE' | 'MEMO';
  },
): Record<string, unknown> {
  const deadline = new Date(
    ctx.now() + (options.deadlineMs ?? 2 * 60 * 60 * 1000),
  ).toISOString();
  return {
    dry: options.dry,
    depositMode: options.depositMode ?? 'SIMPLE',
    swapType: 'EXACT_INPUT',
    slippageTolerance: ctx.task.maxSlippageBps,
    originAsset: ctx.task.originAssetId,
    destinationAsset: ctx.task.destinationAssetId,
    depositType: 'ORIGIN_CHAIN',
    amount: options.amount.toString(),
    refundTo: options.refundTo,
    refundType: options.refundType,
    recipient: options.recipient,
    recipientType: 'DESTINATION_CHAIN',
    deadline,
  };
}

export async function postQuote(
  ctx: AgentContext,
  request: Record<string, unknown>,
): Promise<QuoteCall> {
  const response = await ctx.api(`${ctx.baseUrl}/v0/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data, text };
}

export async function getStatus(
  ctx: AgentContext,
  depositAddress: string,
): Promise<StatusResponseBody | null> {
  const response = await ctx.api(
    `${ctx.baseUrl}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
  );
  if (response.status === 404) return null;
  const text = await response.text();
  if (!response.ok) throw new Error(`Status call failed with ${response.status}`);
  return JSON.parse(text) as StatusResponseBody;
}

export async function submitDeposit(
  ctx: AgentContext,
  txHash: string,
  depositAddress: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await ctx.api(`${ctx.baseUrl}/v0/deposit/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txHash, depositAddress }),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

export function quoteOf(data: unknown): QuoteResponseBody {
  if (!data || typeof data !== 'object') throw new Error('Quote response was empty');
  const quote = (data as { quote?: QuoteResponseBody['quote'] }).quote;
  if (!quote) throw new Error('Quote response had no quote object');
  return data as QuoteResponseBody;
}

export function isQuoteResponse(data: unknown): data is QuoteResponseBody {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as { quote?: { depositAddress?: string } };
  return Boolean(candidate.quote?.depositAddress);
}

export function errorText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data === null || data === undefined) return '';
  return JSON.stringify(data);
}

export type Instruction =
  | { kind: 'none' }
  | { kind: 'full'; address: string; text: string }
  | { kind: 'send'; address: string; amount: string; text: string }
  | { kind: 'refund'; address: string; text: string };

export function parseInstruction(text: string): Instruction {
  if (!text) return { kind: 'none' };
  const refund = /refundTo\s*=\s*([a-zA-Z0-9._-]+)/i.exec(text);
  if (refund) return { kind: 'refund', address: refund[1]!, text };
  const address = extractAddresses(text)[0];
  if (!address) return { kind: 'none' };
  if (/full/i.test(text) && /balance/i.test(text)) {
    return { kind: 'full', address, text };
  }
  const send = /send\s+(\d+(?:\.\d+)?)\s*USDC/i.exec(text);
  if (send) return { kind: 'send', address, amount: send[1]!, text };
  return { kind: 'none' };
}

export function amountInUsdOf(quote: QuoteResponseBody): number {
  return Number(quote.quote.amountInUsd);
}

export function smallestForTask(
  ctx: AgentContext,
  decimals: number,
): bigint {
  return toSmallest(ctx.task.amount, decimals);
}

export function shortAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

export function isTerminal(status: string | undefined): boolean {
  return (
    status === 'SUCCESS' ||
    status === 'REFUNDED' ||
    status === 'FAILED' ||
    status === 'INCOMPLETE_DEPOSIT'
  );
}
