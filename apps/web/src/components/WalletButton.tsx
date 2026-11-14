import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '../lib/format';
import { useWallet } from '../wallet/WalletProvider';
import {
  BookmarkIcon,
  CheckIcon,
  ChevronIcon,
  CopyIcon,
  LogOutIcon,
  WalletIcon,
  XIcon,
} from './Icons';

export interface WalletButtonProps {
  /** Label used at 700px and narrower. The styling pass hides one of the two spans. */
  compactLabel?: string;
  className?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

function shortenAccount(accountId: string): string {
  if (accountId.length <= 10) return accountId;
  return `${accountId.slice(0, 5)}…${accountId.slice(-4)}`;
}

async function copyText(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the selection based fallback.
    }
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

export function WalletButton({ compactLabel = 'Connect', className }: WalletButtonProps) {
  const { status, accountId, error, disconnect, refresh, clearError, openRuns, openPicker } =
    useWallet();

  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [disconnecting, setDisconnecting] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef(0);
  const popoverId = useId();
  const popoverTitleId = useId();

  const connected = status === 'connected' && Boolean(accountId);
  const busy = status === 'loading' || status === 'connecting';
  const unavailable = status === 'unavailable';

  useEffect(() => {
    if (!connected) setOpen(false);
  }, [connected]);

  useEffect(() => {
    if (!open) {
      setCopyState('idle');
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    popoverRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => clearError(), 7000);
    return () => window.clearTimeout(timer);
  }, [error, clearError]);

  const handleCopy = async () => {
    if (!accountId) return;
    const copied = await copyText(accountId);
    setCopyState(copied ? 'copied' : 'failed');
    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), 1800);
  };

  const handleDisconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      await disconnect();
    } finally {
      setDisconnecting(false);
      setOpen(false);
    }
    triggerRef.current?.focus();
  };

  const ariaLabel = connected
    ? `Wallet menu for ${accountId}`
    : status === 'connecting'
      ? 'Connecting a NEAR wallet'
      : status === 'loading'
        ? 'Checking the wallet connection'
        : unavailable
          ? 'Connect a NEAR wallet. The Airbag API is not running.'
          : 'Connect a NEAR wallet';

  const fullLabel = status === 'connecting' ? 'Connecting' : 'Connect wallet';
  const shortLabel = status === 'connecting' ? 'Connecting' : compactLabel;

  return (
    <div className={cx('wallet', className)} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cx(
          'wallet-button',
          connected && 'wallet-button-connected',
          busy && 'wallet-button-busy',
          unavailable && 'wallet-button-unavailable',
          open && 'wallet-button-open',
        )}
        disabled={busy || unavailable}
        aria-busy={busy || undefined}
        aria-label={ariaLabel}
        aria-expanded={connected ? open : undefined}
        aria-haspopup={busy || unavailable ? undefined : 'dialog'}
        aria-controls={connected && open ? popoverId : undefined}
        title={unavailable ? 'Saving needs the Airbag API. The simulator still works.' : undefined}
        onClick={() => {
          if (connected) setOpen((value) => !value);
          else openPicker(triggerRef.current);
        }}
      >
        {connected && accountId ? (
          <>
            <span className="wallet-avatar" aria-hidden="true">
              {accountId.slice(0, 2).toUpperCase()}
            </span>
            <span className="wallet-label wallet-label-full">{shortenAccount(accountId)}</span>
            <span className="wallet-dot" aria-hidden="true" />
            <span className="wallet-chevron" aria-hidden="true">
              <ChevronIcon size={14} />
            </span>
          </>
        ) : busy ? (
          <>
            <span className="wallet-spinner" aria-hidden="true" />
            <span className="wallet-label wallet-label-full">{fullLabel}</span>
            <span className="wallet-label wallet-label-short">{shortLabel}</span>
          </>
        ) : (
          <>
            <WalletIcon size={16} />
            <span className="wallet-label wallet-label-full">{fullLabel}</span>
            <span className="wallet-label wallet-label-short">{shortLabel}</span>
          </>
        )}
      </button>

      {error && (
        <div className="wallet-toast" role="alert">
          <span className="wallet-toast-text">{error}</span>
          {unavailable && (
            <button type="button" className="wallet-toast-action" onClick={() => void refresh()}>
              Retry
            </button>
          )}
          <button
            type="button"
            className="wallet-toast-close"
            onClick={clearError}
            aria-label="Dismiss wallet message"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {connected && open && (
        <div
          ref={popoverRef}
          id={popoverId}
          className="wallet-popover"
          role="dialog"
          aria-labelledby={popoverTitleId}
          tabIndex={-1}
        >
          <h2 className="sr-only" id={popoverTitleId}>
            Wallet account
          </h2>
          <p className="wallet-popover-label">Signed in as</p>
          <p className="wallet-popover-account mono">{accountId}</p>
          <div className="wallet-popover-actions">
            <button
              type="button"
              className="wallet-popover-action"
              onClick={() => void handleCopy()}
            >
              {copyState === 'copied' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              <span>
                {copyState === 'copied'
                  ? 'Copied'
                  : copyState === 'failed'
                    ? 'Copy failed'
                    : 'Copy account'}
              </span>
            </button>
            <button
              type="button"
              className="wallet-popover-action"
              onClick={() => {
                setOpen(false);
                openRuns(triggerRef.current);
              }}
            >
              <BookmarkIcon size={16} />
              <span>My runs</span>
            </button>
            <button
              type="button"
              className="wallet-popover-action wallet-popover-disconnect"
              disabled={disconnecting}
              onClick={() => void handleDisconnect()}
            >
              <LogOutIcon size={16} />
              <span>{disconnecting ? 'Disconnecting' : 'Disconnect'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
