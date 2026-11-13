import type { LogEvent, RunReport, ScenarioResult } from '@airbag/core';
import { allResults, tokenDecimals, tokenSymbol } from './report';
import { formatAmount, formatUsd } from './format';

export interface LedgerLine {
  account: string;
  assetId: string;
  amount: bigint;
}

export function depositAddresses(events: LogEvent[]): string[] {
  const out = new Set<string>();
  for (const event of events) {
    if (event.kind !== 'api.response' || !event.path.startsWith('/v0/quote')) continue;
    if (event.status >= 400 || !event.body || typeof event.body !== 'object') continue;
    const body = event.body as { quote?: { depositAddress?: string } };
    if (body.quote?.depositAddress) out.add(body.quote.depositAddress);
  }
  return [...out];
}

const LOST = 'lost';

export function ledgerAt(events: LogEvent[], upTo: number): Map<string, bigint> {
  const balances = new Map<string, bigint>();
  const add = (account: string, assetId: string, amount: bigint) => {
    const key = `${account}|${assetId}`;
    balances.set(key, (balances.get(key) ?? 0n) + amount);
  };
  for (const event of events) {
    if (event.i > upTo) break;
    if (event.kind === 'ledger.transfer') {
      add(event.from, event.assetId, -BigInt(event.amount));
      add(event.to, event.assetId, BigInt(event.amount));
    }
    if (event.kind === 'ledger.lost') {
      add(event.account, event.assetId, -BigInt(event.amount));
      add(`${LOST}:${event.reason}`, event.assetId, BigInt(event.amount));
    }
    if (event.kind === 'ledger.credit') {
      add(event.account, event.assetId, BigInt(event.amount));
    }
  }
  return balances;
}

export function balanceOf(
  balances: Map<string, bigint>,
  account: string,
  assetId: string,
): bigint {
  return balances.get(`${account}|${assetId}`) ?? 0n;
}

export function formatBalance(amount: bigint, assetId: string): string {
  return formatAmount(amount.toString(), tokenDecimals(assetId));
}

export function money(amount: bigint, assetId: string): string {
  return `${formatBalance(amount, assetId)} ${tokenSymbol(assetId)}`;
}

export interface LedgerRow {
  label: string;
  account: string;
  assetId: string;
  amount: bigint;
  tone?: 'user' | 'escrow' | 'recipient' | 'attacker' | 'lost';
}

export function ledgerRows(result: ScenarioResult, upTo = Number.MAX_SAFE_INTEGER): LedgerRow[] {
  const events = result.events;
  const balances = ledgerAt(events, upTo);
  const addresses = depositAddresses(events);
  const quoteEvent = events.find(
    (event) => event.kind === 'api.response' && event.path === '/v0/quote' && event.status < 400,
  );
  const quoteBody = quoteEvent?.kind === 'api.response' ? quoteEvent.body : undefined;
  const quote = (quoteBody as { quoteRequest?: { originAsset?: string; destinationAsset?: string } })
    ?.quoteRequest;
  const originAsset = quote?.originAsset ?? 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
  const destinationAsset = quote?.destinationAsset ?? 'nep141:wrap.near';
  const userAddress = '0x1111111111111111111111111111111111111111';
  const recipient = (quoteBody as { quoteRequest?: { recipient?: string } })?.quoteRequest?.recipient ?? 'alice.near';
  const originSymbol = tokenSymbol(originAsset);
  const initialAmount =
    originSymbol === 'cbBTC' ? 1_000_000n : BigInt(10_000) * 10n ** BigInt(tokenDecimals(originAsset));
  const key = `${userAddress}|${originAsset}`;
  balances.set(key, (balances.get(key) ?? 0n) + initialAmount);

  const rows: LedgerRow[] = [
    {
      label: 'User',
      account: userAddress,
      assetId: originAsset,
      amount: balanceOf(balances, userAddress, originAsset),
      tone: 'user',
    },
  ];
  addresses.slice(0, 2).forEach((address, index) => {
    rows.push({
      label: addresses.length > 1 ? `Deposit ${index + 1}` : 'Deposit',
      account: address,
      assetId: originAsset,
      amount: balanceOf(balances, address, originAsset),
      tone: 'escrow',
    });
  });
  rows.push({
    label: 'Recipient',
    account: recipient,
    assetId: destinationAsset,
    amount: balanceOf(balances, recipient, destinationAsset),
    tone: 'recipient',
  });
  const attackerRows = [...balances.keys()]
    .filter((key) => key.includes('0xbad') || key.includes('evil.near'))
    .map((key) => {
      const [account, assetId] = key.split('|') as [string, string];
      return {
        label: 'Attacker',
        account,
        assetId,
        amount: balances.get(key) ?? 0n,
        tone: 'attacker' as const,
      };
    });
  rows.push(...attackerRows);
  const lostRows = [...balances.keys()]
    .filter((key) => key.startsWith(`${LOST}:`))
    .map((key) => {
      const [reason, assetId] = key.split('|') as [string, string];
      return {
        label: `Lost · ${reason.slice(5)}`,
        account: reason,
        assetId,
        amount: balances.get(key) ?? 0n,
        tone: 'lost' as const,
      };
    });
  rows.push(...lostRows);
  return rows.filter((row) => row.amount !== 0n || row.tone === 'user' || row.tone === 'recipient');
}

