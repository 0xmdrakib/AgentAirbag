import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScenarioResult } from '@airbag/core';
import { useAppState, type AgentId } from '../state/AppState';
import { SCENARIOS, verdictWord } from '../lib/report';
import { ScenarioCells } from '../components/ScenarioBoard';
import { Button, Chip, LinkButton, VerdictPill } from '../components/Primitives';
import { ArrowRightIcon, PlayIcon, ShieldIcon, TerminalIcon } from '../components/Icons';
import { cx } from '../lib/format';

type Pick = AgentId | 'llm' | 'byo';

const PICK_LABELS: { id: Pick; title: string; sub: string; disabled?: boolean }[] = [
  { id: 'naive', title: 'Dummy', sub: 'No guards. Crashes on purpose.' },
  { id: 'hardened', title: 'Seatbelt', sub: 'Airbag Guard. Survives.' },
  { id: 'llm', title: 'LLM replay', sub: 'Needs a recorded cassette.' },
  { id: 'byo', title: 'Bring your own', sub: 'HTTP, process or in-process.' },
];

export function RunnerPage() {
  const { reports, runAgent, running, progress, liveResults } = useAppState();
  const [pick, setPick] = useState<Pick>('naive');
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
    const report = await runAgent(pick);
    setFinished(pick);
    window.setTimeout(() => reportRef.current?.focus({ preventScroll: true }), 50);
    return report;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const auto = params.get('auto');
    if ((auto === 'naive' || auto === 'hardened') && !started.current) {
      started.current = true;
      setPick(auto);
      void runAgent(auto).then(() => setFinished(auto));
    }
  }, [runAgent]);

  return (
    <div className="page container page-run">
      <div className="page-head">
        <div>
          <p className="eyebrow">Suite runner</p>
          <h1 className="h1">Crash the agent. Watch the grid fill.</h1>
          <p className="page-sub">
            The whole suite runs in your browser. No keys, no network calls, no real funds. The
            virtual clock makes every run reproducible.
          </p>
        </div>
        <Chip tone="signal">{SCENARIOS.length} scenarios</Chip>
      </div>

      <div className="run-layout">
        <aside className="run-sidebar">
          <p className="label">Agent under test</p>
          <div className="agent-picker" role="radiogroup" aria-label="Agent under test">
            {PICK_LABELS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={pick === item.id}
                className={cx('agent-option', pick === item.id && 'agent-option-active')}
                onClick={() => {
                  setPick(item.id);
                  setFinished(null);
                }}
              >
                <span className="agent-option-mark">
                  {item.id === 'naive' ? 'D' : item.id === 'hardened' ? 'S' : item.id === 'llm' ? 'L' : 'Y'}
                </span>
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
              {running === pick ? 'Crashing…' : 'Crash'}
            </Button>
          ) : (
            <div className="run-note">
              {pick === 'llm' ? (
                <>
                  <strong>No recording bundled.</strong> This build has no NEAR AI Cloud key, so
                  there is no honest LLM cassette to replay. The adapter and recorder ship; record
                  one with a key. The scripted runs stay fully reproducible.
                </>
              ) : (
                <>
                  <strong>Bring your own agent.</strong> Live runs need the local CLI or sandbox.
                  <LinkButton href="#/connect" size="sm" variant="ghost">
                    See the three steps <ArrowRightIcon size={14} />
                  </LinkButton>
                </>
              )}
            </div>
          )}

          <div className="run-meta">
            <span className="mono">seed</span>
            <span className="mono">airbag-demo-2026</span>
          </div>
          <div className="run-meta">
            <span className="mono">clock</span>
            <span className="mono">2026-11-01T00:00:00Z</span>
          </div>
          <p className="run-small">
            <ShieldIcon size={14} /> Verdicts come from ledger truth, not the agent’s words.
          </p>
        </aside>

        <section className="run-main" aria-label="Crash suite">
          <div className="run-main-head">
            <div>
              <p className="label">The board</p>
              <p className="run-ticker" aria-live="polite">
                {running
                  ? last
                    ? `${verdictWord(last.verdict)}: ${last.title}`
                    : 'Setting up the crash lab…'
                  : finished
                    ? `Suite complete. ${currentReport?.overall.failed ?? 0} crashed.`
                    : 'Pick an agent and press Crash.'}
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
              window.location.hash = `#/replay/${id}`;
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
              <a
                href="#/report"
                className="btn btn-primary btn-md"
                ref={reportRef}
              >
                See the report card <ArrowRightIcon size={16} />
              </a>
            )}
          </div>
        </section>
      </div>

      <section className="run-after">
        <div className="run-after-card">
          <TerminalIcon size={18} />
          <div>
            <h2 className="h3">The same suite, from a terminal</h2>
            <p className="mono run-command">pnpm airbag run --agent naive</p>
          </div>
        </div>
        <div className="run-after-card">
          <ShieldIcon size={18} />
          <div>
            <h2 className="h3">The fix is a policy engine</h2>
            <p>
              Airbag Guard returns <span className="mono">allow</span>,{' '}
              <span className="mono">warn</span> or <span className="mono">block</span> with
              reasons. Seatbelt is its reference implementation.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
