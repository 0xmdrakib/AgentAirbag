import { useState } from 'react';
import type { LogEvent } from '@airbag/core';
import { cx } from '../lib/format';
import { eventPlainText } from '../lib/simulate';
import { ChevronIcon, CodeIcon } from './Icons';

export function EventRow({
  event,
  active,
  onSelect,
}: {
  event: LogEvent;
  active?: boolean;
  onSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const fault = event.kind === 'fault.fired';
  const isLoss =
    (event.kind === 'ledger.lost' && Number(event.usd) > 0) ||
    (event.kind === 'ledger.transfer' && Boolean(event.lossUsd) && Number(event.lossUsd) > 0);

  return (
    <div
      id={`event-${event.i}`}
      className={cx(
        'event-row',
        fault && 'event-fault',
        isLoss && 'event-loss',
        active && 'event-active',
      )}
    >
      <button
        type="button"
        className="event-main"
        onClick={onSelect}
        aria-current={active ? 'step' : undefined}
      >
        <span className={cx('event-dot', `event-dot-${dotKind(event)}`)} />
        <span className="event-time mono">{formatTime(event.t)}</span>
        <span className="event-text">
          {fault && <span className="event-fault-label">AIRBAG FAULT</span>}
          {eventPlainText(event)}
        </span>
      </button>
      <button
        type="button"
        className="event-json-toggle"
        aria-label={open ? 'Hide raw JSON' : 'Show raw JSON'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <CodeIcon size={14} />
        <ChevronIcon size={12} className={open ? 'chevron-up' : undefined} />
      </button>
      {open && (
        <pre className="event-json mono">
          {JSON.stringify(event, null, 2)}
        </pre>
      )}
    </div>
  );
}

function dotKind(event: LogEvent): string {
  if (event.kind === 'fault.fired') return 'fault';
  if (event.kind === 'ledger.lost') return 'loss';
  if (event.kind === 'ledger.transfer' && event.lossUsd) return 'loss';
  if (event.kind === 'ledger.transfer' || event.kind === 'ledger.credit') return 'money';
  if (event.kind === 'agent.report') return 'report';
  return 'api';
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}
