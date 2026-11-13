import type { TokenInfo } from './types';

/** Parse a human decimal string into smallest units without floating point. */
export function toSmallest(human: string, decimals: number): bigint {
  const trimmed = human.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid decimal amount: ${human}`);
  const [whole, fraction = ''] = trimmed.split('.') as [string, string];
  if (fraction.length > decimals) {
    throw new Error(`Too many decimal places for ${decimals}-decimal token: ${human}`);
  }
  const padded = fraction.padEnd(decimals, '0');
  return BigInt(`${whole}${padded}`.replace(/^0+(?=\d)/, ''));
}

/** Format smallest units as a plain decimal string, trimming trailing zeros. */
export function fromSmallest(amount: bigint, decimals: number): string {
  const negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  const value = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${value}` : value;
}

function priceE8(price: number): bigint {
  return BigInt(Math.round(price * 1e8));
}

export interface QuoteMathInput {
  amountIn: bigint;
  origin: TokenInfo;
  destination: TokenInfo;
  spreadBps: number;
  slippageBps: number;
}

export interface QuoteMathOutput {
  amountOut: bigint;
  minAmountOut: bigint;
  amountInUsd: number;
  amountOutUsd: number;
}

export function quoteMath(input: QuoteMathInput): QuoteMathOutput {
  const { amountIn, origin, destination, spreadBps, slippageBps } = input;
  const inPrice = priceE8(origin.price);
  const outPrice = priceE8(destination.price);
  if (inPrice <= 0n || outPrice <= 0n) throw new Error('Prices must be positive');

  // amountIn * priceIn * (1 - spread) * 10^outDecimals
  // --------------------------------------------------
  // priceOut * 10^inDecimals
  const numerator =
    amountIn * inPrice * BigInt(10_000 - spreadBps) * 10n ** BigInt(destination.decimals);
  const denominator = outPrice * 10_000n * 10n ** BigInt(origin.decimals);
  const amountOut = numerator / denominator;
  const minAmountOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

  const amountInUsd = (Number(amountIn) / 10 ** origin.decimals) * origin.price;
  const amountOutUsd = (Number(amountOut) / 10 ** destination.decimals) * destination.price;

  return { amountOut, minAmountOut, amountInUsd, amountOutUsd };
}

export function usdString(value: number): string {
  return value.toFixed(12);
}

export function usd2(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
