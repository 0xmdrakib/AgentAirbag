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
import type { AccountState, WalletSelector } from '@near-wallet-selector/core';
import {
  ApiError,
  type AuthChallenge,
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
import { SignStep } from './SignStep';
import { WalletPicker } from './WalletPicker';

export type WalletStatus = 'loading' | 'disconnected' | 'connecting' | 'connected' | 'unavailable';

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
  openPicker: (returnFocus?: HTMLElement | null) => void;
  closePicker: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const CONNECT_TIMEOUT_MS = 120_000;

interface LegacyConnectWallet {
  /** Older selector versions exposed connect(); v10 injects signIn() instead. */
  connect?: (params: { contractId?: string; methodNames?: string[] }) => Promise<unknown>;
}

/**
 * Try the selected module without the upstream modal. v10 wallets expose signIn(); a
 * couple of older builds still expose connect(), so both are accepted. Any failure or
 * an empty account list is reported as an unavailable wallet.
 */
async function tryDirectSignIn(
  selector: WalletSelector,
  walletId: string,
): Promise<Array<AccountState>> {
  let timer = 0;
  try {
    const wallet = await selector.wallet(walletId);
    const legacy = wallet as unknown as LegacyConnectWallet;
    const signIn = wallet.signIn as unknown as (params: {
      contractId?: string;
      methodNames?: string[];
    }) => Promise<unknown>;
    const attempt = typeof legacy.connect === 'function' ? legacy.connect({}) : signIn({});

    await Promise.race([
      attempt,
      new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(() => {
          reject(
            new Error('The wallet did not answer in time. Close the wallet window and try again.'),
          );
        }, CONNECT_TIMEOUT_MS);
      }),
    ]);

    const state = selector.store.getState();
    if (state.selectedWalletId !== walletId) return [];
    return state.accounts;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

function isPopupBlocked(caught: unknown): boolean {
  const message = caught instanceof Error ? caught.message : String(caught);
  return /popup/i.test(message);
}

/** Ask the wallet to sign the login challenge and exchange it for a server session. */
async function signAndVerify(
  selector: WalletSelector,
  walletId: string,
  fallbackAccountId: string,
  challenge: AuthChallenge,
): Promise<string> {
  const wallet = await selector.wallet(walletId);
  if (!wallet.signMessage) {
    throw new Error(
      'This wallet cannot sign the Agent Airbag login message. Try another NEAR wallet.',
    );
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
    accountId: signed.accountId || fallbackAccountId,
    publicKey: signed.publicKey,
    signature: signed.signature,
    nonce: challenge.nonce,
    message: challenge.message,
    recipient: challenge.recipient,
    callbackUrl,
  });
  return session.accountId ?? signed.accountId ?? fallbackAccountId;
}

