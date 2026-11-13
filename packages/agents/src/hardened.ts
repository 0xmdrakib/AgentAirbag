import {
  looksLikeInjection,
  toSmallest,
  type AgentAdapter,
  type AgentContext,
  type QuoteResponseBody,
  type StatusResponseBody,
} from '@airbag/core';
import { Guard, guardState, type GuardReason, type GuardState, type QuoteView } from '@airbag/guard';
import {
  fetchTokens,
  findToken,
  getStatus,
  postQuote,
  quoteOf,
  quoteRequest,
  submitDeposit,
} from './common';

/**
 * Seatbelt: the reference implementation of the seven laws, built on Airbag Guard.
 * It must survive all scenarios. When a check fails it stops and reports honestly.
 */
export function hardenedAgent(): AgentAdapter {
  return {
    id: 'hardened',
    label: 'Seatbelt (with Airbag Guard)',
    kind: 'scripted',
    async run(ctx) {
      const guard = new Guard();
      let state: GuardState;
      let completed = 0;

      try {
        const tokens = await fetchTokens(ctx);
        const origin = findToken(tokens, ctx.task.originAssetId);
        if (!origin) throw new Error('Origin token missing from the token list');
        state = guardState(ctx.task, ctx.policy, ctx.now(), origin.blockchain);
        for (const token of tokens) {
          if (looksLikeInjection(token.symbol)) state.untrustedSpans.push(token.symbol);
        }

        for (let swapIndex = 0; swapIndex < ctx.task.swapCount; swapIndex += 1) {
          state.now = ctx.now();
          const amount = toSmallest(ctx.task.amount, origin.decimals);

          const dryRequest = quoteRequest(ctx, {
            amount,
            dry: true,
            refundTo: ctx.task.refundTo,
            refundType: ctx.task.refundType,
            recipient: ctx.task.recipient,
          });
          const dry = await quoteOrRetry(ctx, dryRequest, false);
          if (!dry) {
            await abort(ctx, 'The dry quote failed twice. No funds were sent.');
            return;
          }
          const dryQuote = quoteOf(dry);

          const wetRequest = quoteRequest(ctx, {
            amount,
            dry: false,
            refundTo: ctx.task.refundTo,
            refundType: ctx.task.refundType,
            recipient: ctx.task.recipient,
          });
          let wet = await quoteOrRetry(ctx, wetRequest, true);
          if (!wet) {
            await abort(ctx, 'The wet quote failed twice. No funds were sent.');
            return;
          }
          let wetQuote = quoteOf(wet);

          if (swapIndex === 0 && ctx.task.thinkMs > 0) {
            ctx.message(`Thinking for ${Math.round(ctx.task.thinkMs / 1000)}s after the quote…`);
            await ctx.sleep(ctx.task.thinkMs);
          }

          let view = quoteView(
            wetQuote,
            dryQuote,
            wetRequest,
            origin.blockchain,
            swapIndex,
            1,
          );
          const deadlineOk = await checkDeadline(ctx, view);
          if (!deadlineOk) {
            ctx.message('That quote expired or is too close to the confirmation window. Getting a fresh one.');
            const freshRequest = quoteRequest(ctx, {
              amount,
              dry: false,
              refundTo: ctx.task.refundTo,
              refundType: ctx.task.refundType,
              recipient: ctx.task.recipient,
            });
            wet = await quoteOrRetry(ctx, freshRequest, true);
            if (!wet) {
              await abort(ctx, 'A fresh quote could not be obtained. No funds were sent.');
              return;
            }
            wetQuote = quoteOf(wet);
            view = quoteView(
              wetQuote,
              dryQuote,
              freshRequest,
              origin.blockchain,
              swapIndex,
              2,
            );
            if (!(await checkDeadline(ctx, view))) {
              await abort(ctx, 'The replacement quote was also too short. No funds were sent.');
              return;
            }
          }

          if (wetQuote.quote.customRecipientMsg) {
            state.untrustedSpans.push(wetQuote.quote.customRecipientMsg);
          }
          if (dryQuote.quote.customRecipientMsg) {
            state.untrustedSpans.push(dryQuote.quote.customRecipientMsg);
          }

          const quoteCheck = guard.check(
            {
              kind: 'quote.create',
              quote: view.request,
            },
            state,
          );
          if (quoteCheck.verdict !== 'allow') {
            await abort(ctx, describe(quoteCheck.reasons));
            return;
          }

          if (!echoMatches(view, wetQuote)) {
            await abort(ctx, 'The quote echo changed the recipient, amount, asset or refund address.');
            return;
          }

          if (BigInt(wetQuote.quote.amountIn) > (BigInt(dryQuote.quote.amountIn) * 101n) / 100n) {
            await abort(ctx, 'The wet quote asks for more than 1% above the dry preview.');
            return;
          }

          const slipFloor =
            (BigInt(dryQuote.quote.amountOut) * BigInt(10_000 - ctx.policy.maxSlippageBps)) /
            10_000n;
          if (BigInt(wetQuote.quote.minAmountOut) < slipFloor) {
            await abort(ctx, 'The quote’s minimum output is below the user’s slippage floor.');
            return;
          }

          state.quotes.push(view);
          state.now = ctx.now();
          const transferCheck = guard.check(
            {
              kind: 'wallet.transfer',
              quoteId: view.id,
              to: view.depositAddress!,
              assetId: origin.assetId,
              amount: BigInt(wetQuote.quote.amountIn),
              memo: wetQuote.quote.depositMemo,
              usd: Number(wetQuote.quote.amountInUsd),
              funding: true,
            },
            state,
          );
          if (transferCheck.verdict !== 'allow') {
            await abort(ctx, describe(transferCheck.reasons));
            return;
          }

          const transfer = await ctx.wallet.transfer(
            view.depositAddress!,
            origin.assetId,
            BigInt(wetQuote.quote.amountIn),
            wetQuote.quote.depositMemo,
          );
          state.transfers.push({
            to: view.depositAddress!,
            assetId: origin.assetId,
            amount: BigInt(wetQuote.quote.amountIn),
            usd: Number(wetQuote.quote.amountInUsd),
            funding: true,
            quoteId: view.id,
          });
          state.spentTodayUsd += Number(wetQuote.quote.amountInUsd);
          ctx.message(`Sent one deposit of ${wetQuote.quote.amountInFormatted} ${ctx.task.originSymbol}.`);

          const submitted = await submitDeposit(ctx, transfer.txHash, view.depositAddress!);
          if (!submitted.ok) {
            // Never repeat the payment. Ask what happened; at most retry the
            // idempotent deposit-submit call.
            const afterError = await getStatus(ctx, view.depositAddress!);
            ctx.message(
              `Submit returned ${submitted.status}. Status is ${afterError?.status ?? 'unknown'}; not paying again.`,
            );
            if (afterError?.status === 'PENDING_DEPOSIT') {
              await submitDeposit(ctx, transfer.txHash, view.depositAddress!).catch(() => undefined);
            }
          }

          let status: StatusResponseBody | null = null;
          for (let poll = 0; poll < 20; poll += 1) {
            status = await getStatus(ctx, view.depositAddress!);
            if (!status) break;
            if (
              status.status === 'SUCCESS' ||
              status.status === 'REFUNDED' ||
              status.status === 'FAILED' ||
              status.status === 'INCOMPLETE_DEPOSIT'
            ) {
              break;
            }
            if (poll < 19) await ctx.sleep(20_000);
          }

          if (!status) {
            await abort(ctx, 'The status endpoint stopped answering. No claim of success was made.');
            return;
          }

          if (status.status === 'REFUNDED') {
            await ctx.report({
              outcome: 'refunded',
              amountOut: status.swapDetails.refundedAmount,
              txHashes: status.swapDetails.originChainTxHashes.map((tx) => tx.hash),
              message: `The swap was REFUNDED. Refunded amount: ${status.swapDetails.refundedAmountFormatted}.`,
            });
            return;
          }

          if (status.status === 'INCOMPLETE_DEPOSIT') {
            await ctx.report({
              outcome: 'failed',
              message:
                'The deposit landed below the quote minimum. The swap did not complete; no second deposit was sent.',
            });
            return;
          }

          if (status.status === 'FAILED') {
            await ctx.report({ outcome: 'failed', message: 'The sandbox reported FAILED.' });
            return;
          }

          if (status.status === 'PROCESSING' || status.status === 'PENDING_DEPOSIT' || status.status === 'KNOWN_DEPOSIT_TX') {
            await ctx.report({
              outcome: 'pending',
              message: 'The solver is still working after the polling budget. No delivery is confirmed.',
            });
            return;
          }

          const minAmountOut = BigInt(wetQuote.quote.minAmountOut);
          const delivered = BigInt(status.swapDetails.amountOut);
          const destinationHashes = status.swapDetails.destinationChainTxHashes;
          if (destinationHashes.length === 0 || delivered < minAmountOut) {
            await ctx.report({
              outcome: 'pending',
              message:
                'The status says SUCCESS but the evidence does not match: missing destination hash or output below the minimum. Delivery is not confirmed.',
            });
            return;
          }

          completed += 1;
          const reportCheck = guard.check(
            {
              kind: 'report',
              report: { outcome: 'success', message: 'Delivered.' },
              status: status.status,
              destinationHash: destinationHashes[0]?.hash,
              amountOut: delivered,
              minAmountOut,
            },
            state,
          );
          if (reportCheck.verdict !== 'allow') {
            await ctx.report({
              outcome: 'pending',
              message: 'The guard could not verify the success claim, so no success was reported.',
            });
            return;
          }

          if (swapIndex === ctx.task.swapCount - 1) {
            await ctx.report({
              outcome: 'success',
              amountOut: status.swapDetails.amountOut,
              txHashes: destinationHashes.map((tx) => tx.hash),
              message: `Delivered ${status.swapDetails.amountOutFormatted} ${ctx.task.destinationSymbol} to ${ctx.task.recipient}.`,
            });
            return;
          }
        }

        if (completed < ctx.task.swapCount) {
          await ctx.report({
            outcome: 'aborted',
            message: `Completed ${completed} of ${ctx.task.swapCount} swaps. The rest were stopped by policy.`,
          });
          return;
        }

        await ctx.report({
          outcome: 'success',
          message: `Completed ${completed} swap${completed === 1 ? '' : 's'}.`,
        });
      } catch (error) {
        await ctx.report({
          outcome: 'failed',
          message: `Stopped safely: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

function quoteView(
  wet: QuoteResponseBody,
  dry: QuoteResponseBody,
  request: Record<string, unknown>,
  originChain: string,
  swapIndex: number,
  attempt: number,
): QuoteView {
  const responseDeadline = wet.quote.deadline ? Date.parse(wet.quote.deadline) : Number.NaN;
  const requestDeadline = Date.parse(String(request.deadline ?? ''));
  const deadline = Number.isFinite(responseDeadline) ? responseDeadline : requestDeadline;
  return {
    id: `quote-${swapIndex}-${attempt}`,
    request: {
      originAsset: String(request.originAsset),
      destinationAsset: String(request.destinationAsset),
      originChain,
      amountIn: BigInt(String(request.amount)),
      amountInUsd: Number(wet.quote.amountInUsd),
      intendedSmallest: BigInt(String(request.amount)),
      refundTo: String(request.refundTo),
      refundType: request.refundType as 'ORIGIN_CHAIN' | 'INTENTS',
      recipient: String(request.recipient),
      slippageBps: Number(request.slippageTolerance),
      deadline: Number.isFinite(deadline) ? deadline : 0,
    },
    echo: {
      recipient: wet.quoteRequest.recipient,
      refundTo: wet.quoteRequest.refundTo,
      originAsset: wet.quoteRequest.originAsset,
      destinationAsset: wet.quoteRequest.destinationAsset,
      amount: wet.quoteRequest.amount,
    },
    dryAmountIn: BigInt(dry.quote.amountIn),
    expectedAmountOut: BigInt(dry.quote.amountOut),
    minAmountOut: BigInt(wet.quote.minAmountOut),
    depositAddress: wet.quote.depositAddress,
    depositMemo: wet.quote.depositMemo,
    depositMode: wet.quoteRequest.depositMode ?? 'SIMPLE',
  };
}

async function checkDeadline(ctx: AgentContext, view: QuoteView): Promise<boolean> {
  if (!view.request.deadline) return true;
  const remaining = view.request.deadline - ctx.now();
  return remaining >= ctx.policy.confirmationMs;
}

function echoMatches(view: QuoteView, wet: QuoteResponseBody): boolean {
  return (
    wet.quoteRequest.recipient === view.request.recipient &&
    wet.quoteRequest.refundTo === view.request.refundTo &&
    wet.quoteRequest.originAsset === view.request.originAsset &&
    wet.quoteRequest.destinationAsset === view.request.destinationAsset &&
    BigInt(wet.quoteRequest.amount) === view.request.amountIn
  );
}

async function quoteOrRetry(
  ctx: AgentContext,
  request: Record<string, unknown>,
  ignoreErrorBodies: boolean,
): Promise<unknown | null> {
  const first = await postQuote(ctx, request);
  if (first.ok) return first.data;
  if (ignoreErrorBodies) {
    ctx.message('A quote call failed. Ignoring the error body and trying once more.');
  }
  const second = await postQuote(ctx, request);
  return second.ok ? second.data : null;
}

function describe(reasons: GuardReason[]): string {
  return `Guard: ${reasons.map((reason) => `${reason.code} — ${reason.message}`).join(' ')}`;
}

async function abort(ctx: AgentContext, message: string): Promise<void> {
  ctx.message(message);
  await ctx.report({ outcome: 'aborted', message });
}
