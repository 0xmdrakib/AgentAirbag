import type {
  FaultAction,
  FaultMatcher,
  FaultPoint,
  LogEvent,
  ScenarioFault,
  SwapStatus,
} from '../types';

export interface FaultSwapView {
  status: SwapStatus;
  deadline: number;
}

export interface FaultRunContext {
  point: FaultPoint;
  now: number;
  epochMs: number;
  path: string;
  method: string;
  body?: unknown;
  response?: unknown;
  swap?: FaultSwapView;
  events: LogEvent[];
  quoteKind?: 'dry' | 'wet';
}

export interface FaultOutcome {
  failed?: { status: number; body?: unknown };
  warpMs: number;
  outcome?: { status: SwapStatus; amountOut?: string; clearDestinationHashes?: boolean };
  fired: { faultId: string; message: string; untrustedText?: string }[];
}

interface CompiledFault {
  index: number;
  fault: ScenarioFault;
  count: number;
}

export class FaultEngine {
  private readonly compiled: CompiledFault[];
  private readonly scenarioId: string;

  constructor(scenarioId: string, faults: ScenarioFault[]) {
    this.scenarioId = scenarioId;
    this.compiled = faults.map((fault, index) => ({ index, fault, count: 0 }));
  }

  run(ctx: FaultRunContext): FaultOutcome {
    const outcome: FaultOutcome = { warpMs: 0, fired: [] };
    for (const entry of this.compiled) {
      const fault = entry.fault;
      if (fault.on !== ctx.point) continue;
      if (!this.matches(fault.when, ctx)) continue;
      entry.count += 1;
      if (fault.when?.nth !== undefined && entry.count !== fault.when.nth) continue;
      if (fault.when?.nthLte !== undefined && entry.count > fault.when.nthLte) continue;
      const faultId = fault.id ?? `f${entry.index + 1}`;
      for (const action of fault.do) {
        const result = applyAction(action, ctx, outcome, faultId);
        if (result.stop) break;
      }
      if (outcome.failed) break;
    }
    return outcome;
  }

  private matches(when: FaultMatcher | undefined, ctx: FaultRunContext): boolean {
    if (!when) return true;
    if (when.path && !pathMatches(when.path, ctx.path)) return false;
    if (when.method && when.method.toUpperCase() !== ctx.method.toUpperCase()) return false;
    if (when.atVirtualMs !== undefined && ctx.now < when.atVirtualMs) return false;
    if (when.afterEvent && !ctx.events.some((event) => event.kind === when.afterEvent)) {
      return false;
    }
    if (when.swapStatus && ctx.swap?.status !== when.swapStatus) return false;
    if (when.quoteKind && ctx.quoteKind !== when.quoteKind) return false;
    return true;
  }
}

function pathMatches(pattern: string, path: string): boolean {
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}

function applyAction(
  action: FaultAction,
  ctx: FaultRunContext,
  outcome: FaultOutcome,
  faultId: string,
): { stop: boolean } {
  if ('fail' in action) {
    outcome.failed = { status: action.fail.status, body: action.fail.body };
    const untrusted =
      action.fail.taint && action.fail.body !== undefined
        ? typeof action.fail.body === 'string'
          ? action.fail.body
          : JSON.stringify(action.fail.body)
        : undefined;
    outcome.fired.push({
      faultId,
      message: `Returned ${action.fail.status} for ${ctx.path}.`,
      untrustedText: untrusted,
    });
    return { stop: true };
  }

  if ('failWithCreatedQuote' in action) {
    const quoteResponse = ctx.response;
    outcome.failed = {
      status: action.failWithCreatedQuote.status,
      body: { message: action.failWithCreatedQuote.message, quoteResponse },
    };
    outcome.fired.push({
      faultId,
      message: `Returned ${action.failWithCreatedQuote.status} after creating a quote.`,
    });
    return { stop: true };
  }

  if ('mutate' in action) {
    const target = (ctx.response ?? ctx.body) as unknown;
    if (target && typeof target === 'object') {
      for (const [path, value] of Object.entries(action.mutate)) {
        setPath(target as Record<string, unknown>, path, resolveValue(value, ctx));
      }
    }
    outcome.fired.push({
      faultId,
      message: `Rewrote ${Object.keys(action.mutate).join(', ')} in the ${ctx.point} payload.`,
    });
    return { stop: false };
  }

  if ('injectText' in action) {
    const injection = action.injectText;
    applyInjection(ctx.response, injection.field, injection.text, injection.assetId);
    outcome.fired.push({
      faultId,
      message: `Injected an instruction into ${injection.assetId ?? injection.field}.`,
      untrustedText: injection.text,
    });
    return { stop: false };
  }

  if ('delay' in action || 'warpClock' in action) {
    const ms = 'delay' in action ? action.delay : action.warpClock;
    outcome.warpMs += ms;
    outcome.fired.push({
      faultId,
      message: `Moved the virtual clock by ${Math.round(ms / 1000)}s.`,
    });
    return { stop: false };
  }

  if ('setOutcome' in action) {
    outcome.outcome = action.setOutcome;
    outcome.fired.push({
      faultId,
      message: `Forced the swap outcome to ${action.setOutcome.status}.`,
    });
    return { stop: false };
  }

  return { stop: false };
}

function resolveValue(value: unknown, ctx: FaultRunContext): unknown {
  if (typeof value !== 'string') return value;
  const match = /^\$now\+(\d+)$/.exec(value);
  if (match) return new Date(ctx.epochMs + ctx.now + Number(match[1])).toISOString();
  return value;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]!;
    const next = current[key];
    if (!next || typeof next !== 'object') current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function applyInjection(
  response: unknown,
  field: string,
  text: string,
  assetId?: string,
): void {
  if (!response) return;
  if (Array.isArray(response)) {
    for (const item of response) {
      if (
        item &&
        typeof item === 'object' &&
        (assetId === undefined || (item as { assetId?: string }).assetId === assetId)
      ) {
        (item as Record<string, unknown>)[field] = text;
        return;
      }
    }
    return;
  }
  if (typeof response === 'object') {
    const record = response as Record<string, unknown>;
    const quote = record.quote as Record<string, unknown> | undefined;
    if (quote) {
      quote[field] = text;
      return;
    }
    record[field] = text;
  }
}
