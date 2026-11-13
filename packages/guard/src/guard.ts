import { isAddressForChain, isNearAccount } from '@airbag/core';
import type { AgentReport, UserPolicy, UserTask } from '@airbag/core';

export type GuardVerdict = 'allow' | 'warn' | 'block';

export interface GuardReason {
  code: string;
  message: string;
}

export interface Decision {
  verdict: GuardVerdict;
  reasons: GuardReason[];
}

export interface ProposedQuote {
  originAsset: string;
  destinationAsset: string;
  originChain: string;
  amountIn: bigint;
  amountInUsd: number;
  intendedSmallest?: bigint;
  refundTo: string;
  refundType: 'ORIGIN_CHAIN' | 'INTENTS';
  recipient: string;
  slippageBps: number;
  deadline: number;
}

export interface QuoteView {
  id: string;
  request: ProposedQuote;
  echo?: {
    recipient: string;
    refundTo: string;
    originAsset: string;
    destinationAsset: string;
    amount: string;
  };
  dryAmountIn?: bigint;
  expectedAmountOut?: bigint;
  minAmountOut?: bigint;
  depositAddress?: string;
  depositMemo?: string;
  depositMode?: 'SIMPLE' | 'MEMO';
}

export interface GuardTransfer {
  to: string;
  assetId: string;
  amount: bigint;
  usd: number;
  funding: boolean;
  quoteId?: string;
}

export interface GuardState {
  task: UserTask;
  policy: UserPolicy;
  now: number;
  originChain: string;
  quotes: QuoteView[];
  transfers: GuardTransfer[];
  untrustedSpans: string[];
  spentTodayUsd: number;
}

export type ProposedAction =
  | { kind: 'quote.create'; quote: ProposedQuote }
  | {
      kind: 'wallet.transfer';
      quoteId?: string;
      to: string;
      assetId: string;
      amount: bigint;
      memo?: string;
      usd: number;
      funding: boolean;
    }
  | {
      kind: 'report';
      report: AgentReport;
      status?: string;
      destinationHash?: string;
      amountOut?: bigint;
      minAmountOut?: bigint;
    };

const WARN_CODES = new Set(['DEADLINE_TOO_SHORT']);

export class Guard {
  check(action: ProposedAction, state: GuardState): Decision {
    const reasons: GuardReason[] = [];
    if (action.kind === 'quote.create') reasons.push(...this.checkQuote(action.quote, state));
    if (action.kind === 'wallet.transfer') reasons.push(...this.checkTransfer(action, state));
    if (action.kind === 'report') reasons.push(...this.checkReport(action, state));

    const verdict: GuardVerdict = reasons.some((reason) => !WARN_CODES.has(reason.code))
      ? 'block'
      : reasons.length > 0
        ? 'warn'
        : 'allow';
    return { verdict, reasons };
  }

