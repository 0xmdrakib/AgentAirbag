import scenariosJson from './generated/scenarios.json';
import scenarioYaml from './generated/scenario-yaml.json';
import type { ScenarioDefinition } from './types';

export * from './types';
export * from './constants';
export * from './prng';
export * from './clock';
export * from './canonical';
export * from './address';
export * from './ledger';
export * from './quote-math';
export * from './tokens';
export * from './fixes';
export * from './scoring';
export * from './report.schema';
export * from './scenario.schema';
export * from './sandbox';
export * from './sandbox/faults';
export * from './judge';
export * from './scenario/runtime';

export const SCENARIOS = scenariosJson as ScenarioDefinition[];
export const SCENARIO_YAML = scenarioYaml as Record<string, string>;

export function scenarioById(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
