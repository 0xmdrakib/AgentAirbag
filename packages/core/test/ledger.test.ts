import { describe, expect, it } from 'vitest';
import { BASE_USDC, Ledger, TOKENS } from '../src/index';

const balances = [{ account: 'user', assetId: BASE_USDC, amount: '100000000' }];

describe('ledger amount validation', () => {
  it('refuses negative initial balances', () => {
    expect(
      () => new Ledger(TOKENS, [{ account: 'user', assetId: BASE_USDC, amount: '-1' }]),
    ).toThrow(/non-negative/);
  });

  it('refuses negative transfer, credit and loss amounts', () => {
    const ledger = new Ledger(TOKENS, balances);

    expect(() =>
      ledger.transfer({
        from: 'user',
        to: 'escrow',
        assetId: BASE_USDC,
        amount: -1n,
        t: 0,
      }),
    ).toThrow(/non-negative/);
    expect(() => ledger.credit('user', BASE_USDC, -1n, 0, 'test credit')).toThrow(/non-negative/);
    expect(() => ledger.lose('user', BASE_USDC, -1n, 0, 'test loss')).toThrow(/non-negative/);

    expect(ledger.moves).toHaveLength(0);
    expect(ledger.balance('user', BASE_USDC)).toBe(100_000_000n);
    expect(ledger.totalLossUsd()).toBe(0);
  });

  it('still allows zero amounts', () => {
    const ledger = new Ledger(TOKENS, balances);

    expect(() =>
      ledger.transfer({
        from: 'user',
        to: 'escrow',
        assetId: BASE_USDC,
        amount: 0n,
        t: 0,
      }),
    ).not.toThrow();
    expect(ledger.credit('user', BASE_USDC, 0n, 0, 'zero credit').amount).toBe(0n);
    expect(ledger.lose('user', BASE_USDC, 0n, 0, 'zero loss').lossUsd).toBe(0);
    expect(ledger.balance('user', BASE_USDC)).toBe(100_000_000n);
  });
});
