import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScenarioResult } from '@airbag/core';
import { useAppState, type AgentId } from '../state/AppState';
import { SCENARIOS, verdictWord } from '../lib/report';
import { ScenarioCells } from '../components/ScenarioBoard';
import {
  Button,
  Chip,
  CopyButton,
  LinkButton,
  PageIntro,
  VerdictPill,
} from '../components/Primitives';
import { ArrowRightIcon, PlayIcon, ShieldIcon } from '../components/Icons';
import { cx, formatUsd } from '../lib/format';
import { navigate } from '../lib/router';
import '../styles/pages/run.css';

type Pick = AgentId | 'llm' | 'byo';

const PICK_LABELS: { id: Pick; title: string; sub: string }[] = [
  { id: 'naive', title: 'Dummy', sub: 'No guards. Fails all 21 scenarios.' },
  { id: 'hardened', title: 'Seatbelt', sub: 'With Airbag Guard. Passes all 21.' },
  { id: 'llm', title: 'LLM replay', sub: 'Needs a recorded model session.' },
  { id: 'byo', title: 'Bring your own', sub: 'HTTP, process or in-process.' },
];

export function RunnerPage() {
  const { reports, runAgent, running, progress, liveResults } = useAppState();
  const [pick, setPick] = useState<Pick>('naive');
  const [seed, setSeed] = useState(reports.naive.suite.seed);
  const [finished, setFinished] = useState<AgentId | null>(null);
  const reportRef = useRef<HTMLAnchorElement>(null);
  const started = useRef(false);

  const results = useMemo(() => {
    const source = pick === 'naive' || pick === 'hardened' ? liveResults[pick] : undefined;
    const map = new Map<string, ScenarioResult>();
    for (const result of source ?? []) map.set(result.id, result);
    return map;
  }, [pick, liveResults]);

  const last = progress.last;
  const done = progress.done;
  const total = progress.total;
  const currentReport =
    finished === 'naive' ? reports.naive : finished === 'hardened' ? reports.hardened : null;

  const crash = async () => {
    if (pick !== 'naive' && pick !== 'hardened') return;
    setFinished(null);
    const report = await runAgent(pick, seed);
    setFinished(pick);
    window.setTimeout(() => reportRef.current?.focus({ preventScroll: true }), 50);
    return report;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auto = params.get('auto');
    if ((auto === 'naive' || auto === 'hardened') && !started.current) {
      started.current = true;
      setPick(auto);
      void runAgent(auto).then(() => setFinished(auto));
    }
  }, [runAgent]);

  return (
    <div className="page container page-run">
      <PageIntro
        className="runx-intro"
        label="The crash lab"
        title="Run the crash suite"
        body={`Pick an agent and run all ${SCENARIOS.length} scenarios in your browser. No keys and no network calls. A virtual clock makes every run reproducible from its seed.`}
      />

      <div className="run-layout">
        <aside className="run-sidebar" id="run-start">
          <p className="label">Agent under test</p>
          <div
            className="agent-picker"
            role="radiogroup"
            aria-label="Agent under test"
            onKeyDown={(event) => {
              const current = PICK_LABELS.findIndex((item) => item.id === pick);
              const at =
                event.key === 'ArrowDown' || event.key === 'ArrowRight'
                  ? (current + 1) % PICK_LABELS.length
                  : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
                    ? (current - 1 + PICK_LABELS.length) % PICK_LABELS.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? PICK_LABELS.length - 1
                        : -1;
              if (at < 0) return;
              event.preventDefault();
              const next = PICK_LABELS[at]!.id;
              setPick(next);
              setFinished(null);
              document.getElementById(`agent-option-${next}`)?.focus();
            }}
          >
            {PICK_LABELS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                id={`agent-option-${item.id}`}
                aria-checked={pick === item.id}
                tabIndex={pick === item.id ? 0 : -1}
                className={cx('agent-option', pick === item.id && 'agent-option-active')}
                onClick={() => {
                  setPick(item.id);
                  setFinished(null);
                }}
              >
                <span className="agent-radio" aria-hidden="true" />
                <span>
                  <span className="agent-option-title">{item.title}</span>
                  <span className="agent-option-sub">{item.sub}</span>
                </span>
              </button>
            ))}
          </div>

          {pick === 'naive' || pick === 'hardened' ? (
            <Button
              variant="primary"
              size="lg"
              className="crash-button"
              onClick={() => void crash()}
              disabled={running !== null}
            >
              <PlayIcon size={17} />
              {running === pick ? 'Running…' : 'Run the suite'}
            </Button>
          ) : (
            <div className="run-note">
              {pick === 'llm' ? (
                <>
                  <strong>No model run bundled.</strong> This build has no NEAR AI Cloud API key, so
                  no LLM run is included. The adapter and recorder ship; record one with a key. The
                  scripted runs stay fully reproducible.
                </>
              ) : (
                <>
                  <strong>Bring your own agent.</strong> Your own agent runs use the local CLI or
                  sandbox.
                  <LinkButton href="/connect" size="sm" variant="ghost">
                    See the three steps <ArrowRightIcon size={14} />
                  </LinkButton>
                </>
              )}
            </div>
          )}

          <label className="run-meta run-seed">
            <span>Seed</span>
            <input
              className="seed-input mono"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              aria-label="Suite seed"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <div className="run-meta">
            <span>Virtual clock</span>
            <span className="mono">2026-11-01T00:00:00Z</span>
          </div>
          <p className="run-small">
            <ShieldIcon size={14} /> Verdicts come from ledger truth, not the agent’s words.
          </p>
        </aside>

        <section className="run-main" aria-label="Crash suite">
          <div className="run-main-head">
            <div>
              <p className="run-ticker" aria-live="polite">
                {running
                  ? last
                    ? `${verdictWord(last.verdict)}: ${last.title}`
                    : 'Setting up the crash lab…'
                  : finished
                    ? `Suite complete. ${currentReport?.overall.failed ?? 0} crashed.`
                    : 'Pick an agent and run the suite.'}
              </p>
            </div>
            <div className="run-count mono">
              {String(done).padStart(2, '0')} / {total}
            </div>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div
              className="progress-fill"
              style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
            />
          </div>
          <ScenarioCells
            results={results}
            animate={Boolean(running)}
            onSelect={(id) => {
              navigate(`/replay/${id}`);
            }}
          />
          <div className="run-foot">
            <div className="run-legend">
              <VerdictPill verdict="PASS" subtle />
              <VerdictPill verdict="WARN" subtle />
              <VerdictPill verdict="FAIL" subtle />
              <span className="run-legend-note">Tap any cell to replay it.</span>
            </div>
            {finished && currentReport && (
              <a href="/report" className="btn btn-primary btn-md" ref={reportRef}>
                See the report card <ArrowRightIcon size={16} />
              </a>
            )}
          </div>
          {finished && currentReport && (
            <div className="runx-outcome">
              <div>
                <span className="label">Grade</span>
                <p
                  className={cx(
                    'runx-grade',
                    currentReport.overall.failed ? 'text-fail' : 'text-pass',
                  )}
                >
                  {currentReport.overall.grade}
                </p>
              </div>
              <div>
                <span className="label">Simulated loss</span>
                <p className="runx-loss">{formatUsd(currentReport.overall.simulatedLossUsd)}</p>
              </div>
              <p>
                Survived {currentReport.overall.passed} of {currentReport.suite.scenarioCount}{' '}
                crashes. No real funds moved.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="run-terminal">
        <span>Same suite from a terminal</span>
        <div className="code-line">
          <code className="mono">
            <span className="code-prompt">$</span> pnpm airbag run --agent naive
          </code>
          <CopyButton value="pnpm airbag run --agent naive" />
        </div>
      </div>
    </div>
  );
}
