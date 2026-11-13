import { useMemo, useState } from 'react';
import type { Law, RunReport, ScenarioResult, Verdict } from '@airbag/core';
import { useAppState } from '../state/AppState';
import {
  LAW_NAMES,
  SCENARIOS,
  topFailures,
} from '../lib/report';
import { formatUsd, plural } from '../lib/format';
import { encodeReport } from '../lib/share';
import {
  Button,
  Chip,
  CopyButton,
  CopyField,
  EmptyState,
  ErrorState,
  GradeBadge,
  LinkButton,
  MoneyMeter,
  SectionHead,
  Stat,
} from '../components/Primitives';
import { SafetyRadar } from '../components/SafetyRadar';
import { FixSnippet } from '../components/FixSnippet';
import {
  ArrowRightIcon,
  DownloadIcon,
  ShareIcon,
  ShieldIcon,
  SparkIcon,
} from '../components/Icons';
import { cx } from '../lib/format';

export function ReportPage() {
  const { activeReport, reports, shareError, sharedReport, runAgent, showToast, running, setActiveAgent, setShared } =
    useAppState();
  const report = activeReport;
  const [openLaw, setOpenLaw] = useState<Law | null>(null);

  if (shareError) {
    return (
      <div className="page container page-report">
        <ErrorState
          title="This report link is damaged"
          body="The compressed report did not survive the trip. Run the suite again and copy a fresh link."
        />
        <div className="center-actions">
          <LinkButton href="#/run" variant="primary">
            Run the suite again
          </LinkButton>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page container page-report">
        <EmptyState
          title="No runs yet"
          body="Pick an agent and press Crash. The report card is generated from ledger truth."
          action={
            <LinkButton href="#/run" variant="primary">
              Open the runner
            </LinkButton>
          }
        />
      </div>
    );
  }

  const failures = topFailures(report, 3);
  const total = report.overall.passed + report.overall.warned + report.overall.failed;

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/report?d=${encodeReport(report)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share link copied. It contains the report, not the event log.');
    } catch {
      showToast('Could not copy the link. Check clipboard permissions.');
    }
  };

  const download = () => {
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `airbag-${report.agent.id}-${report.hash.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Report JSON downloaded.');
  };

  const badge = `Airbag: ${report.overall.grade} (${report.overall.passed}/${total})`;
  const sentence = sentenceFor(report);

  return (
    <div className={cx('page container page-report', sharedReport && 'page-shared')}>
      {sharedReport && (
        <div className="shared-banner">
          <ShareIcon size={16} />
          <span>
            Shared report · read-only. The event log was removed to keep the link small; run the
            suite locally for the full replay.
          </span>
          <button
            type="button"
            className="shared-banner-button"
            onClick={() => {
              setShared(null);
              window.location.hash = '#/report';
            }}
          >
            Use my latest report
          </button>
        </div>
      )}

      <header className="report-hero">
        <div className="report-grade">
          <GradeBadge grade={report.overall.grade} />
        </div>
        <div className="report-hero-copy">
          <p className="eyebrow">
            Report card · {report.agent.label} · {report.suite.scenarioCount} crashes
          </p>
          <h1 className="h1">{sentence}</h1>
          <div className="report-hero-meta">
            <Chip tone={report.overall.failed === 0 ? 'pass' : 'fail'}>
              {report.overall.failed} crashed
            </Chip>
            <Chip tone={report.overall.passed > 0 ? 'pass' : 'neutral'}>
              {report.overall.passed} survived
            </Chip>
            <Chip tone={report.overall.falseClaims > 0 ? 'fail' : 'neutral'}>
              {plural(report.overall.falseClaims, 'false claim')}
            </Chip>
            {report.overall.cappedBy?.length ? (
              <Chip tone="warn">capped at {report.overall.grade}</Chip>
            ) : null}
          </div>
        </div>
        <div className="report-hero-money">
          <MoneyMeter value={report.overall.simulatedLossUsd} size="lg" />
          <div className="report-actions">
            <Button variant="primary" size="sm" onClick={() => void share()}>
              <ShareIcon size={14} /> Share
            </Button>
            <Button variant="secondary" size="sm" onClick={download}>
              <DownloadIcon size={14} /> JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(badge)}>
              Copy badge
            </Button>
          </div>
        </div>
      </header>

      <div className="report-stats">
        <Stat label="Survived" value={report.overall.passed} tone="pass" />
        <Stat label="Wobbled" value={report.overall.warned} tone="warn" />
        <Stat label="Crashed" value={report.overall.failed} tone="fail" />
        <Stat label="False claims" value={report.overall.falseClaims} tone={report.overall.falseClaims > 0 ? 'fail' : undefined} />
        <Stat label="Score" value={`${report.overall.score}/100`} />
      </div>

      <section className="report-shape">
        <div className="report-shape-chart">
          <div className="panel-head">
            <p className="eyebrow">Safety shape</p>
            <span className="mono muted">seven laws · 0 to 100</span>
          </div>
          <SafetyRadar laws={report.laws} />
        </div>
        <div className="report-law-bars">
          <div className="panel-head">
            <p className="eyebrow">Law by law</p>
            <span className="mono muted">click to expand</span>
          </div>
          {report.laws.map((law) => {
            const open = openLaw === law.law;
            return (
              <div className={cx('law-bar-wrap', open && 'law-bar-open')} key={law.law}>
                <button
                  type="button"
                  className="law-bar"
                  aria-expanded={open}
                  onClick={() => setOpenLaw(open ? null : (law.law as Law))}
                >
                  <span className="law-bar-num mono">0{law.law}</span>
                  <span className="law-bar-name">{LAW_NAMES[law.law as Law]}</span>
                  <span className="law-bar-track" aria-hidden="true">
                    <span
                      className={cx(
                        'law-bar-fill',
                        law.score >= 90 ? 'fill-pass' : law.score >= 50 ? 'fill-warn' : 'fill-fail',
                      )}
                      style={{ width: `${law.score}%` }}
                    />
                  </span>
                  <span className="law-bar-score mono">{law.score}</span>
                  <span className={cx('law-bar-chevron', open && 'chevron-open')}>⌄</span>
                </button>
                {open && (
                  <div className="law-scenario-pills">
                    {law.scenarios.map((scenario) => (
                      <a
                        key={scenario.id}
                        className={cx('law-scenario-pill', `pill-${scenario.verdict.toLowerCase()}`)}
                        href={`#/replay/${scenario.id}`}
                      >
                        <span className={cx('pill-dot', `dot-${scenario.verdict.toLowerCase()}`)} />
                        {scenario.title}
                        <span className="pill-loss mono">{formatUsd(scenario.lossUsd)}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section report-failures">
        <SectionHead
          eyebrow="The loud part"
          title={failures.length ? 'The top three failures' : 'No invariant violated'}
          body={
            failures.length
              ? 'Each card shows the story, the broken invariant, the simulated loss and a fix you can paste into the agent.'
              : 'This agent survived these crashes. That is not a claim that it is safe; it is a claim about this suite.'
          }
          right={
            failures.length ? (
              <LinkButton href="#/scenarios" variant="ghost" size="sm">
                See all {SCENARIOS.length} crashes <ArrowRightIcon size={14} />
              </LinkButton>
            ) : undefined
          }
        />
        {failures.length === 0 ? (
          <div className="survived-card">
            <ShieldIcon size={26} />
            <div>
              <h3 className="h3">Survived {total} of {total} crashes.</h3>
              <p>
                Every invariant held in simulation. The card still never says “safe”. It says this
                agent survived these specific crashes.
              </p>
            </div>
          </div>
        ) : (
          <div className="failure-grid">
            {failures.map((failure) => (
              <FailureCard key={failure.id} result={failure} />
            ))}
          </div>
        )}
      </section>

      <section className="section compare-section">
        <SectionHead
          eyebrow="Compare"
          title="The same suite, three agents."
          body="Dummy is the tutorial-grade agent. Seatbelt is the reference implementation of the seven laws. The LLM row is empty until a real recording exists."
        />
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Grade</th>
                <th>Score</th>
                <th>Survived</th>
                <th>Simulated loss</th>
                <th>False claims</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[reports.naive, reports.hardened].map((row) => (
                <tr key={row.agent.id} className={row.hash === report.hash ? 'compare-active' : undefined}>
                  <td>
                    <span className="compare-agent">{row.agent.label}</span>
                    <span className="compare-kind mono">{row.agent.kind}</span>
                  </td>
                  <td>
                    <span className={cx('compare-grade', `grade-${row.overall.grade}`)}>
                      {row.overall.grade}
                    </span>
                  </td>
                  <td className="mono">{row.overall.score}</td>
                  <td className="mono">{row.overall.passed}/{row.suite.scenarioCount}</td>
                  <td className="mono">{formatUsd(row.overall.simulatedLossUsd)}</td>
                  <td className="mono">{row.overall.falseClaims}</td>
                  <td>
                    <button
                      type="button"
                      className="compare-link"
                      onClick={() => {
                        setActiveAgent(row.agent.id === 'hardened' ? 'hardened' : 'naive');
                        setShared(null);
                        window.location.hash = '#/report';
                      }}
                    >
                      view
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="compare-empty">
                <td>
                  <span className="compare-agent">LLM on NEAR AI Cloud</span>
                  <span className="compare-kind mono">not recorded</span>
                </td>
                <td colSpan={6} className="compare-empty-note">
                  No key was available in this build, so no honest recording is bundled. The adapter
                  and cassette recorder ship in the repo.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section report-meta">
        <div className="meta-card">
          <p className="eyebrow">Provenance</p>
          <div className="meta-grid">
            <div>
              <span className="label">Agent</span>
              <p>{report.agent.label}</p>
            </div>
            <div>
              <span className="label">Kind</span>
              <p className="mono">{report.agent.kind}</p>
            </div>
            {report.agent.model && (
              <div>
                <span className="label">Model</span>
                <p className="mono">{report.agent.model}</p>
              </div>
            )}
            {report.agent.recordedAt && (
              <div>
                <span className="label">Recorded</span>
                <p className="mono">{report.agent.recordedAt}</p>
              </div>
            )}
            <div>
              <span className="label">Seed</span>
              <p className="mono">{report.suite.seed}</p>
            </div>
            <div>
              <span className="label">Virtual epoch</span>
              <p className="mono">{report.suite.epoch}</p>
            </div>
            <div>
              <span className="label">Tool</span>
              <p className="mono">airbag {report.tool.version}</p>
            </div>
            <div>
              <span className="label">Modeled scenarios</span>
              <p className="mono">
                {report.laws.flatMap((law) => law.scenarios).filter((scenario) => scenario.modeled).length}
              </p>
            </div>
          </div>
          <div className="meta-hash">
            <CopyField label="Report hash (sha256)" value={report.hash} />
          </div>
          <p className="meta-note">
            <SparkIcon size={14} /> “Modeled” means the sandbox invented a behavior the real API may
            not have. It is never presented as a mainnet result. No funds moved.
          </p>
        </div>
        <div className="meta-actions">
          <Button variant="primary" onClick={() => void share()}>
            <ShareIcon size={15} /> Copy share link
          </Button>
          <Button variant="secondary" onClick={download}>
            <DownloadIcon size={15} /> Download JSON
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(badge);
              showToast(`Copied “${badge}”`);
            }}
          >
            Copy README badge
          </Button>
          <Button
            variant="ghost"
            disabled={running !== null}
            onClick={() => {
              const id = report.agent.kind === 'scripted' && report.agent.id === 'hardened' ? 'hardened' : 'naive';
              void runAgent(id).then(() => showToast('Suite finished. Fresh report card.'));
              window.location.hash = '#/run';
            }}
          >
            Run again
          </Button>
        </div>
      </section>
    </div>
  );
}

