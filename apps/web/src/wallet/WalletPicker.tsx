import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/format';
import { ArrowRightIcon, ChevronIcon, WalletIcon, XIcon } from '../components/Icons';
import { loadWallet } from './selector';

/** The wallets shown first, in this order. Meteor leads: it is the wallet NEAR points users to. */
const PRIMARY_WALLET_IDS = ['meteor-wallet', 'nightly', 'okx-wallet', 'sender'];

/** MyNearWallet is being retired (limited mode since Oct 2026), so it always sits last. */
const RETIRING_WALLET_IDS = ['my-near-wallet'];

type LoadState = 'loading' | 'ready' | 'error';

interface PickerWallet {
  id: string;
  name: string;
  iconUrl: string;
}

export interface WalletPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (walletId: string) => void;
}

function isPrimaryWallet(walletId: string): boolean {
  return PRIMARY_WALLET_IDS.includes(walletId);
}

export function WalletPicker({ open, onClose, onSelect }: WalletPickerProps) {
  const [wallets, setWallets] = useState<PickerWallet[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [failedIcons, setFailedIcons] = useState<ReadonlySet<string>>(() => new Set());

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const noteId = useId();
  const titleId = useId();
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setShowAll(false);

    void loadWallet()
      .then(({ selector }) => {
        if (cancelled) return;
        const next = selector.store.getState().modules.map((module) => ({
          id: module.id,
          name: module.metadata.name,
          iconUrl: module.metadata.iconUrl,
        }));
        setWallets(next);
        setFailedIcons(new Set());
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [open, retryCount]);

  const primaryWallets = PRIMARY_WALLET_IDS.map((walletId) =>
    wallets.find((wallet) => wallet.id === walletId),
  ).filter((wallet): wallet is PickerWallet => Boolean(wallet));
  const extraWallets = wallets
    .filter((wallet) => !isPrimaryWallet(wallet.id))
    .sort(
      (left, right) =>
        Number(RETIRING_WALLET_IDS.includes(left.id)) - Number(RETIRING_WALLET_IDS.includes(right.id)),
    );
  const visibleWallets = showAll ? [...primaryWallets, ...extraWallets] : primaryWallets;

  useEffect(() => {
    if (!open) return;
    if (loadState === 'ready' && visibleWallets.length > 0) {
      rowRefs.current[0]?.focus();
      return;
    }
    closeRef.current?.focus();
  }, [open, loadState]);

  const retry = useCallback(() => {
    setLoadState('loading');
    setRetryCount((value) => value + 1);
  }, []);

  const markIconFailed = useCallback((walletId: string) => {
    setFailedIcons((current) => {
      if (current.has(walletId)) return current;
      const next = new Set(current);
      next.add(walletId);
      return next;
    });
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key === 'Tab') {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    const rows = rowRefs.current
      .slice(0, visibleWallets.length)
      .filter((row): row is HTMLButtonElement => Boolean(row));
    if (rows.length === 0) return;

    event.preventDefault();
    const active = rows.findIndex((row) => row === document.activeElement);
    if (event.key === 'Home') {
      rows[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      rows[rows.length - 1]?.focus();
      return;
    }
    if (active === -1) {
      (event.key === 'ArrowUp' ? rows[rows.length - 1] : rows[0])?.focus();
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : -1;
    rows[(active + step + rows.length) % rows.length]?.focus();
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className="wallet-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={noteId}
      onKeyDown={handleKeyDown}
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="wallet-picker-panel">
        <header className="wallet-picker-head">
          <div className="wallet-picker-heading">
            <p className="eyebrow">Connect</p>
            <h2 className="wallet-picker-title" id={titleId}>
              Choose a wallet
            </h2>
            <p className="wallet-picker-note" id={noteId}>
              Pick the NEAR wallet you use. Your wallet approves the connection in its own window.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button wallet-picker-close"
            onClick={onClose}
            aria-label="Close the wallet picker"
          >
            <XIcon size={20} />
          </button>
        </header>

        <div className="wallet-picker-body">
        {loadState === 'loading' && (
          <>
            <p className="sr-only" role="status">
              Loading wallets
            </p>
            <ul className="wallet-picker-list wallet-picker-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((row) => (
                <li className="wallet-picker-item" key={row}>
                  <div className="wallet-picker-row wallet-picker-skeleton-row">
                    <span className="wallet-picker-row-icon wallet-picker-skeleton-icon" />
                    <span className="wallet-picker-skeleton-name" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {loadState === 'error' && (
          <div className="wallet-picker-error" role="alert">
            <p className="wallet-picker-error-text">
              The wallets could not load. Check your connection and try again.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm wallet-picker-retry"
              onClick={retry}
            >
              Retry
            </button>
          </div>
        )}

        {loadState === 'ready' && (
          <>
            <ul className="wallet-picker-list" id={listId} aria-label="Wallets">
              {visibleWallets.map((wallet, index) => {
                const iconFailed = failedIcons.has(wallet.id);
                return (
                  <li className="wallet-picker-item" key={wallet.id}>
                    <button
                      ref={(row) => {
                        rowRefs.current[index] = row;
                      }}
                      type="button"
                      className="wallet-picker-row"
                      data-wallet-id={wallet.id}
                      onClick={() => onSelect(wallet.id)}
                    >
                      <span className="wallet-picker-row-icon" aria-hidden="true">
                        {wallet.iconUrl && !iconFailed ? (
                          <img
                            className="wallet-picker-row-icon-img"
                            src={wallet.iconUrl}
                            alt=""
                            width={32}
                            height={32}
                            loading="lazy"
                            onError={() => markIconFailed(wallet.id)}
                          />
                        ) : (
                          <WalletIcon size={32} />
                        )}
                      </span>
                      <span className="wallet-picker-row-name">{wallet.name}</span>
                      <span className="wallet-picker-row-chevron" aria-hidden="true">
                        <ArrowRightIcon size={16} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {extraWallets.length > 0 && (
              <button
                type="button"
                className="wallet-picker-more"
                aria-expanded={showAll}
                aria-controls={listId}
                onClick={() => setShowAll((value) => !value)}
              >
                <span className="wallet-picker-more-label">
                  {showAll ? 'Show fewer' : 'More wallets'}
                </span>
                <span
                  className={cx(
                    'wallet-picker-more-icon',
                    showAll && 'wallet-picker-more-icon-open',
                  )}
                  aria-hidden="true"
                >
                  <ChevronIcon size={16} />
                </span>
              </button>
            )}
          </>
        )}
        </div>

      </div>
    </div>,
    document.body,
  );
}
