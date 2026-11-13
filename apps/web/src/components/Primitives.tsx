import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx, formatUsd } from '../lib/format';
import { gradeTone, verdictWord } from '../lib/report';
import type { Verdict } from '@airbag/core';
import { AlertIcon, CheckIcon, CopyIcon, XIcon } from './Icons';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  return (
    <button
      className={cx('btn', `btn-${variant}`, `btn-${size}`, className)}
      type={props.type ?? 'button'}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  children,
  className,
  ...props
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  'aria-label'?: string;
}) {
  return (
    <a
      href={href}
      className={cx('btn', `btn-${variant}`, `btn-${size}`, className)}
      {...props}
    >
      {children}
    </a>
  );
}

export function VerdictPill({ verdict, subtle = false }: { verdict: Verdict; subtle?: boolean }) {
  const Icon = verdict === 'PASS' ? CheckIcon : verdict === 'WARN' ? AlertIcon : XIcon;
  return (
    <span className={cx('verdict', `verdict-${verdict.toLowerCase()}`, subtle && 'verdict-subtle')}>
      <Icon size={13} />
      {verdictWord(verdict)}
    </span>
  );
}

export function LawBadge({ law, short = false }: { law: number; short?: boolean }) {
  return (
    <span className="law-badge" aria-label={`Law ${law}${short ? '' : ': the seven laws'}`}>
      <span className="law-badge-num">{law}</span>
      {!short && <span className="law-badge-label">LAW {law}</span>}
    </span>
  );
}

export function GradeBadge({ grade, size = 'lg' }: { grade: string; size?: 'sm' | 'lg' }) {
  return (
    <span className={cx('grade-badge', `grade-${gradeTone(grade)}`, `grade-${size}`)}>
      <span className="grade-letter">{grade}</span>
      <span className="grade-caption">GRADE</span>
    </span>
  );
}

export function MoneyMeter({
  value,
  label = 'Simulated loss',
  size = 'md',
}: {
  value: string | number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const number = Number(value);
  return (
    <div className={cx('money-meter', `money-${size}`, number > 0 && 'money-loss')}>
      <span className="money-label">{label}</span>
      <span className="money-value mono">{formatUsd(number)}</span>
    </div>
  );
}

export function SimBanner({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cx('sim-banner', compact && 'sim-compact')} title="No real funds move">
      <span className="sim-dot" />
      {compact ? 'SIMULATION' : 'SIMULATION · no real funds'}
    </span>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'signal' | 'pass' | 'warn' | 'fail';
  className?: string;
}) {
  return <span className={cx('chip', `chip-${tone}`, className)}>{children}</span>;
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button type="button" className={cx('copy-button', className)} onClick={copy}>
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function CopyField({
  label,
  value,
  mono = true,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <span className={cx('copy-value', mono && 'mono')}>{href ? <a href={href}>{value}</a> : value}</span>
      <CopyButton value={value} />
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-card">
      <span className="state-glyph">◇</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <div className="state-card state-error">
      <span className="state-glyph">!</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  body,
  right,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  right?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="h2">{title}</h2>
        {body && <p className="section-sub">{body}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'pass' | 'warn' | 'fail';
}) {
  return (
    <div className={cx('stat', tone && `stat-${tone}`)}>
      <span className="stat-value mono">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
