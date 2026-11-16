import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightIcon, XIcon } from '../components/Icons';

export interface SignStepProps {
  accountId: string;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
}

/**
 * The last step of a wallet sign-in. Some wallets open a second popup to sign the login
 * message, and a browser only allows a popup straight after a click. This asks for that click.
 */
export function SignStep({ accountId, busy, onApprove, onCancel }: SignStepProps) {
  const titleId = useId();
  const noteId = useId();
  const approveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    approveRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return createPortal(
    <div
      className="wallet-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={noteId}
      onKeyDown={handleKeyDown}
    >
      <div className="wallet-picker-panel sign-step-panel">
        <header className="wallet-picker-head">
          <div className="wallet-picker-heading">
            <p className="eyebrow">Almost done</p>
            <h2 className="wallet-picker-title" id={titleId}>
              Approve the sign-in
            </h2>
            <p className="wallet-picker-note" id={noteId}>
              <span className="sign-step-account">{accountId}</span> is connected. One more approval
              signs a free login message. It moves no funds and sends no transaction.
            </p>
          </div>
          <button
            type="button"
            className="icon-button wallet-picker-close"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel the sign-in"
          >
            <XIcon size={20} />
          </button>
        </header>
        <div className="sign-step-actions">
          <button
            ref={approveRef}
            type="button"
            className="btn btn-primary"
            onClick={onApprove}
            disabled={busy}
          >
            {busy ? 'Waiting for the wallet' : 'Approve in wallet'}
            {!busy && <ArrowRightIcon size={16} />}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
