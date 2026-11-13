import { useEffect, useMemo, useState } from 'react';
import type { RunReport } from '@airbag/core';
import { formatAmount, formatUsd } from '../lib/format';
import { resultById, tokenDecimals, tokenSymbol } from '../lib/report';
import { cx } from '../lib/format';
import { MarkerLogo } from './MarkerLogo';
import { Chip } from './Primitives';

const INITIAL_USD = 10000;

export function HeroCrash({ naive, hardened }: { naive: RunReport; hardened: RunReport }) {
  const data = useMemo(() => {
    const result = resultById(naive, 'timeout-after-transfer');
    const transfers =
      result?.events.filter(
        (event) => event.kind === 'ledger.transfer' && event.funding,
      ) ?? [];
    const first = transfers[0];
    const second = transfers[1];
    const assetId =
      first && first.kind === 'ledger.transfer'
        ? first.assetId
        : 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
    const decimals = tokenDecimals(assetId);
    const symbol = tokenSymbol(assetId);
    const amount =
      first && first.kind === 'ledger.transfer' ? BigInt(first.amount) : 100_000_000n;
    const loss =
      result?.lossUsd ??
      ((Number(amount) / 10 ** decimals) * 1).toFixed(2);
    const survive = resultById(hardened, 'timeout-after-transfer');
    return {
      result,
      assetId,
      decimals,
      symbol,
      amount,
      loss,
      survived: survive?.verdict === 'PASS',
    };
  }, [naive, hardened]);

  const [elapsed, setElapsed] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setElapsed(6500);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      setElapsed((now - start) % 8200);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  const phase = reduced
    ? 6
    : elapsed < 1400
      ? 0
      : elapsed < 3000
        ? 1
        : elapsed < 4300
          ? 2
          : elapsed < 6000
            ? 3
            : 4;
  const seatbelt = phase >= 4;
  const paidTwice = phase >= 3;
  const paidOnce = phase >= 1;
  const amountHuman = Number(data.amount) / 10 ** data.decimals;
  const balance = seatbelt
    ? INITIAL_USD - amountHuman
    : paidTwice
      ? INITIAL_USD - amountHuman * 2
      : paidOnce
        ? INITIAL_USD - amountHuman
        : INITIAL_USD;
  const caption =
    phase === 0
      ? 'An AI agent swaps 100 USDC.'
      : phase === 1
        ? 'The transfer lands. The confirmation call is next.'
        : phase === 2
          ? 'The confirmation call times out.'
          : phase === 3
            ? 'It pays again.'
            : 'Seatbelt checks the status first. Same crash, no loss.';

  return (
    <div className={cx('hero-crash', seatbelt && 'hero-crash-safe', paidTwice && !seatbelt && 'hero-crash-impact')}>
      <div className="hero-crash-bar">
        <span className="hero-crash-title">
          <MarkerLogo size={18} /> live crash
        </span>
        <Chip tone={seatbelt ? 'pass' : paidTwice ? 'fail' : 'warn'}>
          {seatbelt ? 'Seatbelt' : 'Dummy'}
        </Chip>
      </div>
      <div className="hero-caption" aria-live="polite">
        {caption}
      </div>
      <div className="hero-ledger">
        <div>
          <span className="hero-ledger-label">User wallet</span>
          <span className={cx('hero-ledger-value mono', paidTwice && !seatbelt && 'flash-fail')}>
            {formatBalanceNumber(balance)} <small>{data.symbol}</small>
          </span>
        </div>
        <div className="hero-status">
          <span className={cx('status-dot', seatbelt ? 'dot-pass' : paidTwice ? 'dot-fail' : 'dot-warn')} />
          {phase === 0
            ? 'PENDING_DEPOSIT'
            : phase === 1
              ? 'PROCESSING'
              : phase === 2
                ? '504 GATEWAY TIMEOUT'
                : phase === 3
                  ? 'PAID AGAIN'
                  : 'STATUS CHECKED'}
        </div>
      </div>
      <div className="hero-transfer-row mono">
        <span>deposit</span>
        <span>→</span>
        <span>{formatAmount(data.amount.toString(), data.decimals)} {data.symbol}</span>
      </div>
      <div className="hero-loss-row">
        <span>{seatbelt ? 'Simulated loss' : paidTwice ? 'Simulated loss' : 'Simulated loss so far'}</span>
        <span className={cx('mono', seatbelt ? 'text-pass' : paidTwice ? 'text-fail' : 'text-muted')}>
          {formatUsd(seatbelt ? 0 : paidTwice ? Number(data.loss) : 0)}
        </span>
      </div>
      <div className="hero-caption-foot">
        {seatbelt
          ? 'Same crash. It asked the status before retrying.'
          : 'Played from the real EventLog in the Dummy report.'}
      </div>
      {!seatbelt && <div className="hero-scan" aria-hidden="true" />}
      {paidTwice && !seatbelt && (
        <svg className="hero-crack" viewBox="0 0 120 40" aria-hidden="true">
          <path d="M2 20 L22 14 L38 24 L58 9 L76 25 L98 16 L118 23" />
        </svg>
      )}
    </div>
  );
}

function formatBalanceNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
