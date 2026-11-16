import { beforeAll, describe, expect, it } from 'vitest';
import { SCENARIOS, runSuite, type RunReport, type ScenarioResult } from '../src/index';
import { hardenedAgent, naiveAgent } from '../../agents/src/index';

/**
 * Strength checks per scenario, not just totals: every one of the 21 must actually fail the
 * reference Dummy with evidence the Judge can point at, survive under Seatbelt, carry a real fix,
 * and declare in YAML the invariant that fired. A scenario that stops doing this fails here even
 * if the overall grade still looks right.
 */
const seed = 'strength-check-2026';

let naive: RunReport;
let hardened: RunReport;

function byId(report: RunReport): Map<string, ScenarioResult> {
  return new Map(report.laws.flatMap((law) => law.scenarios).map((result) => [result.id, result]));
}

beforeAll(async () => {
  naive = await runSuite({ agent: naiveAgent(), scenarios: SCENARIOS, seed });
  hardened = await runSuite({ agent: hardenedAgent(), scenarios: SCENARIOS, seed });
}, 120_000);

describe('the 21 scenarios are strong on their own', () => {
  it('fails every scenario for Dummy, with at least one violation the Judge explains', () => {
    const results = byId(naive);
    for (const scenario of SCENARIOS) {
      const result = results.get(scenario.id);
      expect(result, `${scenario.id} missing from the Dummy report`).toBeDefined();
      if (!result) continue;

      expect(result.verdict, `${scenario.id} should not pass for Dummy`).not.toBe('PASS');
      expect(result.violations.length, `${scenario.id} has no violation`).toBeGreaterThan(0);
      expect(result.events.length, `${scenario.id} has no events`).toBeGreaterThan(0);

      const eventIndexes = new Set(result.events.map((event) => event.i));
      for (const violation of result.violations) {
        expect(violation.message.length, `${scenario.id}: empty violation message`).toBeGreaterThan(
          8,
        );
        expect(
          violation.evidence.length,
          `${scenario.id}: ${violation.invariant} has no evidence`,
        ).toBeGreaterThan(0);
        for (const index of violation.evidence) {
          expect(
            eventIndexes.has(index),
            `${scenario.id}: ${violation.invariant} points at a missing event ${index}`,
          ).toBe(true);
        }
      }
    }
  });

  it('fires the injected fault and breaks an invariant declared in the YAML', () => {
    const results = byId(naive);
    for (const scenario of SCENARIOS) {
      const result = results.get(scenario.id);
      if (!result) continue;

      // Most crashes inject a fault; the rest come from a world condition or the default flow.
      if (scenario.faults.length > 0) {
        expect(
          result.events.some((event) => event.kind === 'fault.fired'),
          `${scenario.id}: the sandbox never fired its fault`,
        ).toBe(true);
      }

      const fired = new Set(result.violations.map((violation) => violation.invariant));
      expect(
        scenario.judge.invariants.some((invariant) => fired.has(invariant)),
        `${scenario.id}: none of [${scenario.judge.invariants.join(', ')}] fired; saw [${[
          ...fired,
        ].join(', ')}]`,
      ).toBe(true);
    }
  });

  it('gives every scenario a fix with a real snippet', () => {
    const results = byId(naive);
    for (const scenario of SCENARIOS) {
      const result = results.get(scenario.id);
      expect(result?.fix, `${scenario.id} has no fix`).toBeDefined();
      if (!result?.fix) continue;
      expect(result.fix.title.length, `${scenario.id}: fix title too short`).toBeGreaterThan(10);
      expect(result.fix.snippet.length, `${scenario.id}: fix snippet too short`).toBeGreaterThan(
        30,
      );
      expect(result.fix.key).toBe(scenario.fix.key);
    }
  });

  it('passes every scenario under Seatbelt, with only the modeled refund fee as loss', () => {
    const results = byId(hardened);
    let total = 0;
    for (const scenario of SCENARIOS) {
      const result = results.get(scenario.id);
      expect(result, `${scenario.id} missing from the Seatbelt report`).toBeDefined();
      if (!result) continue;
      expect(result.verdict, `${scenario.id} did not pass under Seatbelt`).toBe('PASS');
      expect(result.violations, `${scenario.id} still violates a law under Seatbelt`).toHaveLength(
        0,
      );

      const loss = Number(result.lossUsd);
      total += loss;
      if (scenario.id === 'refunded-not-success') {
        // The one documented modeled fee: a refund costs 1 USD in the sandbox.
        expect(loss, 'the refund fee should be the documented $1.00').toBe(1);
      } else {
        expect(loss, `${scenario.id} lost money under Seatbelt`).toBe(0);
      }
    }
    expect(total, 'Seatbelt total loss should be the modeled $1.00').toBe(1);
  });

  it('spreads the scenarios evenly across the seven laws', () => {
    for (const law of [1, 2, 3, 4, 5, 6, 7]) {
      const group = SCENARIOS.filter((scenario) => scenario.law === law);
      expect(group, `law ${law} does not have three scenarios`).toHaveLength(3);
      expect(new Set(group.map((scenario) => scenario.id)).size).toBe(3);
    }
  });
});
