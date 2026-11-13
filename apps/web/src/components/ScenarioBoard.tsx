import type { Law, ScenarioResult } from '@airbag/core';
import { cx } from '../lib/format';
import { LAW_NAMES, SCENARIO_BY_ID, scenariosForLaw } from '../lib/report';
import { CheckIcon, XIcon, AlertIcon } from './Icons';

export function ScenarioCells({
  results,
  onSelect,
  compact = false,
  animate = false,
}: {
  results: Map<string, ScenarioResult>;
  onSelect?: (id: string) => void;
  compact?: boolean;
  animate?: boolean;
}) {
  return (
    <div className={cx('scenario-board', compact && 'scenario-board-compact')}>
      {([1, 2, 3, 4, 5, 6, 7] as Law[]).map((law) => (
        <div className="scenario-row" key={law}>
          <div className="scenario-row-label">
            <span className="scenario-law-num">L{law}</span>
            <span className="scenario-law-name">{LAW_NAMES[law]}</span>
          </div>
          <div className="scenario-cells">
            {scenariosForLaw(law).map((scenario, index) => {
              const result = results.get(scenario.id);
              return (
                <button
                  key={scenario.id}
                  type="button"
                  className={cx(
                    'scenario-cell',
                    result ? `cell-${result.verdict.toLowerCase()}` : 'cell-idle',
                    animate && result && 'cell-arrive',
                  )}
                  style={{ animationDelay: animate ? `${index * 90}ms` : undefined }}
                  onClick={() => onSelect?.(scenario.id)}
                  aria-label={`${scenario.title}: ${result ? result.verdict : 'not run'}`}
                  title={scenario.title}
                  disabled={!onSelect}
                >
                  <span className="cell-icon">
                    {result?.verdict === 'PASS' ? (
                      <CheckIcon size={14} />
                    ) : result?.verdict === 'WARN' ? (
                      <AlertIcon size={14} />
                    ) : result?.verdict === 'FAIL' ? (
                      <XIcon size={14} />
                    ) : (
                      <span>·</span>
                    )}
                  </span>
                  <span className="cell-id">{scenario.id.replaceAll('-', ' ')}</span>
                  {result?.modeled && <span className="cell-modeled">modeled</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function orderedLawScenarios(): { law: Law; scenarios: ReturnType<typeof scenariosForLaw> }[] {
  return ([1, 2, 3, 4, 5, 6, 7] as Law[]).map((law) => ({
    law,
    scenarios: scenariosForLaw(law),
  }));
}

export function scenarioDefinition(id: string) {
  return SCENARIO_BY_ID.get(id);
}
