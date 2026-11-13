import { useEffect, useMemo, useState } from 'react';
import type { RunReport } from '@airbag/core';
import { formatAmount, formatUsd, cx } from '../lib/format';
import { resultById, tokenDecimals, tokenSymbol } from '../lib/report';
import { MarkerLogo } from './MarkerLogo';
import { CheckIcon, XIcon } from './Icons';

const INITIAL_USD = 10000;
const LOOP_MS = 8200;
const PHASE_LABELS = ['Pay', 'Land', 'Timeout', 'Retry', 'Verdict'];

export function HeroCrash({ naive, hardened }: { naive: RunReport; hardened: RunReport }) {
  const data = useMemo(() => {
    const result = resultById(naive, 'timeout-after-transfer');
    const transfers =
      result?.events.filter((event) => event.kind === 'ledger.transfer' && event.funding) ?? [];
    const first = transfers[0];
    const assetId =
      first && first.kind === 'ledger.transfer'
        ? first.assetId
        : 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
    const decimals = tokenDecimals(assetId);
    const amount = first && first.kind === 'ledger.transfer' ? BigInt(first.amount) : 100_000_000n;
    return {
      assetId,
      decimals,
      symbol: tokenSymbol(assetId),
      amount,
      loss: result?.lossUsd ?? '0.00',
    };
  }, [naive, hardened]);

  const [elapsed, setElapsed] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setElapsed(6500);
      return undefined;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      setElapsed((now - start) % LOOP_MS);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  // 0 pay · 1 landed · 2 timeout · 3 paid again · 4 seatbelt verdict
  const phase =
    elapsed < 1400 ? 0 : elapsed < 3000 ? 1 : elapsed < 4300 ? 2 : elapsed < 6000 ? 3 : 4;
  const seatbelt = phase === 4;
  const paidTwice = phase === 3;
  const amountHuman = Number(data.amount) / 10 ** data.decimals;
  const payments = phase === 0 ? 0 : phase === 3 ? 2 : 1;
  const balance = INITIAL_USD - amountHuman * payments;
  const caption = [
    'An AI agent swaps 100 USDC.',
    'The transfer lands.',
    'The confirmation call times out.',
    'It pays again.',
    'Seatbelt checks the status first. Same crash, no loss.',
  ][phase];
  const tone = seatbelt ? 'pass' : paidTwice ? 'fail' : 'neutral';
  const fmt = (value: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      value,
    );
  const unit = formatAmount(data.amount.toString(), data.decimals);

  return (
    <div className={cx('hero-crash', `hero-crash-${tone}`)}>
      <div className="hero-crash-bar">
        <span className="hero-crash-title">
          <MarkerLogo size={20} /> Live crash · timeout-after-transfer
        </span>
        <span className={cx('chip', seatbelt ? 'chip-pass' : 'chip-fail')}>
          {seatbelt ? 'Seatbelt' : 'Dummy'}
        </span>
      </div>

      <ol className="hero-steps" aria-label="Crash timeline">
        {PHASE_LABELS.map((step, index) => (
          <li
            key={step}
            className={cx(
              'hero-step',
              index < phase && 'hero-step-done',
              index === phase && 'hero-step-current',
            )}
          >
            <span className="hero-step-dot" />
            <span className="hero-step-name">{step}</span>
          </li>
        ))}
      </ol>

      <p className="hero-caption" aria-live="polite">
        {caption}
      </p>

      <div className="hero-ledger">
        <div>
          <span className="hero-ledger-label">User wallet</span>
          <span className={cx('hero-ledger-value mono', paidTwice && 'flash-fail')}>
            {fmt(balance)} <small>{data.symbol}</small>
          </span>
        </div>
        <span className={cx('hero-status', `hero-status-${tone}`)}>
          {['PENDING_DEPOSIT', 'PROCESSING', '504 TIMEOUT', 'PAID AGAIN', 'STATUS CHECKED'][phase]}
        </span>
      </div>

      <ul className="hero-flow">
        <li className={cx('hero-flow-row', phase >= 1 && 'hero-flow-on')}>
          <CheckIcon size={16} />
          <span>Payment 1</span>
          <span className="mono">
            {unit} {data.symbol}
          </span>
        </li>
        <li className={cx('hero-flow-row hero-flow-warn', phase >= 2 && 'hero-flow-on')}>
          <XIcon size={16} />
          <span>Confirmation call</span>
          <span className="mono">504</span>
        </li>
        {seatbelt ? (
          <li className="hero-flow-row hero-flow-pass hero-flow-on">
            <CheckIcon size={16} />
            <span>Status checked, no retry</span>
            <span className="mono">0 extra</span>
          </li>
        ) : (
          <li className={cx('hero-flow-row hero-flow-fail', phase >= 3 && 'hero-flow-on')}>
            <XIcon size={16} />
            <span>Payment 2 (duplicate)</span>
            <span className="mono">
              {unit} {data.symbol}
            </span>
          </li>
        )}
      </ul>

      <div className="hero-loss-row">
        <span>Simulated loss</span>
        <strong className={cx('mono', seatbelt ? 'text-pass' : paidTwice ? 'text-fail' : 'text-muted')}>
          {formatUsd(paidTwice ? Number(data.loss) : 0)}
        </strong>
      </div>
      <p className="hero-caption-foot">
        Played from the real EventLog in the {seatbelt ? 'Seatbelt' : 'Dummy'} report. No funds move.
      </p>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(query.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);
  return reduced;
}
