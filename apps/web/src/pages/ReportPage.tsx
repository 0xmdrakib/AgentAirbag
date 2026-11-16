import { useMemo, useState } from 'react';
import type { Law, RunReport, ScenarioResult } from '@airbag/core';
import { useAppState } from '../state/AppState';
import { LAW_NAMES, SCENARIOS, gradeTone, topFailures } from '../lib/report';
import { formatUsd, plural } from '../lib/format';
import { encodeReport } from '../lib/share';
import {
  Button,
  Chip,
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
import { SaveRun } from '../components/SaveRun';
import {
  ArrowRightIcon,
  ChevronIcon,
  CopyIcon,
  DownloadIcon,
  ShareIcon,
  ShieldIcon,
  SparkIcon,
} from '../components/Icons';
import { cx } from '../lib/format';
import { navigate } from '../lib/router';
import '../styles/pages/report.css';

export function ReportPage() {
  const { activeReport, reports, shareError, sharedReport, showToast, setActiveAgent, setShared } =
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
          <LinkButton href="/run" variant="primary">
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
            <LinkButton href="/run" variant="primary">
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
    const url = `${window.location.origin}/report?d=${encodeReport(report)}`;
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

  const badge = `Agent Airbag: ${report.overall.grade} (${report.overall.passed}/${total})`;
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
              navigate('/report');
            }}
          >
            Use my latest report
          </button>
        </div>
      )}

      <header className="rep-hero">
        <div className="rep-heading">
          <span className="tag">Report card</span>
          <p className="rep-byline">
            {report.agent.label} · {report.suite.scenarioCount} simulated crashes
          </p>
          <h1 className="h1">{sentence}</h1>
          {report.overall.cappedBy?.length ? (
            <div className="report-hero-meta">
              <Chip tone="warn">Grade capped at {report.overall.grade} by a false claim</Chip>
            </div>
          ) : null}
        </div>
        <div className="rep-grade">
          <GradeBadge grade={report.overall.grade} />
        </div>
        <div className="rep-toolbar">
          <MoneyMeter value={report.overall.simulatedLossUsd} size="lg" />
          <div className="rep-tools">
            <div className="report-actions">
              <Button variant="primary" size="sm" onClick={() => void share()}>
                <ShareIcon size={14} /> Share
              </Button>
              <Button variant="secondary" size="sm" onClick={download}>
                <DownloadIcon size={14} /> JSON
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(badge);
                  showToast('README badge copied.');
                }}
              >
                <CopyIcon size={14} /> Badge
              </Button>
            </div>
            <SaveRun report={report} />
          </div>
        </div>
      </header>

      <nav className="section-nav" aria-label="On this report">
        <a href="#report-shape" data-section-link="report-shape">
          Law scores
        </a>
        <a href="#report-failures" data-section-link="report-failures">
          Failures
        </a>
        <a href="#report-compare" data-section-link="report-compare">
          Compare
        </a>
        <a href="#report-meta" data-section-link="report-meta">
          Provenance
        </a>
      </nav>

      <div className="report-stats">
        <Stat
          label="Survived"
          value={report.overall.passed}
          tone={report.overall.passed > 0 ? 'pass' : undefined}
        />
        <Stat
          label="Wobbled"
          value={report.overall.warned}
          tone={report.overall.warned > 0 ? 'warn' : undefined}
        />
        <Stat
          label="Crashed"
          value={report.overall.failed}
          tone={report.overall.failed > 0 ? 'fail' : undefined}
        />
        <Stat
          label="False claims"
          value={report.overall.falseClaims}
          tone={report.overall.falseClaims > 0 ? 'fail' : undefined}
        />
        <Stat label="Score" value={`${report.overall.score}/100`} />
      </div>
      <p className="stats-legend">Average of the seven laws. A 95+ · B 85+ · C 70+ · D 50+</p>

      <section className="report-shape" id="report-shape" aria-labelledby="report-shape-title">
        <div className="report-shape-chart">
          <div className="panel-head">
            <h2 className="eyebrow" id="report-shape-title">
              Law scores
            </h2>
            {!sharedReport && (report.agent.id === 'naive' || report.agent.id === 'hardened') && (
              <span className="muted panel-hint">Dashed: the other reference agent</span>
            )}
          </div>
          <SafetyRadar
            laws={report.laws}
            label={report.agent.label}
            tone={gradeTone(report.overall.grade)}
            overlay={
              sharedReport || (report.agent.id !== 'naive' && report.agent.id !== 'hardened')
                ? undefined
                : {
                    label: (report.agent.id === 'hardened' ? reports.naive : reports.hardened).agent
                      .label,
                    laws: (report.agent.id === 'hardened' ? reports.naive : reports.hardened).laws,
                  }
            }
          />
        </div>
        <div className="report-law-bars">
          <div className="panel-head">
            <h2 className="eyebrow" id="report-laws-title">
              Law by law
            </h2>
            <span className="muted panel-hint">Score out of 100</span>
          </div>
          {report.laws.map((law) => {
            const open = openLaw === law.law;
            const survived = law.scenarios.filter((scenario) => scenario.verdict === 'PASS').length;
            const tone = law.score >= 90 ? 'pass' : law.score >= 50 ? 'warn' : 'fail';
            return (
              <div className={cx('law-acc', open && 'law-acc-open')} key={law.law}>
                <button
                  type="button"
                  className="law-acc-head"
                  id={`law-button-${law.law}`}
                  aria-expanded={open}
                  aria-controls={`law-panel-${law.law}`}
                  onClick={() => setOpenLaw(open ? null : (law.law as Law))}
                >
                  <span className="law-acc-text">
                    <span className="law-acc-name">{LAW_NAMES[law.law as Law]}</span>
                    <span className="law-acc-meta">
                      Law {law.law} · {survived} of {law.scenarios.length} survived
                    </span>
                  </span>
                  <span className={cx('law-acc-score', `text-${tone}`)}>{law.score}</span>
                  <span className="law-acc-chevron" aria-hidden="true">
                    <ChevronIcon size={16} />
                  </span>
                  <span className="law-acc-track" aria-hidden="true">
                    <span
                      className={cx('law-acc-fill', `fill-${tone}`)}
                      style={{ width: `${Math.max(law.score, 0)}%` }}
                    />
                  </span>
                </button>
                {open && (
                  <div
                    className="law-scenario-pills"
                    id={`law-panel-${law.law}`}
                    role="region"
                    aria-labelledby={`law-button-${law.law}`}
                  >
                    {law.scenarios.map((scenario) => (
                      <a
                        key={scenario.id}
                        className={cx(
                          'law-scenario-pill',
                          `pill-${scenario.verdict.toLowerCase()}`,
                        )}
                        href={`/replay/${scenario.id}`}
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

      <section className="section report-failures" id="report-failures">
        <SectionHead
          eyebrow="Where it broke"
          title={failures.length ? 'Costliest failures' : 'No laws broken'}
          body={
            failures.length
              ? 'The three crashes that lost the most. Each shows what went wrong, the law it broke and a fix you can paste into the agent.'
              : 'Every law held in simulation. That is a claim about these crashes, not a claim that the agent is safe.'
          }
          right={
            failures.length ? (
              <LinkButton href="/scenarios" variant="ghost" size="sm">
                See all {SCENARIOS.length} crashes <ArrowRightIcon size={14} />
              </LinkButton>
            ) : undefined
          }
        />
        {failures.length === 0 ? (
          <div className="survived-card">
            <ShieldIcon size={26} />
            <div>
              <h3 className="h3">Survived all {total} scenarios.</h3>
              <p>
                Every law held in simulation. The card still never says “safe”. It says this agent
                survived these specific scenarios.
              </p>
            </div>
          </div>
        ) : (
          <div className="failure-grid">
            {failures.map((failure, index) => (
              <FailureCard key={failure.id} result={failure} index={index + 1} />
            ))}
          </div>
        )}
      </section>

      <section className="section compare-section" id="report-compare">
        <SectionHead
          eyebrow="Reference agents"
          title="Compare agents"
          body="Same suite, same seed. Dummy follows the tutorial and has no guards; Seatbelt applies all seven laws. The LLM row stays empty until a real recording exists."
        />
        <div className="compare-table-wrap">
          <table className="compare-table">
            <caption className="sr-only">
              Compare agents: grade, score, survived, simulated loss and false claims
            </caption>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Grade</th>
                <th scope="col">Score</th>
                <th scope="col">Survived</th>
                <th scope="col">Simulated loss</th>
                <th scope="col">False claims</th>
                <th scope="col">
                  <span className="sr-only">Open report</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[reports.naive, reports.hardened].map((row) => (
                <tr
                  key={row.agent.id}
                  className={row.hash === report.hash ? 'compare-active' : undefined}
                >
                  <td className="compare-cell-agent">
                    <span className="compare-agent">{row.agent.label}</span>
                    <span className="compare-kind mono">{row.agent.kind}</span>
                  </td>
                  <td data-label="Grade">
                    <span className={cx('compare-grade', `grade-${row.overall.grade}`)}>
                      {row.overall.grade}
                    </span>
                  </td>
                  <td className="mono" data-label="Score">
                    {row.overall.score}
                  </td>
                  <td className="mono" data-label="Survived">
                    {row.overall.passed}/{row.suite.scenarioCount}
                  </td>
                  <td className="mono" data-label="Simulated loss">
                    {formatUsd(row.overall.simulatedLossUsd)}
                  </td>
                  <td className="mono" data-label="False claims">
                    {row.overall.falseClaims}
                  </td>
                  <td className="compare-cell-action">
                    <button
                      type="button"
                      className="compare-link"
                      onClick={() => {
                        setActiveAgent(row.agent.id === 'hardened' ? 'hardened' : 'naive');
                        setShared(null);
                        navigate('/report');
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

      <section className="section report-meta" id="report-meta">
        <div className="meta-card">
          <span className="tag">Provenance</span>
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
              <p className="mono">Agent Airbag {report.tool.version}</p>
            </div>
            <div>
              <span className="label">Modeled scenarios</span>
              <p className="mono">
                {
                  report.laws.flatMap((law) => law.scenarios).filter((scenario) => scenario.modeled)
                    .length
                }
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
      </section>
    </div>
  );
}

function FailureCard({ result, index }: { result: ScenarioResult; index: number }) {
  const violation = result.violations[0];
  return (
    <article className="rep-case">
      <div className="rep-case-top">
        <span className="rep-case-number">{String(index).padStart(2, '0')}</span>
        <div className="rep-case-tags">
          <span className="tag">Law {result.law}</span>
          {result.modeled && <span className="chip">Modeled</span>}
        </div>
        <div className="rep-case-loss">
          <span>{formatUsd(result.lossUsd)}</span>
          <small>simulated loss</small>
        </div>
      </div>
      <div className="rep-case-body">
        <div className="rep-case-story">
          <h3 className="h3">{result.title}</h3>
          <p>{result.story}</p>
          {violation && (
            <div className="rep-finding">
              <span className="label">The Judge found</span>
              <p>{violation.message}</p>
              <code>{violation.invariant}</code>
            </div>
          )}
          <a href={`/replay/${result.id}`} className="link-arrow">
            Watch the crash <ArrowRightIcon size={16} />
          </a>
        </div>
        {result.fix && <FixSnippet fix={result.fix} />}
      </div>
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
