import { useEffect, useRef, useState } from 'react';
import type { RunReport } from '@airbag/core';
import { cx } from '../lib/format';
import { useWallet } from '../wallet/WalletProvider';
import {
  ApiError,
  describeError,
  isApiUnavailable,
  listRuns,
  saveRun,
} from '../wallet/api';
import { BookmarkIcon, CheckIcon, WalletIcon } from './Icons';

const STORAGE_KEY = 'airbag:saved-runs';

interface LocalSave {
  accountId: string;
  hash: string;
  id: string;
  savedAt: string;
}

function readLocalSaves(): LocalSave[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocalSave => {
      if (typeof item !== 'object' || item === null) return false;
      const entry = item as Partial<LocalSave>;
      return (
        typeof entry.accountId === 'string' &&
        typeof entry.hash === 'string' &&
        typeof entry.id === 'string'
      );
    });
  } catch {
    return [];
  }
}

function localSaveFor(accountId: string, hash: string): LocalSave | undefined {
  return readLocalSaves().find((entry) => entry.accountId === accountId && entry.hash === hash);
}

function rememberSave(accountId: string, hash: string, id: string): void {
  try {
    const next = readLocalSaves().filter(
      (entry) => !(entry.accountId === accountId && entry.hash === hash),
    );
    next.unshift({ accountId, hash, id, savedAt: new Date().toISOString() });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 50)));
  } catch {
    // Local history is a convenience; the server list is the source of truth.
  }
}

export function SaveRun({ report }: { report: RunReport }) {
  const {
    status,
    accountId,
    error: walletError,
    connect,
    refresh,
    openRuns,
  } = useWallet();

  const [savedId, setSavedId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [apiGone, setApiGone] = useState(false);

  const viewRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setSaveError(null);

    if (status !== 'connected' || !accountId) {
      setSavedId(null);
      setChecking(false);
      return undefined;
    }

    const local = localSaveFor(accountId, report.hash);
    setSavedId(local?.id ?? null);
    setChecking(true);

    void listRuns()
      .then((runs) => {
        if (cancelled) return;
        const match = runs.find((run) => run.hash === report.hash);
        if (match) {
          setSavedId(match.id);
          rememberSave(accountId, report.hash, match.id);
        } else if (local) {
          setSavedId(local.id);
        }
        setApiGone(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 401) {
          void refresh();
          return;
        }
        if (isApiUnavailable(caught)) setApiGone(true);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, accountId, report.hash, refresh]);

  useEffect(() => {
    if (!justSaved) return;
    const target = viewRef.current;
    if (!target) return;
    setJustSaved(false);
    openRuns(target);
  }, [justSaved, openRuns]);

  const handleSave = async () => {
    if (saving || !accountId) return;
    setSaving(true);
    setSaveError(null);

    try {
      const run = await saveRun(report);
      setSavedId(run.id);
      rememberSave(accountId, report.hash, run.id);
      setJustSaved(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setSaveError('Your wallet session has expired. Connect again.');
        void refresh();
        return;
      }
      if (caught instanceof ApiError && caught.status === 409) {
        setSavedId(report.hash);
        rememberSave(accountId, report.hash, report.hash);
        setJustSaved(true);
        return;
      }
      if (isApiUnavailable(caught)) {
        setApiGone(true);
        return;
      }
      setSaveError(describeError(caught, 'The report could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || status === 'unavailable' || apiGone) {
    return null;
  }

  if (status !== 'connected') {
    return (
      <div className="wallet-save">
        <button
          type="button"
          className="btn btn-secondary btn-sm wallet-save-connect"
          onClick={() => void connect()}
          disabled={status === 'connecting'}
        >
          {status === 'connecting' ? (
            <span className="wallet-spinner" aria-hidden="true" />
          ) : (
            <WalletIcon size={14} />
          )}
          {status === 'connecting' ? 'Connecting' : 'Connect to save'}
        </button>
        {walletError && (
          <p className="wallet-save-error" role="alert">
            {walletError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cx('wallet-save', savedId && 'wallet-save-saved')}
      aria-busy={checking || saving || undefined}
    >
      {savedId ? (
        <>
          <span className="wallet-save-state" role="status">
            <CheckIcon size={14} /> Saved
          </span>
          <button
            ref={viewRef}
            type="button"
            className="wallet-save-link"
            onClick={() => openRuns(viewRef.current)}
          >
            View my runs
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-primary btn-sm wallet-save-button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <span className="wallet-spinner" aria-hidden="true" />
            ) : (
              <BookmarkIcon size={14} />
            )}
            {saving ? 'Saving' : 'Save to my runs'}
          </button>
          {saveError && (
            <p className="wallet-save-error" role="alert">
              {saveError}
            </p>
          )}
        </>
      )}
    </div>
  );
}