function FailureCard({ result }: { result: ScenarioResult }) {
  const violation = result.violations[0];
  return (
    <article className="failure-card">
      <div className="failure-card-head">
        <span className="failure-law mono">LAW {result.law}</span>
        <span className="failure-loss mono">{formatUsd(result.lossUsd)} lost</span>
      </div>
      <h3 className="h3">{result.title}</h3>
      <p className="failure-story">{result.story}</p>
      {violation && (
        <p className="failure-why">
          <span className="mono">{violation.invariant}</span> — {violation.message}
        </p>
      )}
      <div className="failure-actions">
        <a href={`#/replay/${result.id}`} className="failure-watch">
          Watch the crash <ArrowRightIcon size={14} />
        </a>
        {result.fix && <a href={`#/replay/${result.id}`} className="failure-fix-link">Fix</a>}
      </div>
      {result.fix && <FixSnippet fix={result.fix} compact />}
    </article>
  );
}

function sentenceFor(report: RunReport): string {
  const total = report.overall.passed + report.overall.warned + report.overall.failed;
  const loss = Number(report.overall.simulatedLossUsd);
  const claims = report.overall.falseClaims
    ? ` ${report.overall.falseClaims} claim${report.overall.falseClaims === 1 ? '' : 's'} contradicted the ledger.`
    : '';
  if (report.overall.failed === 0) {
    return `Survived ${total} of ${total} crashes and kept the simulated loss at ${formatUsd(loss)}.${claims}`;
  }
  return `Lost ${formatUsd(loss)} in simulation across ${report.overall.failed} crash${report.overall.failed === 1 ? '' : 'es'}.${claims}`;
}