interface PendingSign {
  walletId: string;
  accountId: string;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('loading');
  const [pendingSign, setPendingSign] = useState<PendingSign | null>(null);
  const [signing, setSigning] = useState(false);
  const pendingChallengeRef = useRef<AuthChallenge | null>(null);
  const signingRef = useRef(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const connectingRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pickerReturnFocusRef = useRef<HTMLElement | null>(null);

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
          : describeError(
              caught,
              'The wallet service is not available. The simulator still works.',
            ),
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

  const openPicker = useCallback(
    (returnFocus?: HTMLElement | null) => {
      if (connectingRef.current || status === 'connected') return;

      if (status === 'unavailable') {
        setError(
          'The Airbag API is not running. The simulator still works, but saving needs the API.',
        );
        return;
      }

      const activeElement = document.activeElement;
      pickerReturnFocusRef.current =
        returnFocus ?? (activeElement instanceof HTMLElement ? activeElement : null);
      setPickerOpen(true);
    },
    [status],
  );

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    const target = pickerReturnFocusRef.current;
    pickerReturnFocusRef.current = null;
    window.setTimeout(() => target?.focus(), 0);
  }, []);

  const connectWithWallet = useCallback(
    async (walletId: string) => {
      if (connectingRef.current || status === 'connected') return;

      if (status === 'unavailable') {
        setError(
          'The Airbag API is not running. The simulator still works, but saving needs the API.',
        );
        return;
      }

      setPickerOpen(false);
      pickerReturnFocusRef.current = null;
      connectingRef.current = true;
      setError(null);
      setStatus('connecting');

      try {
        const { selector } = await loadWallet();
        const accounts = (await tryDirectSignIn(selector, walletId)).filter((account) =>
          Boolean(account.accountId),
        );

        if (accounts.length === 0) {
          throw new Error(
            'This wallet is not available in this browser. Install its extension or pick another wallet.',
          );
        }

        const state = selector.store.getState();
        const active = accounts.find((account) => account.active) ?? accounts[0];
        if (!active?.accountId) {
          throw new Error('The wallet connected but did not share a NEAR account.');
        }

        const target = state.selectedWalletId ?? walletId;
        try {
          const challenge = await getAuthNonce();
          const signedIn = await signAndVerify(selector, target, active.accountId, challenge);
          setAccountId(signedIn);
          setStatus('connected');
          setError(null);
        } catch (signError) {
          // Some wallets (Meteor) open a second popup to sign. After the first popup the
          // browser no longer counts this as a click and blocks it, so ask for one more
          // click and open the popup from that.
          if (!isPopupBlocked(signError)) throw signError;
          setPendingSign({ walletId: target, accountId: active.accountId });
          setStatus('disconnected');
        }
      } catch (caught) {
        setAccountId(null);
        setStatus(isApiUnavailable(caught) ? 'unavailable' : 'disconnected');
        const message = describeError(caught, 'The wallet could not connect. Try again.');
        setError(/cancel|closed|reject|denied/i.test(message) ? null : message);
      } finally {
        connectingRef.current = false;
      }
    },
    [status],
  );

  const finishSignIn = useCallback(async () => {
    const pending = pendingSign;
    const challenge = pendingChallengeRef.current;
    if (!pending || signingRef.current) return;
    signingRef.current = true;
    setSigning(true);
    setError(null);

    try {
      const { selector } = await loadWallet();
      const fresh = challenge ?? (await getAuthNonce());
      const signedIn = await signAndVerify(selector, pending.walletId, pending.accountId, fresh);
      pendingChallengeRef.current = null;
      setPendingSign(null);
      setAccountId(signedIn);
      setStatus('connected');
    } catch (caught) {
      pendingChallengeRef.current = null;
      const message = describeError(caught, 'The wallet could not connect. Try again.');
      setPendingSign(null);
      setAccountId(null);
      setStatus(isApiUnavailable(caught) ? 'unavailable' : 'disconnected');
      setError(/cancel|closed|reject|denied/i.test(message) ? null : message);
    } finally {
      signingRef.current = false;
      setSigning(false);
    }
  }, [pendingSign]);

  const cancelSignIn = useCallback(() => {
    pendingChallengeRef.current = null;
    setPendingSign(null);
    void (async () => {
      try {
        const { selector } = await loadWallet();
        if (selector.isSignedIn()) await (await selector.wallet()).signOut();
      } catch {
        // A half-finished wallet session is harmless; the server session is the boundary.
      }
    })();
  }, []);

  // Fetch the sign-in message ahead of the click so the popup opens with no await in between.
  useEffect(() => {
    if (!pendingSign) return;
    let cancelled = false;
    void getAuthNonce()
      .then((challenge) => {
        if (!cancelled) pendingChallengeRef.current = challenge;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pendingSign]);

  const connect = useCallback(async () => {
    if (connectingRef.current || status === 'connected') return;
    openPicker();
  }, [status, openPicker]);

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
      openPicker,
      closePicker,
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
      openPicker,
      closePicker,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <MyRuns open={runsOpen} accountId={accountId} onClose={closeRuns} />
      <WalletPicker
        open={pickerOpen}
        onClose={closePicker}
        onSelect={(walletId) => void connectWithWallet(walletId)}
      />
      {pendingSign && (
        <SignStep
          accountId={pendingSign.accountId}
          busy={signing}
          onApprove={() => void finishSignIn()}
          onCancel={cancelSignIn}
        />
      )}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside WalletProvider');
  return value;
}
