import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Subscription } from '@near-wallet-selector/core';
import {
  ApiError,
  describeError,
  fetchMe,
  getAuthNonce,
  isApiUnavailable,
  logout,
  verifyAuth,
} from './api';
import { walletNonce } from './buffer-shim';
import { MyRuns } from './MyRuns';
import { loadWallet } from './selector';

export type WalletStatus =
  | 'loading'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'unavailable';

export interface WalletContextValue {
  status: WalletStatus;
  accountId: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
  openRuns: (returnFocus?: HTMLElement | null) => void;
  closeRuns: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const CONNECT_TIMEOUT_MS = 120_000;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('loading');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);

  const connectingRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const session = await fetchMe();
      if (!session.accountId) {
        setAccountId(null);
        setStatus('disconnected');
        setError(null);
        return;
      }
      setAccountId(session.accountId);
      setStatus('connected');
      setError(null);
    } catch (caught) {
      setAccountId(null);
      if (caught instanceof ApiError && caught.status === 401) {
        setStatus('disconnected');
        setError(null);
        return;
      }
      setStatus('unavailable');
      setError(
        isApiUnavailable(caught)
          ? null
          : describeError(caught, 'The wallet service is not available. The simulator still works.'),
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadWallet()
      .then(({ selector }) => {
        if (cancelled) return;
        // Reopen the wallet module the selector remembered. A server session may already
        // exist, in which case no extra signature is needed.
        if (selector.isSignedIn()) {
          void selector.wallet().catch(() => undefined);
        }
      })
      .catch(() => {
        // Connect reports a readable error when it retries setup.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    if (connectingRef.current || status === 'connected') return;

    if (status === 'unavailable') {
      setError('The Airbag API is not running. The simulator still works, but saving needs the API.');
      return;
    }

    connectingRef.current = true;
    setError(null);
    setStatus('connecting');

    try {
      const { selector, modal } = await loadWallet();

      if (!selector.isSignedIn()) {
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let timer = 0;
          let signedIn: Subscription | null = null;
          let hidden: Subscription | null = null;

          const cleanup = () => {
            window.clearTimeout(timer);
            signedIn?.remove();
            hidden?.remove();
          };
          const finish = (failure?: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (failure) reject(failure);
            else resolve();
          };

          signedIn = selector.on('signedIn', () => finish());
          hidden = modal.on('onHide', ({ hideReason }) => {
            if (hideReason === 'user-triggered') {
              finish(new Error('Wallet connection was closed before it finished.'));
            }
          });
          timer = window.setTimeout(() => {
            finish(new Error('The wallet did not answer in time. Close the wallet window and try again.'));
          }, CONNECT_TIMEOUT_MS);

          try {
            modal.show();
          } catch (caught) {
            finish(caught instanceof Error ? caught : new Error('The wallet modal could not open.'));
          }
        });
      }

      const state = selector.store.getState();
      const active = state.accounts.find((account) => account.active) ?? state.accounts[0];
      if (!active?.accountId) {
        throw new Error('The wallet connected but did not share a NEAR account.');
      }

      const challenge = await getAuthNonce();
      const wallet = await selector.wallet(state.selectedWalletId ?? undefined);
      if (!wallet.signMessage) {
        throw new Error('This wallet cannot sign the Airbag login message. Try another NEAR wallet.');
      }

      const callbackUrl = window.location.origin;
      const signed = await wallet.signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: walletNonce(challenge.nonce) as unknown as Buffer,
        callbackUrl,
      });
      if (!signed?.signature || !signed.publicKey) {
        throw new Error('The wallet did not return a signature. Try connecting again.');
      }

      const session = await verifyAuth({
        accountId: signed.accountId || active.accountId,
        publicKey: signed.publicKey,
        signature: signed.signature,
        nonce: challenge.nonce,
        message: challenge.message,
        recipient: challenge.recipient,
        callbackUrl,
      });

      setAccountId(session.accountId ?? signed.accountId ?? active.accountId);
      setStatus('connected');
      setError(null);
    } catch (caught) {
      setAccountId(null);
      setStatus(isApiUnavailable(caught) ? 'unavailable' : 'disconnected');
      setError(describeError(caught, 'The wallet could not connect. Try again.'));
    } finally {
      connectingRef.current = false;
    }
  }, [status]);

  const disconnect = useCallback(async () => {
    setError(null);

    try {
      const { selector } = await loadWallet();
      if (selector.isSignedIn()) {
        const wallet = await selector.wallet();
        await wallet.signOut();
      }
    } catch {
      // The server session is the real auth boundary; a stale wallet session is harmless.
    }

    let apiGone = false;
    try {
      await logout();
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.status === 401)) {
        apiGone = isApiUnavailable(caught);
        if (!apiGone) {
          setError(describeError(caught, 'The server session could not be closed.'));
        }
      }
    }

    setAccountId(null);
    setStatus(apiGone ? 'unavailable' : 'disconnected');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const openRuns = useCallback((returnFocus?: HTMLElement | null) => {
    const activeElement = document.activeElement;
    returnFocusRef.current =
      returnFocus ?? (activeElement instanceof HTMLElement ? activeElement : null);
    setRunsOpen(true);
  }, []);

  const closeRuns = useCallback(() => {
    setRunsOpen(false);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    window.setTimeout(() => target?.focus(), 0);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      accountId,
      error,
      connect,
      disconnect,
      refresh,
      clearError,
      openRuns,
      closeRuns,
    }),
    [
      status,
      accountId,
      error,
      connect,
      disconnect,
      refresh,
      clearError,
      openRuns,
      closeRuns,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <MyRuns open={runsOpen} accountId={accountId} onClose={closeRuns} />
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside WalletProvider');
  return value;
}
