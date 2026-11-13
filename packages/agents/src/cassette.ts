import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalize,
  sha256Hex,
  type AgentAdapter,
  type RunReport,
  runSuite,
  SCENARIOS,
} from '@airbag/core';
import { ToolRunner } from './tools';
import type { LlmCassette } from './llm';

export function loadCassette(path: string): LlmCassette {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as LlmCassette;
  if (parsed.version !== 1 || !Array.isArray(parsed.turns)) {
    throw new Error(`Not a Airbag cassette: ${path}`);
  }
  return parsed;
}

export function loadCassetteDir(dir: string): LlmCassette[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => loadCassette(join(dir, file)));
}

/** One adapter over a bundle of per-scenario cassettes. */
export function cassetteBundleAgent(cassettes: LlmCassette[]): AgentAdapter {
  if (cassettes.length === 0) throw new Error('No cassettes to replay');
  const first = cassettes[0]!;
  const replays = new Map(cassettes.map((cassette) => [cassette.scenarioId, cassetteAgent(cassette)]));
  return {
    id: 'cassette',
    label: `Recorded replay · ${first.model}`,
    kind: 'cassette',
    model: first.model,
    recordedAt: first.recordedAt,
    async run(ctx) {
      const replay = replays.get(ctx.task.id);
      if (!replay) {
        throw new Error(`No cassette for ${ctx.task.id} in this bundle`);
      }
      await replay.run(ctx);
    },
  };
}

/**
 * Recorded replay: feed the recorded assistant turns, execute their tool calls
 * against the sandbox, and fail if any response hash drifted from the recording.
 * This stops silent rot in the sandbox contract.
 */
export function cassetteAgent(cassette: LlmCassette): AgentAdapter {
  return {
    id: cassette.guarded ? 'cassette-guarded' : 'cassette',
    label: `Recorded replay · ${cassette.model}`,
    kind: 'cassette',
    model: cassette.model,
    recordedAt: cassette.recordedAt,
    async run(ctx) {
      const runner = new ToolRunner(ctx, { guarded: cassette.guarded });
      for (const turn of cassette.turns) {
        for (const call of turn.assistant.tool_calls ?? []) {
          const outcome = await runner.run({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          });
          const content = outcome.error ? { error: outcome.error } : outcome.result;
          const hash = sha256Hex(canonicalize(content));
          const recorded = turn.toolResults.find((result) => result.id === call.id);
          if (!recorded) {
            throw new Error(`Cassette has no result for tool call ${call.id}`);
          }
          if (recorded.resultHash !== hash) {
            throw new Error(
              `Cassette response hash drifted for ${call.function.name} (${ctx.task.id}). The sandbox contract changed; re-record with a key.`,
            );
          }
        }
      }
    },
  };
}

export function cassetteSuite(cassette: LlmCassette): Promise<RunReport> {
  return runSuite({
    agent: cassetteAgent(cassette),
    scenarios: SCENARIOS.filter((scenario) => scenario.id === cassette.scenarioId),
    seed: `cassette:${cassette.scenarioId}:${cassette.trial}`,
  });
}

export function cassetteRun(
  cassette: LlmCassette,
  scenarioId: string,
  seed: string,
): Promise<RunReport> {
  return runSuite({
    agent: cassetteAgent(cassette),
    scenarios: SCENARIOS.filter((scenario) => scenario.id === scenarioId),
    seed,
  });
}
