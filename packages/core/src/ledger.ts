import type { TokenInfo } from './types';

export interface LedgerMove {
  id: string;
  t: number;
  kind: 'transfer' | 'credit' | 'loss';
  from?: string;
  to: string;
  assetId: string;
  amount: bigint;
  usd: number;
  txHash?: string;
  memo?: string;
  funding: boolean;
  lossUsd: number;
  reason?: string;
}

export interface TransferOptions {
  from: string;
  to: string;
  assetId: string;
  amount: bigint;
  t: number;
  txHash?: string;
  memo?: string;
  funding?: boolean;
  lossReason?: string;
  reason?: string;
}

export class InsufficientFundsError extends Error {
  constructor(account: string, assetId: string) {
    super(`Insufficient ${assetId} balance for ${account}`);
    this.name = 'InsufficientFundsError';
  }
}

const ZERO = 0n;

function assertNonNegative(amount: bigint, action: string): void {
  if (amount < ZERO) {
    throw new Error(`Ledger ${action} amount must be non-negative (got ${amount.toString()})`);
  }
}

export class Ledger {
  private readonly balances = new Map<string, bigint>();
  private readonly tokens = new Map<string, TokenInfo>();
  readonly moves: LedgerMove[] = [];
  private nextId = 1;

  constructor(tokens: TokenInfo[], balances: { account: string; assetId: string; amount: string }[]) {
    for (const token of tokens) this.tokens.set(token.assetId, token);
    for (const row of balances) {
      const amount = BigInt(row.amount);
      assertNonNegative(amount, 'initial balance');
      this.creditRaw(row.account, row.assetId, amount);
    }
  }

  private key(account: string, assetId: string): string {
    return `${account}|${assetId}`;
  }

  private token(assetId: string): TokenInfo {
    const token = this.tokens.get(assetId);
    if (!token) throw new Error(`Unknown asset ${assetId}`);
    return token;
  }

  private creditRaw(account: string, assetId: string, amount: bigint): void {
    assertNonNegative(amount, 'credit');
    const key = this.key(account, assetId);
    this.balances.set(key, (this.balances.get(key) ?? ZERO) + amount);
  }

  private debitRaw(account: string, assetId: string, amount: bigint): void {
    assertNonNegative(amount, 'debit');
    const key = this.key(account, assetId);
    const current = this.balances.get(key) ?? ZERO;
    if (current < amount) throw new InsufficientFundsError(account, assetId);
    this.balances.set(key, current - amount);
  }

  balance(account: string, assetId: string): bigint {
    return this.balances.get(this.key(account, assetId)) ?? ZERO;
  }

  usdOf(assetId: string, amount: bigint): number {
    const token = this.token(assetId);
    return (Number(amount) / 10 ** token.decimals) * token.price;
  }

  transfer(options: TransferOptions): LedgerMove {
    assertNonNegative(options.amount, 'transfer');
    this.debitRaw(options.from, options.assetId, options.amount);
    this.creditRaw(options.to, options.assetId, options.amount);
    const usd = this.usdOf(options.assetId, options.amount);
    const move: LedgerMove = {
      id: `m${this.nextId++}`,
      t: options.t,
      kind: 'transfer',
      from: options.from,
      to: options.to,
      assetId: options.assetId,
      amount: options.amount,
      usd,
      txHash: options.txHash,
      memo: options.memo,
      funding: options.funding ?? false,
      lossUsd: options.lossReason ? usd : 0,
      reason: options.lossReason ?? options.reason,
    };
    this.moves.push(move);
    return move;
  }

  lose(from: string, assetId: string, amount: bigint, t: number, reason: string): LedgerMove {
    assertNonNegative(amount, 'loss');
    const to = `lost:${reason}`;
    this.debitRaw(from, assetId, amount);
    this.creditRaw(to, assetId, amount);
    const usd = this.usdOf(assetId, amount);
    const move: LedgerMove = {
      id: `m${this.nextId++}`,
      t,
      kind: 'loss',
      from,
      to,
      assetId,
      amount,
      usd,
      funding: false,
      lossUsd: usd,
      reason,
    };
    this.moves.push(move);
    return move;
  }

  credit(account: string, assetId: string, amount: bigint, t: number, reason: string): LedgerMove {
    assertNonNegative(amount, 'credit');
    this.creditRaw(account, assetId, amount);
    const usd = this.usdOf(assetId, amount);
    const move: LedgerMove = {
      id: `m${this.nextId++}`,
      t,
      kind: 'credit',
      to: account,
      assetId,
      amount,
      usd,
      funding: false,
      lossUsd: 0,
      reason,
    };
    this.moves.push(move);
    return move;
  }

  totalLossUsd(): number {
    return this.moves.reduce((sum, move) => sum + move.lossUsd, 0);
  }

  snapshot(): { account: string; assetId: string; amount: string }[] {
    return [...this.balances.entries()]
      .filter(([, amount]) => amount !== ZERO)
      .map(([key, amount]) => {
        const [account, assetId] = key.split('|') as [string, string];
        return { account, assetId, amount: amount.toString() };
      })
      .sort((a, b) => {
        const left = `${a.account}|${a.assetId}`;
        const right = `${b.account}|${b.assetId}`;
        return left < right ? -1 : left > right ? 1 : 0;
      });
  }
}
