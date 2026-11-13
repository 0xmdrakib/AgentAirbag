import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runReportSchema, SCENARIOS } from '../src/index';

describe('report fixtures', () => {
  it('validates the naive and hardened fixtures', () => {
    for (const file of ['fixtures/report.naive.json', 'fixtures/report.hardened.json']) {
      const report = JSON.parse(readFileSync(file, 'utf8'));
      const parsed = runReportSchema.safeParse(report);
      expect(parsed.success, `${file}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      expect(report.suite.scenarioCount).toBe(SCENARIOS.length);
      expect(report.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(report.laws).toHaveLength(7);
    }
  });

  it('labels scripted agents honestly', () => {
    const report = JSON.parse(readFileSync('fixtures/report.hardened.json', 'utf8'));
    expect(report.agent.kind).toBe('scripted');
    expect(report.agent.id).toBe('hardened');
    expect(report.overall.grade).toBe('A');
    expect(report.overall.failed).toBe(0);
  });
});