  private checkQuote(quote: ProposedQuote, state: GuardState): GuardReason[] {
    const reasons: GuardReason[] = [];
    const { policy, now } = state;

    if (quote.amountInUsd > policy.perSwapUsd) {
      reasons.push({
        code: 'OVER_PER_SWAP_CAP',
        message: `This quote is $${quote.amountInUsd.toFixed(2)}, above the $${policy.perSwapUsd.toFixed(2)} per-swap cap.`,
      });
    }
    if (state.spentTodayUsd + quote.amountInUsd > policy.dailyUsd) {
      reasons.push({
        code: 'OVER_DAILY_CAP',
        message: `This quote would take today to $${(state.spentTodayUsd + quote.amountInUsd).toFixed(2)}, above the $${policy.dailyUsd.toFixed(2)} daily cap.`,
      });
    }
    if (quote.slippageBps > policy.maxSlippageBps) {
      reasons.push({
        code: 'SLIPPAGE_BREACH',
        message: `Slippage ${quote.slippageBps}bps is above the ${policy.maxSlippageBps}bps policy.`,
      });
    }
    if (quote.intendedSmallest !== undefined && quote.intendedSmallest > 0n) {
      const ratio = Number(quote.amountIn) / Number(quote.intendedSmallest);
      if (ratio >= 10 || ratio <= 0.1) {
        reasons.push({
          code: 'AMOUNT_UNITS_MISMATCH',
          message: `The smallest-unit amount is ${ratio >= 1 ? ratio.toFixed(0) : (1 / ratio).toFixed(0)}x ${ratio >= 1 ? 'above' : 'below'} the user's requested amount. Check the token decimals.`,
        });
      }
    }
    if (quote.deadline <= now) {
      reasons.push({ code: 'PAST_DEADLINE', message: 'This quote is already past its deadline.' });
    } else if (quote.deadline - now < policy.confirmationMs) {
      reasons.push({
        code: 'DEADLINE_TOO_SHORT',
        message: `Only ${Math.round((quote.deadline - now) / 1000)}s remain; the origin chain needs ${Math.round(policy.confirmationMs / 1000)}s.`,
      });
    }
    if (!policy.allowRefundTo.includes(quote.refundTo)) {
      reasons.push({
        code: 'REFUND_NOT_ALLOWLISTED',
        message: 'The refund address is not in the user’s allow-list.',
      });
    }
    if (quote.refundType === 'ORIGIN_CHAIN') {
      if (!isAddressForChain(quote.refundTo, quote.originChain)) {
        reasons.push({
          code: 'REFUND_BAD_FORMAT',
          message: `The refund address is not a valid ${quote.originChain} address.`,
        });
      }
    } else if (!isNearAccount(quote.refundTo)) {
      reasons.push({
        code: 'REFUND_TYPE_MISMATCH',
        message: 'refundType INTENTS needs a NEAR-format intents account.',
      });
    }
    if (
      quote.refundType === 'ORIGIN_CHAIN' &&
      isNearAccount(quote.refundTo) &&
      quote.originChain !== 'near'
    ) {
      reasons.push({
        code: 'REFUND_TYPE_MISMATCH',
        message: `A NEAR refund address cannot be used with refundType ORIGIN_CHAIN on ${quote.originChain}.`,
      });
    }
    if (state.untrustedSpans.some((span) => span.includes(quote.refundTo))) {
      reasons.push({
        code: 'TAINTED_VALUE',
        message: 'The refund address appeared inside untrusted tool text.',
      });
    }
    return reasons;
  }

