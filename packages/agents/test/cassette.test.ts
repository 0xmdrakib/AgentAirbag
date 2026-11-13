import { describe, expect, it } from 'vitest';
import {
  BASE_USDC,
  USER_WALLET,
  canonicalize,
  runScenario,
  scenarioById,
  sha256Hex,
  type AgentAdapter,
  type LogEvent,
} from '@airbag/core';
import { ToolRunner, type ToolCall } from '../src/tools';
import { cassetteAgent } from '../src/cassette';
import type { LlmCassette, CassetteTurn } from '../src/llm';

const SCENARIO_ID = 'refund-to-wrong-chain';

/**
 * This cassette is synthetic: it is generated here by a scripted tool sequence,
 * not by a model. It exists to test replay and hash-drift detection.
 */
async function recordSyntheticCassette(seed: string): Promise<LlmCassette> {
  const scenario = scenarioById(SCENARIO_ID)!;
  const turns: CassetteTurn[] = [];
  let cassette: LlmCassette | undefined;

  const agent: AgentAdapter = {
    id: 'synthetic-recorder',
    label: 'Synthetic recorder',
    kind: 'scripted',
    async run(ctx) {
      const runner = new ToolRunner(ctx);
      let depositAddress = '';
      let amount = '';
      const call = async (name: string, args: Record<string, unknown>) => {
        const toolCall: ToolCall = {
          id: `call-${turns.length}`,
          name,
          arguments: JSON.stringify(args),
        };
        const outcome = await runner.run(toolCall);
        const content = outcome.error ? { error: outcome.error } : outcome.result;
        if (name === 'get_quote' && args.dry === false) {
          const quote = outcome.result as {
            quote: { depositAddress: string; amountIn: string };
          };
          depositAddress = quote.quote.depositAddress;
          amount = quote.quote.amountIn;
        }
        turns.push({
          assistant: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: toolCall.id, type: 'function', function: { name, arguments: toolCall.arguments } }],
          },
          toolResults: [
            { id: toolCall.id, name, resultHash: sha256Hex(canonicalize(content)) },
          ],
        });
        return outcome;
      };

      await call('list_tokens', {});
      await call('get_quote', {
        dry: true,
        amount: '100000000',
        refundTo: ctx.task.refundTo,
        refundType: ctx.task.refundType,
      });
      await call('get_quote', {
        dry: false,
        amount: '100000000',
        refundTo: ctx.task.refundTo,
        refundType: ctx.task.refundType,
      });
      await call('send_deposit', {
        depositAddress,
        assetId: BASE_USDC,
        amount,
      });
      await call('wait', { seconds: 25 });
      const status = await call('get_status', { depositAddress });
      const body = status.result as {
        swapDetails: { amountOut: string; destinationChainTxHashes: { hash: string }[] };
      };
      await call('report_to_user', {
        outcome: 'success',
        message: 'Delivered',
        amountOut: body.swapDetails.amountOut,
        txHashes: body.swapDetails.destinationChainTxHashes.map((tx) => tx.hash),
      });

      cassette = {
        version: 1,
        model: 'synthetic-fixture',
        recordedAt: '2026-11-14T00:00:00.000Z',
        scenarioId: ctx.task.id,
        trial: 1,
        guarded: false,
        turns,
      };
    },
  };

  await runScenario({ scenario, agent, seed });
  if (!cassette) throw new Error('Synthetic recorder did not produce a cassette');
  return cassette;
}

describe('cassette replay', () => {
  it('replays recorded tool calls and verifies every response hash', async () => {
    const cassette = await recordSyntheticCassette('cassette-seed');
    expect(cassette.turns.length).toBe(7);
    const { result } = await runScenario({
      scenario: scenarioById(SCENARIO_ID)!,
      agent: cassetteAgent(cassette),
      seed: 'cassette-seed',
    });
    expect(result.verdict).toBe('PASS');
    expect(result.events.some((event: LogEvent) => event.kind === 'agent.report')).toBe(true);
  });

  it('fails loudly when a sandbox response drifts from the recording', async () => {
    const cassette = await recordSyntheticCassette('cassette-seed');
    cassette.turns[2]!.toolResults[0]!.resultHash = '0'.repeat(64);
    const { result } = await runScenario({
      scenario: scenarioById(SCENARIO_ID)!,
      agent: cassetteAgent(cassette),
      seed: 'cassette-seed',
    });
    expect(result.verdict).toBe('WARN');
    expect(
      result.events.some(
        (event) => event.kind === 'agent.message' && event.text.includes('hash drifted'),
      ),
    ).toBe(true);
    void USER_WALLET;
  });
});
