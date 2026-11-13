import { describe, expect, it } from 'vitest';
import {
  BASE_USDC,
  Ledger,
  NEAR_WNEAR,
  InsufficientFundsError,
  TOKENS,
  fromSmallest,
  quoteMath,
  toSmallest,
} from '../src/index';

describe('decimal arithmetic', () => {
  it('parses and formats smallest units without floating point', () => {
    expect(toSmallest('100', 6)).toBe(100_000_000n);
    expect(toSmallest('0.003', 8)).toBe(300_000n);
    expect(fromSmallest(100_000_000n, 6)).toBe('100');
    expect(fromSmallest(300_000n, 8)).toBe('0.003');
    expect(() => toSmallest('0.0000001', 6)).toThrow();
  });
});

describe('quote math', () => {
  it('prices an EXACT_INPUT quote deterministically', () => {
    const origin = TOKENS.find((token) => token.assetId === BASE_USDC)!;
    const destination = TOKENS.find((token) => token.assetId === NEAR_WNEAR)!;
    const result = quoteMath({
      amountIn: 100_000_000n,
      origin,
      destination,
      spreadBps: 30,
      slippageBps: 100,
    });
    expect(result.amountOut).toBeGreaterThan(28n * 10n ** 24n);
    expect(result.amountOut).toBeLessThan(29n * 10n ** 24n);
    expect(result.minAmountOut).toBeLessThan(result.amountOut);
    expect(result.minAmountOut).toBe(
      (result.amountOut * 9_900n) / 10_000n,
    );
    expect(result.amountInUsd).toBeCloseTo(99.95, 1);
  });
});

describe('ledger', () => {
  it('moves money, tracks a loss bucket, and refuses overdrafts', () => {
    const ledger = new Ledger(TOKENS, [
      { account: 'user', assetId: BASE_USDC, amount: '1000000000' },
    ]);
    const move = ledger.transfer({
      from: 'user',
      to: 'escrow',
      assetId: BASE_USDC,
      amount: 100_000_000n,
      t: 0,
      funding: true,
      txHash: '0x1',
    });
    expect(move.funding).toBe(true);
    expect(ledger.balance('user', BASE_USDC)).toBe(900_000_000n);
    expect(ledger.balance('escrow', BASE_USDC)).toBe(100_000_000n);
    ledger.lose('escrow', BASE_USDC, 100_000_000n, 1, 'missing-memo');
    expect(ledger.balance('escrow', BASE_USDC)).toBe(0n);
    expect(ledger.totalLossUsd()).toBeCloseTo(99.95, 1);
    expect(() =>
      ledger.transfer({
        from: 'user',
        to: 'escrow',
        assetId: BASE_USDC,
        amount: 10_000_000_000n,
        t: 2,
      }),
    ).toThrow(InsufficientFundsError);
  });
});
