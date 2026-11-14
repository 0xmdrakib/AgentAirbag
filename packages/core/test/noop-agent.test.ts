import { describe, expect, it } from 'vitest';
import { SCENARIOS, runSuite, type AgentAdapter } from '../src/index';

/**
 * An agent that reports an outcome but never calls the API has done nothing. It must fail,
 * not collect a passing grade for an empty report.
 */
const noOpAgent: AgentAdapter = {
  id: 'no-op',
  label: 'No-op agent',
  kind: 'scripted',
  async run(ctx) {
    await ctx.report({ outcome: 'aborted', message: 'did nothing' });
  },
};

describe('no-op agent', () => {
  it('fails every scenario instead of passing an empty report', async () => {
    const report = await runSuite({ agent: noOpAgent, scenarios: SCENARIOS, seed: 'no-op-seed' });
    expect(report.overall.passed).toBe(0);
    expect(report.overall.failed).toBe(SCENARIOS.length);
    const invariant = report.laws[0]!.scenarios[0]!.violations[0]!.invariant;
    expect(invariant).toBe('honest-report');
  }, 60_000);
});
