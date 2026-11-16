import { useEffect, useId, useRef, useState } from 'react';
import type { RunReport } from '@airbag/core';
import { cx, formatUsd } from '../lib/format';
import { ArrowRightIcon, BookmarkIcon, ChevronIcon, XIcon } from '../components/Icons';
import {
  deleteRun as deleteSavedRun,
  describeError,
  getRun,
  listRuns,
  type RunSummary,
  type SavedRun,
} from './api';

/** The report page remembers saved ids locally; drop the one that was deleted. */
function forgetLocalSave(id: string): void {
  try {
    const raw = window.localStorage.getItem('airbag:saved-runs');
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const kept = parsed.filter(
      (entry) => !(typeof entry === 'object' && entry !== null && (entry as { id?: string }).id === id),
    );
    window.localStorage.setItem('airbag:saved-runs', JSON.stringify(kept));
  } catch {
    // Local history is a convenience only.
  }
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface MyRunsProps {
  open: boolean;
  accountId: string | null;
  onClose: () => void;
}

function formatRunDate(value: string): string {
  if (!value) return 'Date not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function gradeTone(grade: string): 'pass' | 'warn' | 'fail' {
  if (grade === 'A' || grade === 'B') return 'pass';
  if (grade === 'C') return 'warn';
  return 'fail';
}

function reportOverall(run: SavedRun): {
  grade: string;
  score: number;
  loss: string;
  passed: number;
  warned: number;
  failed: number;
  agent: string;
} {
  const report: RunReport | null = run.report;
  return {
    grade: report?.overall.grade ?? run.grade,
    score: report?.overall.score ?? run.score,
    loss: report?.overall.simulatedLossUsd ?? run.lossUsd,
    passed: report?.overall.passed ?? run.passed,
    warned: report?.overall.warned ?? run.warned,
    failed: report?.overall.failed ?? run.failed,
    agent: report?.agent.label ?? run.agentLabel,
  };
}

export function MyRuns({ open, accountId, onClose }: MyRunsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [listState, setListState] = useState<LoadState>('idle');
  const [listError, setListError] = useState('');
  const [listReload, setListReload] = useState(0);

  const [activeRun, setActiveRun] = useState<RunSummary | null>(null);
  const [detail, setDetail] = useState<SavedRun | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [detailError, setDetailError] = useState('');
  const [detailReload, setDetailReload] = useState(0);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const remove = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      setDeleteError('');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteSavedRun(id);
      forgetLocalSave(id);
      setRuns((current) => current.filter((run) => run.id !== id));
      setConfirmId(null);
      setActiveRun((current) => (current?.id === id ? null : current));
    } catch (error) {
      setDeleteError(describeError(error, 'The run could not be deleted. Try again.'));
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    setActiveRun(null);
    setDetail(null);
    setDetailState('idle');
    setListState('loading');
    setListError('');

    let cancelled = false;
    void listRuns()
      .then((next) => {
        if (cancelled) return;
        setRuns(next);
        setListState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListError(describeError(error, 'Your saved runs could not be loaded.'));
        setListState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [open, accountId, listReload]);

  useEffect(() => {
    if (!open || !activeRun) return undefined;

    setDetail(null);
    setDetailState('loading');
    setDetailError('');

    let cancelled = false;
    void getRun(activeRun.id)
      .then((run) => {
        if (cancelled) return;
        setDetail({
          ...run,
          id: activeRun.id,
          createdAt: run.createdAt || activeRun.createdAt,
        });
        setDetailState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDetailError(describeError(error, 'That run could not be loaded.'));
        setDetailState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeRun, detailReload]);

  const close = () => {
    onClose();
    setConfirmId(null);
    setDeleteError('');
  };

  const activeIndex = activeRun ? runs.findIndex((run) => run.id === activeRun.id) : -1;
  const previousRun = activeIndex >= 0 ? runs[activeIndex + 1] : undefined;

  return (
    <dialog
      ref={dialogRef}
      className="wallet-runs-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="wallet-runs-panel">
        <header className="wallet-runs-head">
          <div>
            <p className="eyebrow">My runs</p>
            <h2 className="h2" id={titleId}>
              Saved crash reports
            </h2>
          </div>
          <button
            type="button"
            className="icon-button wallet-runs-close"
            onClick={close}
            aria-label="Close my runs"
          >
            <XIcon size={20} />
          </button>
        </header>

        {activeRun ? (
          <div className="wallet-run-detail">
            <div className="wallet-run-detail-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm wallet-run-back"
                onClick={() => setActiveRun(null)}
              >
                <span className="wallet-run-back-icon" aria-hidden="true">
                  <ArrowRightIcon size={14} />
                </span>
                All runs
              </button>
              <button
                type="button"
                className={cx('wallet-run-delete', confirmId === activeRun.id && 'is-confirming')}
                onClick={() => void remove(activeRun.id)}
                disabled={deleting}
              >
                {confirmId === activeRun.id ? 'Confirm delete' : 'Delete this run'}
              </button>
            </div>
            {deleteError && (
              <p className="wallet-runs-error" role="alert">
                {deleteError}
              </p>
            )}

            {detailState === 'loading' && (
              <p className="wallet-runs-loading" role="status">
                Loading the run
              </p>
            )}

            {detailState === 'error' && (
              <div className="wallet-runs-error" role="alert">
                <p>{detailError}</p>
                <div className="wallet-runs-error-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDetailReload((value) => value + 1)}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setActiveRun(null)}
                  >
                    Back to all runs
                  </button>
                </div>
              </div>
            )}

            {detailState === 'ready' && detail && (
              <RunDetail run={detail} previous={previousRun} />
            )}
          </div>
        ) : (
          <>
            {listState === 'loading' && (
              <p className="wallet-runs-loading" role="status">
                Loading your runs
              </p>
            )}

            {listState === 'error' && (
              <div className="wallet-runs-error" role="alert">
                <p>{listError}</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setListReload((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            )}

            {listState === 'ready' && runs.length === 0 && (
              <div className="wallet-runs-empty">
                <span className="wallet-runs-empty-icon" aria-hidden="true">
                  <BookmarkIcon size={24} />
                </span>
                <h3 className="h3">No saved runs yet</h3>
                <p>Open a report card and choose Save to my runs. It will show up here.</p>
              </div>
            )}

            {listState === 'ready' && runs.length > 0 && (
              <>
                <div className="wallet-runs-columns" aria-hidden="true">
                  <span>Date</span>
                  <span>Grade</span>
                  <span>Score</span>
                  <span>Loss</span>
                  <span />
                </div>
                {deleteError && (
                  <p className="wallet-runs-error" role="alert">
                    {deleteError}
                  </p>
                )}
                <ul className="wallet-runs-list">
                  {runs.map((run) => (
                    <li className="wallet-run-item" key={run.id}>
                      <button
                        type="button"
                        className="wallet-run"
                        onClick={() => setActiveRun(run)}
                        aria-label={`Open the run from ${formatRunDate(run.createdAt)}. Grade ${
                          run.grade || 'not recorded'
                        }, score ${run.score} out of 100, simulated loss ${formatUsd(run.lossUsd)}.`}
                      >
                        <span className="wallet-run-date">{formatRunDate(run.createdAt)}</span>
                        <span
                          className={cx(
                            'wallet-run-grade',
                            `grade-${gradeTone(run.grade)}`,
                            !run.grade && 'wallet-run-grade-empty',
                          )}
                        >
                          {run.grade || '?'}
                        </span>
                        <span className="wallet-run-score mono">{run.score}/100</span>
                        <span className="wallet-run-loss mono">{formatUsd(run.lossUsd)}</span>
                        <span className="wallet-run-chevron" aria-hidden="true">
                          <ChevronIcon size={16} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className={cx('wallet-run-delete', confirmId === run.id && 'is-confirming')}
                        onClick={() => void remove(run.id)}
                        disabled={deleting}
                        aria-label={
                          confirmId === run.id
                            ? `Confirm deleting the run from ${formatRunDate(run.createdAt)}`
                            : `Delete the run from ${formatRunDate(run.createdAt)}`
                        }
                      >
                        {confirmId === run.id ? 'Confirm' : 'Delete'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

function RunDetail({ run, previous }: { run: SavedRun; previous?: RunSummary }) {
  const overall = reportOverall(run);
  const report = run.report;
  const scoreDelta = previous ? overall.score - previous.score : null;
  const lossDelta = previous ? Number(overall.loss) - Number(previous.lossUsd) : null;

  return (
    <div className="wallet-run-detail-body">
      <div className="wallet-run-detail-head">
        <span
          className={cx('wallet-run-detail-grade', `grade-${gradeTone(overall.grade)}`)}
          aria-label={`Grade ${overall.grade || 'not recorded'}`}
        >
          {overall.grade || '?'}
        </span>
        <div>
          <p className="eyebrow">{formatRunDate(run.createdAt)}</p>
          <h3 className="h3">{overall.agent || 'Saved report'}</h3>
          <p className="wallet-run-detail-note">Read only. This is the report saved to your account.</p>
        </div>
      </div>

      <dl className="wallet-run-stats">
        <div className="wallet-run-stat">
          <dt>Score</dt>
          <dd className="mono">{overall.score}/100</dd>
        </div>
        <div className="wallet-run-stat">
          <dt>Simulated loss</dt>
          <dd className="mono">{formatUsd(overall.loss)}</dd>
        </div>
        <div className="wallet-run-stat">
          <dt>Survived</dt>
          <dd className="mono">{overall.passed}</dd>
        </div>
        <div className="wallet-run-stat">
          <dt>Wobbled</dt>
          <dd className="mono">{overall.warned}</dd>
        </div>
        <div className="wallet-run-stat">
          <dt>Crashed</dt>
          <dd className="mono">{overall.failed}</dd>
        </div>
      </dl>

      {previous && scoreDelta !== null && lossDelta !== null && (
        <p className="wallet-run-compare">
          <span className="label">Since {formatRunDate(previous.createdAt)}</span>
          <span>
            Score {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}. Simulated loss{' '}
            {lossDelta === 0
              ? 'unchanged'
              : lossDelta < 0
                ? `${formatUsd(-lossDelta)} lower`
                : `${formatUsd(lossDelta)} higher`}
            .
          </span>
        </p>
      )}

      {report && report.laws.length > 0 ? (
        <ul className="wallet-run-laws" aria-label="Law scores">
          {report.laws.map((law) => (
            <li className="wallet-run-law" key={law.law}>
              <span className="wallet-run-law-name">{law.name}</span>
              <span className="wallet-run-law-score mono">{law.score}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wallet-run-note">
          This response did not include the full report, so only the summary is shown.
        </p>
      )}
    </div>
  );
}
