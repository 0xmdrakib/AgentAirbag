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
  it('pins the published demo numbers and hashes', async () => {
    // The README, docs/FACTS.md and the Report Card screenshots quote these exact values.
    const dummy = await runSuite({ agent: naiveAgent(), scenarios: SCENARIOS, seed: 'airbag-demo-2026' });
    expect(dummy.overall.grade).toBe('F');
    expect(dummy.overall.score).toBe(0);
    expect(dummy.overall.failed).toBe(21);
    expect(dummy.overall.falseClaims).toBe(8);
    expect(dummy.overall.simulatedLossUsd).toBe('10907.04');
    expect(dummy.hash).toBe('e7fed1cc3fd5cca529c2fba04d001756349c81ca7598253581ae30349c65514b');
  }, 60_000);

  it('pins the published Seatbelt numbers and hash', async () => {
    const seatbelt = await runSuite({ agent: hardenedAgent(), scenarios: SCENARIOS, seed: 'airbag-demo-2026' });
    expect(seatbelt.overall.grade).toBe('A');
    expect(seatbelt.overall.score).toBe(100);
    expect(seatbelt.overall.passed).toBe(21);
    expect(seatbelt.overall.simulatedLossUsd).toBe('1.00');
    expect(seatbelt.hash).toBe('a246e77377230eaec6f2b3b806b6a22e1b5308deda6a8d3dc337eed92be75d2d');
  }, 60_000);

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
