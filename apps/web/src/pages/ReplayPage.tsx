import { useEffect, useMemo, useState } from 'react';
import type { ScenarioResult } from '@airbag/core';
import { useAppState } from '../state/AppState';
import { LAW_NAMES, SCENARIOS, SCENARIO_BY_ID, scenariosForLaw } from '../lib/report';
import { ledgerRows, firstCrashIndex, statusAt, eventPlainText } from '../lib/simulate';
import { cx, formatAmount, formatUsd, isTypingTarget } from '../lib/format';
import { EventRow } from '../components/EventRow';
import { FixSnippet } from '../components/FixSnippet';
import { VerdictPill } from '../components/Primitives';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  PauseIcon,
  PlayIcon,
  ShieldIcon,
  XIcon,
} from '../components/Icons';
import { tokenDecimals, tokenSymbol } from '../lib/report';
import { navigate } from '../lib/router';
import '../styles/pages/replay.css';

type Pane = 'trace' | 'ledger' | 'violations';

export function ReplayPage({ scenarioId }: { scenarioId?: string }) {
  const { reports } = useAppState();
  const [agent, setAgent] = useState<'naive' | 'hardened'>('naive');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pane, setPane] = useState<Pane>('trace');
  const [impact, setImpact] = useState(false);

  const scenario = scenarioId ? SCENARIO_BY_ID.get(scenarioId) : undefined;
  const naive = useMemo(
    () =>
      reports.naive.laws.flatMap((law) => law.scenarios).find((result) => result.id === scenarioId),
    [reports.naive, scenarioId],
  );
  const hardened = useMemo(
    () =>
      reports.hardened.laws
        .flatMap((law) => law.scenarios)
        .find((result) => result.id === scenarioId),
    [reports.hardened, scenarioId],
  );
  const result = agent === 'naive' ? naive : hardened;
  const otherResult = agent === 'naive' ? hardened : naive;
  const events = result?.events ?? [];
  const lastIndex = Math.max(0, events.length - 1);
  const current = events[Math.min(index, lastIndex)];
  const atEnd = index >= lastIndex;

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [scenarioId, agent]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((value) => {
        if (value >= lastIndex) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, 680 / speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, lastIndex]);

  useEffect(() => {
    if (
      current &&
      (current.kind === 'ledger.lost' || (current.kind === 'ledger.transfer' && current.lossUsd))
    ) {
      setImpact(true);
      const timer = window.setTimeout(() => setImpact(false), 700);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [index, current]);

  useEffect(() => {
    const element = document.getElementById(`event-${current?.i ?? 0}`);
    if (element && document.activeElement?.closest('.event-row') !== element) {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [current?.i]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const target = event.target as Element | null;
      // Never steal keys from a focused control; arrow keys and Space belong to it.
      if (
        target?.closest(
          'button, a, input, textarea, select, [role="tab"], [role="radio"], [contenteditable="true"]',
        )
      ) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        setIndex((value) => Math.min(lastIndex, value + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPlaying(false);
        setIndex((value) => Math.max(0, value - 1));
      } else if (event.key === ' ') {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === '[' || event.key === ']') {
        const all = SCENARIOS;
        const cursor = all.findIndex((candidate) => candidate.id === scenarioId);
        const nextIndex =
          event.key === ']' ? (cursor + 1) % all.length : (cursor - 1 + all.length) % all.length;
        navigate(`/replay/${all[nextIndex]!.id}`);
      } else if (/^[1-7]$/.test(event.key)) {
        const law = Number(event.key) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
        const first = scenariosForLaw(law)[0];
        if (first) navigate(`/replay/${first.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lastIndex, scenarioId]);

  if (!scenario || !result) {
    return (
      <div className="page container">
        <div className="state-card">
          <span className="state-glyph">?</span>
          <h1>That crash does not exist.</h1>
          <p>Pick one from the library. There are {SCENARIOS.length} to choose from.</p>
          <a href="/scenarios" className="btn btn-primary btn-md">
            Open the scenario library
          </a>
        </div>
      </div>
    );
  }

  const ledger = ledgerRows(result, index);
  const status = statusAt(events, index);
  const statusStep = stepFor(status, result, index);
  const crashIndex = firstCrashIndex(result);
  const bothDiffer = naive && hardened && naive.verdict !== hardened.verdict;

  return (
    <div className={cx('page replay-page', impact && 'replay-impact')}>
      <div className="container">
        <header className="replay-head">
          <div className="replay-head-top">
            <a href="/report" className="back-link">
              ← Report card
            </a>
            <div className="replay-toggles">
              <div className="segmented" role="group" aria-label="Agent">
                <button
                  type="button"
                  className={cx('segmented-btn', agent === 'naive' && 'segmented-active')}
                  aria-pressed={agent === 'naive'}
                  onClick={() => setAgent('naive')}
                >
                  Dummy
                </button>
                <button
                  type="button"
                  className={cx('segmented-btn', agent === 'hardened' && 'segmented-active')}
                  aria-pressed={agent === 'hardened'}
                  onClick={() => setAgent('hardened')}
                >
                  Seatbelt
                </button>
              </div>
            </div>
          </div>
          <div className="replay-title-row">
            <div>
              <div className="replay-kicker">
                <span className="tag">
                  Law {result.law} · {LAW_NAMES[result.law as 1]}
                </span>
                {result.modeled && <span className="modeled-tag">modeled</span>}
              </div>
              <h1 className="h1">{result.title}</h1>
              <p className="replay-story">{result.story}</p>
            </div>
            <div className="replay-verdict-box">
              <VerdictPill verdict={result.verdict} />
              <span className="mono replay-loss">{formatUsd(result.lossUsd)} simulated loss</span>
              {bothDiffer && otherResult && (
                <button
                  type="button"
                  className="replay-switch-hint"
                  onClick={() => setAgent(agent === 'naive' ? 'hardened' : 'naive')}
                >
                  {agent === 'naive' ? 'Seatbelt survives this' : 'Dummy crashed here'}. Switch
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="replay-tabs" role="tablist" aria-label="Replay panes">
          {(['trace', 'ledger', 'violations'] as Pane[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              id={`replay-tab-${item}`}
              aria-controls={`replay-panel-${item}`}
              aria-selected={pane === item}
              tabIndex={pane === item ? 0 : -1}
              className={cx('replay-tab', pane === item && 'replay-tab-active')}
              onKeyDown={(event) => {
                const order: Pane[] = ['trace', 'ledger', 'violations'];
                const at = order.indexOf(item);
                const next =
                  event.key === 'ArrowRight'
                    ? order[(at + 1) % order.length]
                    : event.key === 'ArrowLeft'
                      ? order[(at - 1 + order.length) % order.length]
                      : event.key === 'Home'
                        ? order[0]
                        : event.key === 'End'
                          ? order[order.length - 1]
                          : undefined;
                if (!next) return;
                event.preventDefault();
                setPane(next);
                document.getElementById(`replay-tab-${next}`)?.focus();
              }}
              onClick={() => setPane(item)}
            >
              {item === 'trace'
                ? 'Agent trace'
                : item === 'ledger'
                  ? 'Swap & ledger'
                  : 'Violations'}
            </button>
          ))}
        </div>

        <div className="replay-grid">
          <section
            className={cx('replay-pane', 'trace-pane', pane === 'trace' && 'pane-active')}
            id="replay-panel-trace"
            role="tabpanel"
            aria-labelledby="replay-tab-trace"
            aria-label="Agent trace"
          >
            <div className="pane-head">
              <span className="label">Agent trace</span>
              <span className="mono muted">{events.length} events</span>
            </div>
            <div className="trace-list">
              {events.map((event) => (
                <EventRow
                  key={event.i}
                  event={event}
                  active={event.i === current?.i}
                  onSelect={() => {
                    setPlaying(false);
                    setIndex(event.i);
                  }}
                />
              ))}
            </div>
          </section>

          <section
            className={cx('replay-pane', 'ledger-pane', pane === 'ledger' && 'pane-active')}
            id="replay-panel-ledger"
            role="tabpanel"
            aria-labelledby="replay-tab-ledger"
            aria-label="Swap and ledger"
          >
            <div className="pane-head">
              <span className="label">Swap lifecycle</span>
              <span className={cx('status-pill', `status-${statusTone(status)}`)}>
                {status ?? 'no status yet'}
              </span>
            </div>
            <ol className="stepper">
              {['Quote', 'Deposit', 'Process', 'Settle'].map((step, stepIndex) => (
                <li
                  key={step}
                  className={cx(
                    'stepper-step',
                    stepIndex <= statusStep && 'stepper-done',
                    stepIndex === statusStep && 'stepper-current',
                  )}
                >
                  <span className="stepper-dot">
                    {stepIndex < statusStep ? '✓' : stepIndex + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="ledger-list">
              {ledger.map((row) => (
                <div
                  className={cx('ledger-row', `ledger-${row.tone}`)}
                  key={`${row.account}|${row.assetId}`}
                >
                  <span className="ledger-label">
                    {row.label}
                    <span className="ledger-account mono">
                      {row.account.slice(0, 18)}
                      {row.account.length > 18 ? '…' : ''}
                    </span>
                  </span>
                  <span className={cx('ledger-amount mono', row.amount === 0n && 'ledger-zero')}>
                    {formatAmount(row.amount.toString(), tokenDecimals(row.assetId))}{' '}
                    <small>{tokenSymbol(row.assetId)}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="swap-summary">
              <span className="label">At this moment</span>
              <p>{current ? eventPlainText(current) : 'The run has not started.'}</p>
            </div>
          </section>

          <section
            className={cx('replay-pane', 'violations-pane', pane === 'violations' && 'pane-active')}
            id="replay-panel-violations"
            role="tabpanel"
            aria-labelledby="replay-tab-violations"
            aria-label="Violations"
          >
            <div className="pane-head">
              <span className="label">Violations</span>
              <span className="mono muted">{result.violations.length}</span>
            </div>
            {result.violations.length === 0 ? (
              <div className="violation-pass">
                <ShieldIcon size={22} />
                <h2 className="h3">No invariant violated</h2>
                <p>
                  The judge read the EventLog and found no breach of the seven laws. That is a
                  statement about this scenario, not a guarantee of safety.
                </p>
              </div>
            ) : (
              <div className="violation-list">
                {result.violations.map((violation, violationIndex) => (
                  <article
                    className="violation-card"
                    key={`${violation.invariant}-${violationIndex}`}
                  >
                    <div className="violation-card-head">
                      <span className="violation-icon">
                        {violation.severity === 'fail' ? (
                          <XIcon size={14} />
                        ) : (
                          <AlertIcon size={14} />
                        )}
                      </span>
                      <span className="mono violation-code">{violation.invariant}</span>
                      {violation.falseClaim && <span className="modeled-tag">false claim</span>}
                    </div>
                    <p>{violation.message}</p>
                    {violation.evidence.length > 0 && (
                      <div className="evidence-row">
                        <span className="label">Evidence</span>
                        {violation.evidence.map((eventIndex) => (
                          <button
                            type="button"
                            key={eventIndex}
                            className="evidence-chip mono"
                            onClick={() => {
                              setPlaying(false);
                              setIndex(eventIndex);
                            }}
                          >
                            event {eventIndex}
                          </button>
                        ))}
                      </div>
                    )}
                    {result.fix && <FixSnippet fix={result.fix} compact />}
                  </article>
                ))}
              </div>
            )}
            <div className="replay-help">
              <span className="label">Keyboard</span>
              <p className="mono">← → step · space play · [ ] scenario · 1–7 law</p>
            </div>
          </section>
        </div>

        <div className="scrubber">
          <div className="scrubber-controls">
            <button
              type="button"
              className="scrub-play"
              onClick={() => {
                if (atEnd) setIndex(0);
                setPlaying((value) => !value);
              }}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPlaying(false);
                setIndex(crashIndex);
              }}
            >
              Skip to the key moment <ArrowRightIcon size={14} />
            </button>
            <div className="speed-group" role="group" aria-label="Speed">
              {[1, 2, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cx('speed-btn mono', speed === value && 'speed-active')}
                  onClick={() => setSpeed(value)}
                  aria-pressed={speed === value}
                >
                  {value}×
                </button>
              ))}
            </div>
            <span className="scrub-time mono">
              {current ? `${Math.round(current.t / 100) / 10}s` : '0s'} /{' '}
              {events.length ? `${Math.round(events[lastIndex]!.t / 1000)}s` : '0s'}
            </span>
          </div>
          <div className="timeline-wrap">
            <div className="timeline-ticks" aria-hidden="true">
              {events.map((event) => (
                <span
                  key={event.i}
                  className={cx(
                    'timeline-tick',
                    event.kind === 'fault.fired' && 'tick-fault',
                    (event.kind === 'ledger.lost' ||
                      (event.kind === 'ledger.transfer' && event.lossUsd)) &&
                      'tick-loss',
                  )}
                  style={{
                    left: `${events.length <= 1 ? 0 : (event.i / (events.length - 1)) * 100}%`,
                  }}
                />
              ))}
            </div>
            <input
              className="timeline-range"
              type="range"
              min={0}
              max={lastIndex}
              value={Math.min(index, lastIndex)}
              onChange={(event) => {
                setPlaying(false);
                setIndex(Number(event.target.value));
              }}
              aria-label="Replay position"
              aria-valuetext={
                current
                  ? `Step ${index + 1} of ${events.length}, ${Math.round(current.t / 100) / 10} seconds`
                  : 'Start of the replay'
              }
            />
          </div>
          <div className="scrubber-legend">
            <span>
              <i className="legend-dot legend-fault" /> airbag fault
            </span>
            <span>
              <i className="legend-dot legend-loss" /> loss
            </span>
            <span>
              <i className="legend-dot legend-api" /> api
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusTone(status: string | undefined): string {
  if (!status) return 'idle';
  if (status === 'SUCCESS') return 'pass';
  if (status === 'REFUNDED' || status === 'FAILED' || status === 'INCOMPLETE_DEPOSIT')
    return 'fail';
  return 'warn';
}

function stepFor(status: string | undefined, result: ScenarioResult, index: number): number {
  const seen = result.events.filter((event) => event.i <= index);
  if (
    status === 'SUCCESS' ||
    status === 'REFUNDED' ||
    status === 'FAILED' ||
    status === 'INCOMPLETE_DEPOSIT'
  ) {
    return 3;
  }
  if (status === 'PROCESSING') return 2;
  if (
    seen.some(
      (event) =>
        event.kind === 'ledger.transfer' ||
        (event.kind === 'api.request' && event.path.includes('wallet/transfer')),
    )
  ) {
    return 1;
  }
  return 0;
}
