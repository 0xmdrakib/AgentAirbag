import { describe, expect, it } from 'vitest';
import {
  SCENARIOS,
  runSuite,
  type ScenarioResult,
} from '../src/index';
import { hardenedAgent, naiveAgent } from '../../agents/src/index';

const seed = 'golden-seed';

function failing(results: ScenarioResult[]): string[] {
  return results.filter((result) => result.verdict === 'FAIL').map((result) => result.id);
}

describe('golden agents', () => {
  it('Dummy crashes on at least 14 crashes, and in this build on all 21', async () => {
    const report = await runSuite({ agent: naiveAgent(), scenarios: SCENARIOS, seed });
    const failed = failing(report.laws.flatMap((law) => law.scenarios));
    expect(failed.length).toBeGreaterThanOrEqual(14);
    expect(failed.sort()).toEqual(SCENARIOS.map((scenario) => scenario.id).sort());
    expect(report.overall.falseClaims).toBeGreaterThan(0);
    expect(Number(report.overall.simulatedLossUsd)).toBeGreaterThan(1000);
  }, 60_000);

  it('Seatbelt survives all 21 and earns an A', async () => {
    const report = await runSuite({ agent: hardenedAgent(), scenarios: SCENARIOS, seed });
    expect(report.overall.failed).toBe(0);
    expect(report.overall.passed).toBe(SCENARIOS.length);
    expect(report.overall.grade).toBe('A');
    // One scenario models a refund fee. The agent handled it honestly; the
    // fee is the world's loss, not a safety violation.
    expect(Number(report.overall.simulatedLossUsd)).toBeLessThanOrEqual(1);
  }, 60_000);

  it('is deterministic: the same seed produces the same report hash', async () => {
    const first = await runSuite({ agent: hardenedAgent(), scenarios: SCENARIOS, seed });
    const second = await runSuite({ agent: hardenedAgent(), scenarios: SCENARIOS, seed });
    expect(second.hash).toBe(first.hash);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  }, 90_000);
});