  private checkTransfer(
    action: Extract<ProposedAction, { kind: 'wallet.transfer' }>,
    state: GuardState,
  ): GuardReason[] {
    const reasons: GuardReason[] = [];
    const quote = state.quotes.find(
      (candidate) =>
        candidate.id === action.quoteId ||
        (action.quoteId === undefined && candidate.depositAddress === action.to),
    );
    if (!quote) {
      if (state.untrustedSpans.some((span) => span.includes(action.to))) {
        reasons.push({
          code: 'TAINTED_VALUE',
          message: 'The destination appeared inside untrusted tool text.',
        });
      }
      return reasons;
    }

    if (
      action.quoteId &&
      state.transfers.some((transfer) => transfer.funding && transfer.quoteId === quote.id)
    ) {
      reasons.push({
        code: 'DUPLICATE_FUNDING',
        message: 'This quote already received its funding transfer.',
      });
    }
    if (quote.depositMode === 'MEMO' && action.memo !== quote.depositMemo) {
      reasons.push({
        code: 'MEMO_MISSING',
        message: 'The quote needs its deposit memo; sending without it strands the funds.',
      });
    }
    if (quote.request.deadline <= state.now) {
      reasons.push({ code: 'PAST_DEADLINE', message: 'The quote deadline has passed.' });
    } else if (quote.request.deadline - state.now < state.policy.confirmationMs) {
      reasons.push({
        code: 'DEADLINE_TOO_SHORT',
        message: 'There is not enough time left for the origin chain to confirm.',
      });
    }
    if (action.amount !== quote.request.amountIn) {
      reasons.push({
        code: 'AMOUNT_UNITS_MISMATCH',
        message: `The transfer is ${action.amount} smallest units, but the quote asks for ${quote.request.amountIn}.`,
      });
    }
    if (quote.echo) {
      const mismatch =
        quote.echo.recipient !== quote.request.recipient ||
        quote.echo.refundTo !== quote.request.refundTo ||
        quote.echo.originAsset !== quote.request.originAsset ||
        quote.echo.destinationAsset !== quote.request.destinationAsset ||
        quote.echo.amount !== quote.request.amountIn.toString();
      if (mismatch) {
        reasons.push({
          code: 'ECHO_MISMATCH',
          message: 'The quote echo no longer matches the request that was sent.',
        });
      }
    }
    if (
      quote.dryAmountIn !== undefined &&
      quote.request.amountIn > (quote.dryAmountIn * 101n) / 100n
    ) {
      reasons.push({
        code: 'AMOUNT_DRIFT',
        message: 'The wet quote asks for more than 1% above the dry preview.',
      });
    }
    if (
      quote.expectedAmountOut !== undefined &&
      quote.minAmountOut !== undefined &&
      quote.minAmountOut <
        (quote.expectedAmountOut * BigInt(10_000 - state.policy.maxSlippageBps)) / 10_000n
    ) {
      reasons.push({
        code: 'SLIPPAGE_BREACH',
        message: 'The minimum output is below the user slippage floor.',
      });
    }
    if (quote.request.amountInUsd > state.policy.perSwapUsd) {
      reasons.push({
        code: 'OVER_PER_SWAP_CAP',
        message: 'The funded amount is above the per-swap cap.',
      });
    }
    if (state.spentTodayUsd + quote.request.amountInUsd > state.policy.dailyUsd) {
      reasons.push({
        code: 'OVER_DAILY_CAP',
        message: 'The funded amount would exceed the daily cap.',
      });
    }
    if (state.untrustedSpans.some((span) => span.includes(action.to))) {
      reasons.push({
        code: 'TAINTED_VALUE',
        message: 'The destination appeared inside untrusted tool text.',
      });
    }
    return reasons;
  }

  private checkReport(
    action: Extract<ProposedAction, { kind: 'report' }>,
    state: GuardState,
  ): GuardReason[] {
    const reasons: GuardReason[] = [];
    if (action.report.outcome !== 'success') return reasons;
    const amountOut = action.amountOut;
    const minAmountOut = action.minAmountOut;
    if (
      action.status !== 'SUCCESS' ||
      !action.destinationHash ||
      amountOut === undefined ||
      minAmountOut === undefined ||
      amountOut < minAmountOut
    ) {
      reasons.push({
        code: 'UNVERIFIED_CLAIM',
        message:
          'The status does not prove delivery: no destination hash or the output is below the minimum.',
      });
    }
    void state;
    return reasons;
  }
}

export class GuardBlocked extends Error {
  readonly reasons: GuardReason[];
  constructor(reasons: GuardReason[]) {
    super(`Guard blocked: ${reasons.map((reason) => reason.code).join(', ')}`);
    this.name = 'GuardBlocked';
    this.reasons = reasons;
  }
}

export function guardedWallet(
  wallet: {
    transfer(
      to: string,
      assetId: string,
      amount: bigint,
      memo?: string,
    ): Promise<{ txHash: string }>;
    balance(account: string, assetId: string): Promise<bigint>;
  },
  guard: Guard,
  state: () => GuardState,
  quoteId: () => string | undefined,
): typeof wallet {
  return {
    async transfer(to, assetId, amount, memo) {
      const snapshot = state();
      const decision = guard.check(
        {
          kind: 'wallet.transfer',
          quoteId: quoteId(),
          to,
          assetId,
          amount,
          memo,
          usd: Number(amount) / 1e6,
          funding: true,
        },
        snapshot,
      );
      if (decision.verdict !== 'allow') throw new GuardBlocked(decision.reasons);
      return wallet.transfer(to, assetId, amount, memo);
    },
    balance: wallet.balance,
  };
}

export function guardState(
  task: UserTask,
  policy: UserPolicy,
  now: number,
  originChain: string,
): GuardState {
  return {
    task,
    policy,
    now,
    originChain,
    quotes: [],
    transfers: [],
    untrustedSpans: [],
    spentTodayUsd: 0,
  };
}
