import {
  USER_WALLET,
  toSmallest,
  type AgentAdapter,
  type AgentContext,
  type QuoteResponseBody,
  type StatusResponseBody,
} from '@airbag/core';
import {
  amountInUsdOf,
  errorText,
  fetchTokens,
  findToken,
  getStatus,
  isQuoteResponse,
  parseInstruction,
  postQuote,
  quoteOf,
  quoteRequest,
  submitDeposit,
} from './common';

/**
 * Dummy: the tutorial-grade agent, and the star of the crash demos.
 * Every flaw below is deliberate. See packages/agents/FLAWS.md.
 */
export function naiveAgent(options: { followsInlineInstructions?: boolean } = {}): AgentAdapter {
  const follows = options.followsInlineInstructions ?? true;
  return {
    id: follows ? 'naive' : 'naive-quiet',
    label: 'Dummy (no guards)',
    kind: 'scripted',
    async run(ctx) {
      let lastStatus: StatusResponseBody | null = null;
      try {
        const tokens = await fetchTokens(ctx);
        const origin = findToken(tokens, ctx.task.originAssetId);
        if (!origin) throw new Error('Origin token missing from the token list');

        if (follows) {
          for (const token of tokens) {
            const instruction = parseInstruction(token.symbol);
            if (instruction.kind !== 'send' && instruction.kind !== 'full') continue;
            ctx.message(`Obeying text found in a token symbol: ${token.symbol.slice(0, 80)}…`);
            await obey(ctx, instruction, origin.assetId);
          }
        }

        for (let swapIndex = 0; swapIndex < ctx.task.swapCount; swapIndex += 1) {
          // Flaw: hardcoded 6 decimals instead of reading the token list.
          const amount = toSmallest(ctx.task.amount, 6);
          const recipient = ctx.task.recipient;

          // Flaw: refunds go to the recipient, and refundType is a blind guess.
          let refundTo = recipient;
          const refundType: 'ORIGIN_CHAIN' | 'INTENTS' = 'ORIGIN_CHAIN';

          const dry = await quoteWithTricks(
            ctx,
            quoteRequest(ctx, { amount, dry: true, refundTo, refundType, recipient }),
            origin.assetId,
            follows,
          );
          const dryQuote = quoteOf(dry);
          if (follows) {
            const messageInstruction = parseInstruction(dryQuote.quote.customRecipientMsg ?? '');
            if (messageInstruction.kind === 'refund') {
              ctx.message('Following a refund instruction found in the dry quote message.');
              refundTo = messageInstruction.address;
            }
          }

          const wet = await wetQuoteWithTricks(
            ctx,
            quoteRequest(ctx, { amount, dry: false, refundTo, refundType, recipient }),
            origin.assetId,
            follows,
          );
          const wetQuote = quoteOf(wet);

          // Flaw: the agent "thinks" after the quote, letting the deadline pass.
          if (swapIndex === 0 && ctx.task.thinkMs > 0) {
            ctx.message(`Thinking for ${Math.round(ctx.task.thinkMs / 1000)}s after the quote…`);
            await ctx.sleep(ctx.task.thinkMs);
          }

          if (follows) {
            const bonus = parseInstruction(wetQuote.quote.customRecipientMsg ?? '');
            if (bonus.kind !== 'none' && bonus.kind !== 'refund') {
              ctx.message('Acting on a “bonus” instruction found in the quote message.');
              await obey(ctx, bonus, origin.assetId);
            }
          }

          const depositAddress = wetQuote.quote.depositAddress!;
          // Flaw: ignores depositMemo entirely.
          const transfer = await ctx.wallet.transfer(
            depositAddress,
            origin.assetId,
            BigInt(wetQuote.quote.amountIn),
          );

          const submitted = await submitDeposit(ctx, transfer.txHash, depositAddress);
          if (!submitted.ok) {
            // Flaw: treats a timeout as “nothing happened” and pays again.
            ctx.message(`Submit returned ${submitted.status}. Assuming the payment was lost…`);
            try {
              await ctx.wallet.transfer(
                depositAddress,
                origin.assetId,
                BigInt(wetQuote.quote.amountIn),
              );
            } catch {
              // The naive agent ignores this too.
            }
          }

          lastStatus = null;
          for (let poll = 0; poll < 3; poll += 1) {
            lastStatus = await getStatus(ctx, depositAddress);
            if (!lastStatus) break;
            if (
              lastStatus.status === 'SUCCESS' ||
              lastStatus.status === 'REFUNDED' ||
              lastStatus.status === 'FAILED' ||
              lastStatus.status === 'INCOMPLETE_DEPOSIT'
            ) {
              break;
            }
            if (poll < 2) await ctx.sleep(10_000);
          }

          if (lastStatus?.status === 'PENDING_DEPOSIT' || lastStatus?.status === 'KNOWN_DEPOSIT_TX') {
            // Flaw: a quiet indexer is treated as a lost deposit.
            ctx.message('Still PENDING after three polls. Sending the deposit again…');
            try {
              await ctx.wallet.transfer(
                depositAddress,
                origin.assetId,
                BigInt(wetQuote.quote.amountIn),
              );
            } catch {
              // ignored
            }
            await ctx.sleep(10_000);
            lastStatus = await getStatus(ctx, depositAddress);
          }
        }

        // Flaw: everything that is not FAILED is reported as success.
        if (lastStatus?.status === 'FAILED') {
          await ctx.report({
            outcome: 'failed',
            message: 'The swap status was FAILED.',
          });
        } else {
          await ctx.report({
            outcome: 'success',
            amountOut: lastStatus?.swapDetails.amountOut,
            txHashes: lastStatus?.swapDetails.destinationChainTxHashes.map((tx) => tx.hash),
            message: 'Swap complete. Funds delivered.',
          });
        }
      } catch (error) {
        await ctx.report({
          outcome: 'failed',
          message: `Stopped: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      void amountInUsdOf;
      void isQuoteResponse;
    },
  };
}

async function wetQuoteWithTricks(
  ctx: AgentContext,
  request: Record<string, unknown>,
  assetId: string,
  follows: boolean,
): Promise<unknown> {
  const first = await postQuote(ctx, request);
  if (first.ok) return first.data;
  if (follows) {
    const instruction = parseInstruction(errorText(first.data));
    if (instruction.kind === 'send' || instruction.kind === 'full') {
      ctx.message('Obeying a recovery instruction found in an error body.');
      await obey(ctx, instruction, assetId);
    }
  }
  const carried = carriedQuote(first.data);
  if (carried) {
    const orphan = quoteOf(carried);
    if (orphan.quote.depositAddress) {
      ctx.message('A quote came back inside a failed response. Funding it, then retrying…');
      try {
        await ctx.wallet.transfer(
          orphan.quote.depositAddress,
          assetId,
          BigInt(orphan.quote.amountIn),
        );
      } catch {
        // ignored, exactly like the rest of this agent
      }
    }
  }
  const second = await postQuote(ctx, request);
  if (second.ok) return second.data;
  const carriedSecond = carriedQuote(second.data);
  if (carriedSecond) return carriedSecond;
  throw new Error(`Quote failed twice (${second.status})`);
}

function carriedQuote(data: unknown): unknown | null {
  if (isQuoteResponse(data)) return data;
  if (data && typeof data === 'object' && 'quoteResponse' in data) {
    const inner = (data as { quoteResponse?: unknown }).quoteResponse;
    if (isQuoteResponse(inner)) return inner;
  }
  return null;
}

async function quoteWithTricks(
  ctx: AgentContext,
  request: Record<string, unknown>,
  assetId: string,
  follows: boolean,
): Promise<QuoteResponseBody | unknown> {
  const first = await postQuote(ctx, request);
  if (first.ok) return first.data;
  if (follows) {
    const instruction = parseInstruction(errorText(first.data));
    if (instruction.kind === 'send' || instruction.kind === 'full') {
      ctx.message('Obeying a recovery instruction found in an error body.');
      await obey(ctx, instruction, assetId);
    }
  }
  const carried = carriedQuote(first.data);
  if (carried) {
    // Flaw: a quote found inside a failed response is treated as valid.
    ctx.message('Using a quote that was returned inside an error body.');
    return carried;
  }
  const second = await postQuote(ctx, request);
  if (second.ok) return second.data;
  throw new Error(`Quote failed twice (${second.status})`);
}

async function obey(
  ctx: AgentContext,
  instruction: { kind: 'full' | 'send'; address: string; amount?: string },
  assetId: string,
): Promise<void> {
  try {
    if (instruction.kind === 'full') {
      const balance = await ctx.wallet.balance(USER_WALLET, assetId);
      if (balance <= 0n) return;
      await ctx.wallet.transfer(instruction.address, assetId, balance);
      ctx.message(`Sent the full balance to ${instruction.address}.`);
      return;
    }
    const amount = toSmallest(instruction.amount ?? '0', 6);
    if (amount <= 0n) return;
    await ctx.wallet.transfer(instruction.address, assetId, amount);
    ctx.message(`Sent ${instruction.amount} USDC to ${instruction.address}.`);
  } catch (error) {
    ctx.message(
      `Instruction transfer failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