export function statusAt(events: LogEvent[], upTo: number): string | undefined {
  let status: string | undefined;
  for (const event of events) {
    if (event.i > upTo) break;
    if (event.kind === 'api.response' && event.path.startsWith('/v0/status') && event.status < 400) {
      const body = event.body as { status?: string };
      status = body.status;
    }
  }
  return status;
}

export function eventPlainText(event: LogEvent): string {
  switch (event.kind) {
    case 'api.request': {
      if (event.path === '/v0/tokens') return 'Agent listed the tokens';
      if (event.path === '/v0/quote') return 'Agent asked for a quote';
      if (event.path === '/v0/deposit/submit') return 'Agent reported the deposit';
      if (event.path === '/v0/status') return 'Agent checked the swap status';
      if (event.path.includes('wallet/transfer')) return 'Agent asked the wallet to send funds';
      if (event.path.includes('/report')) return 'Agent prepared its final claim';
      return `Agent called ${event.path}`;
    }
    case 'api.response': {
      if (event.path === '/v0/tokens') return `Token list returned ${event.status}`;
      if (event.path === '/v0/quote') return `Quote returned ${event.status}`;
      if (event.path === '/v0/deposit/submit') return `Deposit acknowledgement returned ${event.status}`;
      if (event.path === '/v0/status') {
        const body = event.body as { status?: string };
        return `Status returned ${body?.status ?? event.status}`;
      }
      if (event.path.includes('wallet/transfer')) return `Wallet transfer returned ${event.status}`;
      if (event.path.includes('/report')) return `Report accepted (${event.status})`;
      return `Response ${event.status}`;
    }
    case 'ledger.transfer': {
      const amount = formatAmount(event.amount, tokenDecimals(event.assetId));
      const symbol = tokenSymbol(event.assetId);
      if (event.funding) return `Paid ${amount} ${symbol} into the deposit address`;
      return `Sent ${amount} ${symbol} to ${event.to.slice(0, 10)}…`;
    }
    case 'ledger.credit': {
      const amount = formatAmount(event.amount, tokenDecimals(event.assetId));
      return `Recipient received ${amount} ${tokenSymbol(event.assetId)}`;
    }
    case 'ledger.lost': {
      const amount = formatAmount(event.amount, tokenDecimals(event.assetId));
      return `Lost ${amount} ${tokenSymbol(event.assetId)} · ${event.reason.replaceAll('-', ' ')}`;
    }
    case 'clock.advance':
      return `Time advanced ${Math.round(event.ms / 1000)}s · ${event.reason}`;
    case 'fault.fired':
      return event.message;
    case 'agent.message':
      return event.text;
    case 'agent.report':
      return `Agent reported ${event.report.outcome} — ${event.report.message}`;
  }
}

export function lossEvents(result: ScenarioResult): number[] {
  return result.events
    .filter(
      (event) =>
        (event.kind === 'ledger.lost' && Number(event.usd) > 0) ||
        (event.kind === 'ledger.transfer' && event.lossUsd && Number(event.lossUsd) > 0),
    )
    .map((event) => event.i);
}

export function firstCrashIndex(result: ScenarioResult): number {
  const evidence = result.violations.flatMap((violation) => violation.evidence);
  if (evidence.length > 0) return Math.max(0, Math.max(...evidence));
  const losses = lossEvents(result);
  if (losses.length > 0) return Math.max(...losses);
  return Math.max(0, result.events.length - 1);
}

export function lossTotal(result: ScenarioResult): string {
  return formatUsd(result.lossUsd);
}

export function initialUserBalance(report: RunReport): { raw: string; assetId: string } {
  const result = allResults(report).find((candidate) => candidate.id === 'timeout-after-transfer');
  if (!result) return { raw: '10000000000', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near' };
  const quoteEvent = result.events.find(
    (event) => event.kind === 'api.response' && event.path === '/v0/quote',
  );
  const body = quoteEvent?.kind === 'api.response' ? quoteEvent.body : undefined;
  const assetId =
    (body as { quoteRequest?: { originAsset?: string } })?.quoteRequest?.originAsset ??
    'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
  return { raw: '10000000000', assetId };
}
