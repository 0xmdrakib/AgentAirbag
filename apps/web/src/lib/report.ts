import { TOKENS, LAW_NAMES, type Law, type RunReport, type ScenarioResult, type Verdict } from '@airbag/core';
import scenariosJson from '../generated/scenarios.json';
import type { ScenarioDefinition } from '@airbag/core';

export const SCENARIOS = scenariosJson as ScenarioDefinition[];
export const SCENARIO_BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));
export const LAW_NUMBERS: Law[] = [1, 2, 3, 4, 5, 6, 7];
export { LAW_NAMES };

const tokenMap = new Map(TOKENS.map((token) => [token.assetId, token]));

export function tokenSymbol(assetId: string): string {
  return tokenMap.get(assetId)?.symbol ?? assetId.split(':').pop()?.slice(0, 8) ?? 'TOKEN';
}

export function tokenDecimals(assetId: string): number {
  return tokenMap.get(assetId)?.decimals ?? 6;
}

export function tokenBlockchain(assetId: string): string {
  return tokenMap.get(assetId)?.blockchain ?? 'chain';
}

export function allResults(report: RunReport): ScenarioResult[] {
  return report.laws.flatMap((law) => law.scenarios);
}

export function resultById(report: RunReport, id: string): ScenarioResult | undefined {
  return allResults(report).find((result) => result.id === id);
}

export function lawForScenario(id: string): Law {
  return SCENARIO_BY_ID.get(id)?.law ?? 1;
}

export function scenariosForLaw(law: Law): ScenarioDefinition[] {
  return SCENARIOS.filter((scenario) => scenario.law === law);
}

export function topFailures(report: RunReport, limit = 3): ScenarioResult[] {
  return allResults(report)
    .filter((result) => result.verdict === 'FAIL')
    .sort((a, b) => {
      const lossA = Number(a.lossUsd);
      const lossB = Number(b.lossUsd);
      if (lossB !== lossA) return lossB - lossA;
      return b.violations.length - a.violations.length;
    })
    .slice(0, limit);
}

export function verdictWord(verdict: Verdict): 'Survived' | 'Wobbled' | 'Crashed' {
  if (verdict === 'PASS') return 'Survived';
  if (verdict === 'WARN') return 'Wobbled';
  return 'Crashed';
}

export function gradeTone(grade: string): 'pass' | 'warn' | 'fail' {
  if (grade === 'A' || grade === 'B') return 'pass';
  if (grade === 'C') return 'warn';
  return 'fail';
}

export function reportSentence(report: RunReport): string {
  const { overall, agent } = report;
  const total = overall.passed + overall.warned + overall.failed;
  const loss = Number(overall.simulatedLossUsd);
  const claims =
    overall.falseClaims > 0
      ? ` It made ${overall.falseClaims} claim${overall.falseClaims === 1 ? '' : 's'} the ledger did not support.`
      : '';
  const cap = overall.cappedBy?.length
    ? ` Capped at ${overall.grade}: ${overall.cappedBy.length} unbounded-loss crash${overall.cappedBy.length === 1 ? '' : 'es'}.`
    : '';
  if (overall.failed === 0) {
    return `${agent.label} survived all ${total} crashes with $${overall.simulatedLossUsd} lost in simulation.${claims}`;
  }
  return `${agent.label} crashed on ${overall.failed} of ${total} scenarios and lost ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(loss)} in simulation.${claims}${cap}`;
}

export function scenarioLabel(id: string): string {
  return SCENARIO_BY_ID.get(id)?.title ?? id;
}

export function modeledCount(report: RunReport): number {
  return allResults(report).filter((result) => result.modeled).length;
}
