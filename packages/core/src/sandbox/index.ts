import { quoteRequestSchema } from '../report.schema';
import { agentReportSchema } from '../report.schema';
import { VirtualClock, isoAt } from '../clock';
import { Ledger, type LedgerMove } from '../ledger';
import { prngFor } from '../prng';
import { fromSmallest, quoteMath, toSmallest, usd2, usdString } from '../quote-math';
import { tokenById } from '../tokens';
import { REQUEST_COST_MS } from '../constants';
import type {
  AgentReport,
  LogEvent,
  QuoteRequestBody,
  QuoteResponseBody,
  ScenarioDefinition,
  StatusResponseBody,
  SwapStatus,
  TokenBalance,
  TokenInfo,
  UserPolicy,
  UserTask,
} from '../types';
import { FaultEngine } from './faults';

export interface SandboxRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface SandboxResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface SandboxOptions {
  scenario: ScenarioDefinition;
  suiteSeed: string;
  task: UserTask;
  policy: UserPolicy;
  tokens: TokenInfo[];
  balances: TokenBalance[];
  solverLatencyMs: number;
  quoteTtlMs: number;
  refundPenaltyBps: number;
  finalOutcome?: 'SUCCESS' | 'REFUNDED' | 'FAILED';
}

interface SwapRecord {
  id: string;
  depositAddress: string;
  depositMemo?: string;
  depositMode: 'SIMPLE' | 'MEMO';
  request: QuoteRequestBody;
  response: QuoteResponseBody;
  createdAt: number;
  deadline: number;
  amountIn: bigint;
  minAmountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  amountInUsd: number;
  status: SwapStatus;
  funded: boolean;
  settled: boolean;
  incomplete: boolean;
  stranded: boolean;
  knownAt?: number;
  fundingTxHash?: string;
  depositTime?: number;
  processingAt: number;
  successAt: number;
  finalOutcome: 'SUCCESS' | 'REFUNDED' | 'FAILED';
  originHash?: string;
  destHash?: string;
  refundedAmount?: bigint;
  forcedStatus?: SwapStatus;
  forcedAmountOut?: string;
  clearDestinationHashes?: boolean;
}

class QuoteValidationError extends Error {}

const transferBodySchema = (value: unknown) => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.from !== 'string' ||
    typeof row.to !== 'string' ||
    typeof row.assetId !== 'string' ||
    typeof row.amount !== 'string' ||
    !/^\d+$/.test(row.amount)
  ) {
    return null;
  }
  return {
    from: row.from,
    to: row.to,
    assetId: row.assetId,
    amount: BigInt(row.amount),
    memo: typeof row.memo === 'string' ? row.memo : undefined,
  };
};

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

export class Sandbox {
  readonly scenario: ScenarioDefinition;
  readonly suiteSeed: string;
  readonly task: UserTask;
  readonly policy: UserPolicy;
  readonly epochMs: number;
  readonly clock: VirtualClock;
  readonly ledger: Ledger;
  readonly events: LogEvent[] = [];
  readonly tokens: TokenInfo[];
  readonly solverLatencyMs: number;
  readonly quoteTtlMs: number;
  readonly refundPenaltyBps: number;
  readonly finalOutcome: 'SUCCESS' | 'REFUNDED' | 'FAILED';

  private readonly faults: FaultEngine;
  private readonly swapsByAddress = new Map<string, SwapRecord>();
  readonly swaps: SwapRecord[] = [];
  private readonly tokenMap: Map<string, TokenInfo>;
  private readonly seenEvents = new Set<string>();
  private wetQuoteCount = 0;
  private txCount = 0;
  private quoteCount = 0;
  private fundedIntents = 0;
  private report?: AgentReport;
  apiCalls = 0;

  constructor(options: SandboxOptions) {
    this.scenario = options.scenario;
    this.suiteSeed = options.suiteSeed;
    this.task = options.task;
    this.policy = options.policy;
    this.tokens = options.tokens;
    this.solverLatencyMs = options.solverLatencyMs;
    this.quoteTtlMs = options.quoteTtlMs;
    this.refundPenaltyBps = options.refundPenaltyBps;
    this.finalOutcome = options.finalOutcome ?? 'SUCCESS';
    this.epochMs = Date.UTC(2026, 10, 1, 0, 0, 0);
    this.clock = new VirtualClock(this.epochMs);
    this.ledger = new Ledger(this.tokens, options.balances);
    this.tokenMap = new Map(this.tokens.map((token) => [token.assetId, token]));
    this.faults = new FaultEngine(this.scenario.id, this.scenario.faults);
  }

  now(): number {
    return this.clock.now();
  }

  absoluteNow(): number {
    return this.clock.absolute();
  }

  isoNow(): string {
    return this.clock.iso();
  }

  getReport(): AgentReport | undefined {
    return this.report;
  }

  agentMessage(text: string): void {
    this.emit({ kind: 'agent.message', text });
  }

  getLastStatus(): StatusResponseBody | undefined {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index]!;
      if (event.kind === 'api.response' && event.path.startsWith('/v0/status')) {
        return event.body as StatusResponseBody;
      }
    }
    return undefined;
  }

  async handle(request: SandboxRequest): Promise<SandboxResponse> {
    const method = request.method.toUpperCase();
    const [pathPart, search = ''] = request.path.split('?') as [string, string?];
    const path = normalizePath(pathPart ?? '/');
    const query = request.query ?? queryFrom(search);
    const body = parseBody(request.body);

    this.apiCalls += 1;
    this.clock.advance(REQUEST_COST_MS);
    const requestedAdvance =
      request.headers?.['x-airbag-advance-ms'] ?? request.headers?.['x-crumple-advance-ms'];
    if (requestedAdvance) {
      const ms = Number(requestedAdvance);
      if (Number.isFinite(ms) && ms > 0 && ms <= 30 * 60 * 1000) {
        this.clock.advance(ms);
        this.emit({ kind: 'clock.advance', ms, reason: 'client header' });
      }
    }
    this.emit({ kind: 'api.request', path, method, body });

    const requestFault = this.faults.run({
      point: 'onRequest',
      now: this.now(),
      epochMs: this.epochMs,
      path,
      method,
      body,
      events: this.events,
    });
    this.applyFaultOutcome(requestFault);
    if (requestFault.failed) {
      return this.respond(path, method, requestFault.failed.status, requestFault.failed.body, true);
    }
    const effectiveBody = body;

    try {
      switch (true) {
        case method === 'GET' && path === '/v0/tokens':
          return this.handleTokens(path, method);
        case method === 'POST' && path === '/v0/quote':
          return this.handleQuote(path, method, effectiveBody);
        case method === 'POST' && path === '/v0/deposit/submit':
          return this.handleSubmit(path, method, effectiveBody);
        case method === 'GET' && path === '/v0/status':
          return this.handleStatus(path, method, query);
        case method === 'POST' && path === '/sandbox/v0/wallet/transfer':
          return this.handleTransfer(path, method, effectiveBody);
        case method === 'GET' && path === '/sandbox/v0/wallet/balance':
          return this.handleBalance(path, method, query);
        case method === 'POST' && path === '/sandbox/v0/report':
          return this.handleReport(path, method, effectiveBody);
        case method === 'GET' && path === '/sandbox/v0/time':
          return this.respond(path, method, 200, {
            now: this.absoluteNow(),
            iso: this.isoNow(),
            virtualMs: this.now(),
          });
        case method === 'GET' && path === '/sandbox/v0/events':
          return this.respond(path, method, 200, { events: this.events });
        default:
          return this.respond(path, method, 404, '');
      }
    } catch (error) {
      if (error instanceof QuoteValidationError) {
        return this.respond(path, method, 400, '');
      }
      const message = error instanceof Error ? error.message : 'Sandbox error';
      return this.respond(path, method, 500, { message });
    }
  }

  /** Advance time from an agent sleep and record it. */
  sleep(ms: number): void {
    this.clock.advance(ms);
    this.emit({ kind: 'clock.advance', ms, reason: 'agent sleep' });
  }

  /** Resolve any swaps whose virtual timers have elapsed, then settle the run. */
  finalize(): void {
    for (const swap of this.swaps) this.settleIfDue(swap);
  }

  totalLossUsd(): number {
    return this.ledger.totalLossUsd();
  }

  private handleTokens(path: string, method: string): SandboxResponse {
    const payload = this.tokens.map((token) => ({ ...token }));
    const fault = this.faults.run({
      point: 'onTokens',
      now: this.now(),
      epochMs: this.epochMs,
      path,
      method,
      events: this.events,
      response: payload,
    });
    this.applyFaultOutcome(fault);
    if (fault.failed) {
      return this.respond(path, method, fault.failed.status, fault.failed.body, true);
    }
    return this.respond(path, method, 200, payload);
  }

  private handleQuote(path: string, method: string, body: unknown): SandboxResponse {
    const parsed = quoteRequestSchema.safeParse(body);
    if (!parsed.success) throw new QuoteValidationError('Invalid quote request');
    const request = parsed.data as QuoteRequestBody;
    const origin = this.tokenMap.get(request.originAsset);
    const destination = this.tokenMap.get(request.destinationAsset);
    if (!origin || !destination) throw new QuoteValidationError('Unsupported asset');
    if (origin.assetId === destination.assetId) throw new QuoteValidationError('Same asset');
    const deadlineMs = Date.parse(request.deadline);
    if (!Number.isFinite(deadlineMs)) throw new QuoteValidationError('Invalid deadline');

    const amountIn = BigInt(request.amount);
    if (amountIn <= 0n) throw new QuoteValidationError('Amount must be positive');
    const math = quoteMath({
      amountIn,
      origin,
      destination,
      spreadBps: 30,
      slippageBps: request.slippageTolerance,
    });

    this.quoteCount += 1;
    const quoteKind: 'dry' | 'wet' = request.dry ? 'dry' : 'wet';
    const quoteId = `q_${this.scenario.id}_${this.quoteCount}`;
    const depositAddress = request.dry
      ? undefined
      : this.addressForChain(origin.blockchain, quoteId);
    const nowIso = this.isoNow();
    const quote: QuoteResponseBody['quote'] = {
      amountIn: request.amount,
      amountInFormatted: fromSmallest(amountIn, origin.decimals),
      amountInUsd: usdString(math.amountInUsd),
      minAmountIn: request.amount,
      amountOut: math.amountOut.toString(),
      amountOutFormatted: fromSmallest(math.amountOut, destination.decimals),
      amountOutUsd: usdString(math.amountOutUsd),
      minAmountOut: math.minAmountOut.toString(),
      timeEstimate: 35,
      refundFee: '2400',
      withdrawFee: '0',
    };
    if (request.dry) {
      delete quote.deadline;
    } else {
      quote.depositAddress = depositAddress;
      quote.deadline = request.deadline;
      quote.timeWhenInactive = isoAt(this.epochMs, this.now() + 30 * 60 * 1000);
      if (request.depositMode === 'MEMO') {
        quote.depositMemo = `AIRBAG-${this.scenario.id.toUpperCase().slice(0, 18)}`;
      }
    }
    if (request.customRecipientMsg) quote.customRecipientMsg = request.customRecipientMsg;

    const response: QuoteResponseBody = {
      quote,
      quoteRequest: {
        ...request,
        depositMode: request.depositMode ?? 'SIMPLE',
        confidentiality: 'public',
        quoteWaitingTimeMs: request.quoteWaitingTimeMs ?? 0,
        insured: false,
        appFees:
          request.appFees && request.appFees.length > 0
            ? request.appFees
            : [{ recipient: 'airbag-sandbox', fee: 20 }],
      },
      signature: `ed25519:${this.prngFor('signature', String(this.quoteCount)).hex(64)}`,
      timestamp: nowIso,
      correlationId: this.uuidFor(`quote-${this.quoteCount}`),
    };

    let swap: SwapRecord | undefined;
    if (!request.dry && depositAddress) {
      this.wetQuoteCount += 1;
      swap = {
        id: `s_${this.scenario.id}_${this.wetQuoteCount}`,
        depositAddress,
        depositMemo: quote.depositMemo,
        depositMode: request.depositMode ?? 'SIMPLE',
        request,
        response,
        createdAt: this.now(),
        deadline: deadlineMs - this.epochMs,
        amountIn,
        minAmountIn: amountIn,
        amountOut: math.amountOut,
        minAmountOut: math.minAmountOut,
        amountInUsd: math.amountInUsd,
        status: 'PENDING_DEPOSIT',
        funded: false,
        settled: false,
        incomplete: false,
        stranded: false,
        processingAt: Number.POSITIVE_INFINITY,
        successAt: Number.POSITIVE_INFINITY,
        finalOutcome: this.finalOutcome,
      };
      this.swapsByAddress.set(depositAddress, swap);
      this.swaps.push(swap);
    }

    const fault = this.faults.run({
      point: 'onQuote',
      now: this.now(),
      epochMs: this.epochMs,
      path,
      method,
      body: request,
      response,
      swap: swap
        ? { status: swap.status, deadline: swap.deadline }
        : undefined,
      events: this.events,
      quoteKind,
    });
    this.applyFaultOutcome(fault);

    if (swap) {
      // Only the fields that describe the offer are synced back into the model.
      // Echo corruption (scenario 1.1) deliberately stays a response-level lie.
      const quoteDeadline = response.quote.deadline;
      if (quoteDeadline) {
        const parsedDeadline = Date.parse(quoteDeadline);
        if (Number.isFinite(parsedDeadline)) swap.deadline = parsedDeadline - this.epochMs;
      }
      if (response.quote.depositMemo) {
        swap.depositMemo = response.quote.depositMemo;
        swap.depositMode = 'MEMO';
      }
      if (fault.outcome?.status) swap.forcedStatus = fault.outcome.status;
      if (fault.outcome?.amountOut) swap.forcedAmountOut = fault.outcome.amountOut;
      if (fault.outcome?.clearDestinationHashes) swap.clearDestinationHashes = true;
      swap.response = response;
    }

    if (fault.failed) {
      return this.respond(path, method, fault.failed.status, fault.failed.body, true);
    }
    return this.respond(path, method, 201, response, fault.fired.length > 0);
  }

  private handleSubmit(path: string, method: string, body: unknown): SandboxResponse {
    const row = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const txHash = typeof row.txHash === 'string' ? row.txHash : '';
    const depositAddress = typeof row.depositAddress === 'string' ? row.depositAddress : '';
    const swap = this.swapsByAddress.get(depositAddress);
    if (!swap) return this.respond(path, method, 404, '');
    if (!swap.funded) return this.respond(path, method, 400, '');
    swap.knownAt = this.now();
    if (swap.status === 'PENDING_DEPOSIT') swap.status = 'KNOWN_DEPOSIT_TX';
    if (!swap.fundingTxHash) swap.fundingTxHash = txHash;
    this.settleIfDue(swap);
    return this.respond(path, method, 200, this.statusBody(swap));
  }

  private handleStatus(
    path: string,
    method: string,
    query: Record<string, string>,
  ): SandboxResponse {
    const depositAddress = query.depositAddress;
    if (!depositAddress) return this.respond(path, method, 400, '');
    const swap = this.swapsByAddress.get(depositAddress);
    if (!swap) return this.respond(path, method, 404, '');
    this.settleIfDue(swap);
    const response = this.statusBody(swap);
    const fault = this.faults.run({
      point: 'onStatus',
      now: this.now(),
      epochMs: this.epochMs,
      path,
      method,
      response,
      swap: { status: swap.status, deadline: swap.deadline },
      events: this.events,
    });
    this.applyFaultOutcome(fault);
    if (fault.failed) {
      return this.respond(path, method, fault.failed.status, fault.failed.body, true);
    }
    return this.respond(path, method, 200, response, fault.fired.length > 0);
  }

  private handleTransfer(path: string, method: string, body: unknown): SandboxResponse {
    const request = transferBodySchema(body);
    if (!request) return this.respond(path, method, 400, { error: 'Invalid transfer request' });

    const fault = this.faults.run({
      point: 'onTransfer',
      now: this.now(),
      epochMs: this.epochMs,
      path,
      method,
      body: request,
      events: this.events,
    });
    this.applyFaultOutcome(fault);
    if (fault.failed) {
      return this.respond(path, method, fault.failed.status, fault.failed.body, true);
    }

    const { from, to, assetId, amount, memo } = (transferBodySchema(request) ?? request) as {
      from: string;
      to: string;
      assetId: string;
      amount: bigint;
      memo?: string;
    };
    if (!this.tokenMap.has(assetId)) {
      return this.respond(path, method, 400, { error: `Unknown asset ${assetId}` });
    }
    if (this.ledger.balance(from, assetId) < amount) {
      return this.respond(path, method, 400, { error: 'Insufficient funds' });
    }
    const txHash = this.txHashFor(`transfer-${this.txCount}`);
    const swap = this.swapsByAddress.get(to);

    if (!swap) {
      const loss = to !== this.task.recipient && to !== this.task.refundTo && to !== from;
      const move = this.ledger.transfer({
        from,
        to,
        assetId,
        amount,
        t: this.now(),
        txHash,
        memo,
        funding: false,
        lossReason: loss ? 'transfer-to-unknown' : undefined,
        reason: loss ? 'agent sent funds to a non-allowlisted address' : 'wallet transfer',
      });
      this.emitMove(move);
      return this.respond(path, method, 200, { txHash });
    }

    if (swap.settled || swap.funded || swap.stranded || swap.incomplete) {
      this.fund(swap, from, assetId, amount, txHash, memo);
      this.loseFromEscrow(swap, from, assetId, amount, 'double-pay');
      return this.respond(path, method, 200, { txHash });
    }

    if (swap.depositMode === 'MEMO' && memo !== swap.depositMemo) {
      this.fund(swap, from, assetId, amount, txHash, memo);
      swap.funded = true;
      swap.stranded = true;
      this.loseFromEscrow(swap, from, assetId, amount, 'missing-memo');
      return this.respond(path, method, 200, { txHash });
    }

    if (amount < swap.minAmountIn) {
      this.fund(swap, from, assetId, amount, txHash, memo);
      swap.incomplete = true;
      swap.status = 'INCOMPLETE_DEPOSIT';
      swap.depositTime = this.now();
      swap.fundingTxHash = txHash;
      return this.respond(path, method, 200, { txHash });
    }

    if (
      this.now() > swap.deadline ||
      swap.deadline - this.now() < this.policy.confirmationMs
    ) {
      this.fund(swap, from, assetId, amount, txHash, memo);
      swap.funded = true;
      swap.depositTime = this.now();
      swap.fundingTxHash = txHash;
      this.refundLate(swap, from, assetId, amount);
      return this.respond(path, method, 200, { txHash });
    }

    if (this.fundedIntents >= this.task.swapCount) {
      this.fund(swap, from, assetId, amount, txHash, memo);
      this.loseFromEscrow(swap, from, assetId, amount, 'double-pay');
      return this.respond(path, method, 200, { txHash });
    }

    this.fund(swap, from, assetId, amount, txHash, memo);
    this.fundedIntents += 1;
    swap.funded = true;
    swap.depositTime = this.now();
    swap.fundingTxHash = txHash;
    swap.processingAt = this.now() + Math.min(5_000, Math.floor(this.solverLatencyMs / 4));
    swap.successAt = this.now() + this.solverLatencyMs;

    if (amount > swap.amountIn) {
      const excess = amount - swap.amountIn;
      const move = this.ledger.lose(
        swap.depositAddress,
        assetId,
        excess,
        this.now(),
        'amount-drift',
      );
      this.emitMove(move);
    }
    return this.respond(path, method, 200, { txHash });
  }

  private handleBalance(
    path: string,
    method: string,
    query: Record<string, string>,
  ): SandboxResponse {
    const account = query.account ?? this.task.refundTo;
    if (query.assetId) {
      const assetId = query.assetId;
      return this.respond(path, method, 200, {
        account,
        assetId,
        amount: this.ledger.balance(account, assetId).toString(),
      });
    }
    const balances = this.tokens.map((token) => ({
      assetId: token.assetId,
      amount: this.ledger.balance(account, token.assetId).toString(),
    }));
    return this.respond(path, method, 200, { account, balances });
  }

  private handleReport(path: string, method: string, body: unknown): SandboxResponse {
    const parsed = agentReportSchema.safeParse(body);
    if (!parsed.success) return this.respond(path, method, 400, { error: 'Invalid report' });
    this.report = parsed.data;
    this.emit({ kind: 'agent.report', report: parsed.data });
    return this.respond(path, method, 200, { accepted: true });
  }

  private fund(
    swap: SwapRecord,
    from: string,
    assetId: string,
    amount: bigint,
    txHash: string,
    memo?: string,
  ): void {
    const move = this.ledger.transfer({
      from,
      to: swap.depositAddress,
      assetId,
      amount,
      t: this.now(),
      txHash,
      memo,
      funding: true,
      reason: 'swap deposit',
    });
    this.emitMove(move);
  }

  private loseFromEscrow(
    swap: SwapRecord,
    from: string,
    assetId: string,
    amount: bigint,
    reason: string,
  ): void {
    const held = this.ledger.balance(swap.depositAddress, assetId);
    const amountToLose = held < amount ? held : amount;
    if (amountToLose <= 0n) return;
    const move = this.ledger.lose(swap.depositAddress, assetId, amountToLose, this.now(), reason);
    this.emitMove(move);
    void from;
  }

  private refundLate(swap: SwapRecord, from: string, assetId: string, amount: bigint): void {
    const penalty = (amount * BigInt(this.refundPenaltyBps)) / 10_000n;
    const refund = amount - penalty;
    if (refund > 0n) {
      const move = this.ledger.transfer({
        from: swap.depositAddress,
        to: from,
        assetId,
        amount: refund,
        t: this.now(),
        txHash: this.txHashFor('refund'),
        reason: 'late deposit refund',
      });
      this.emitMove(move);
    }
    if (penalty > 0n) {
      const move = this.ledger.lose(
        swap.depositAddress,
        assetId,
        penalty,
        this.now(),
        'refund-penalty',
      );
      this.emitMove(move);
    }
    swap.refundedAmount = refund;
    swap.status = 'REFUNDED';
    swap.settled = true;
  }

  private settleIfDue(swap: SwapRecord): void {
    if (!swap.funded || swap.settled || swap.incomplete || swap.stranded) return;
    if (this.now() < swap.successAt) return;
    if (swap.status === 'SUCCESS' || swap.status === 'REFUNDED' || swap.status === 'FAILED') {
      return;
    }
    const originToken = this.tokenById(swap.request.originAsset);
    const held = this.ledger.balance(swap.depositAddress, originToken.assetId);
    const outcome = swap.forcedStatus ?? swap.finalOutcome;
    if (outcome === 'REFUNDED') {
      const penalty = (held * BigInt(this.refundPenaltyBps)) / 10_000n;
      const refund = held - penalty;
      if (refund > 0n) {
        const move = this.ledger.transfer({
          from: swap.depositAddress,
          to: swap.request.refundTo,
          assetId: originToken.assetId,
          amount: refund,
          t: this.now(),
          txHash: this.txHashFor('refund'),
          reason: 'swap refunded',
        });
        this.emitMove(move);
      }
      if (penalty > 0n) {
        this.emitMove(
          this.ledger.lose(
            swap.depositAddress,
            originToken.assetId,
            penalty,
            this.now(),
            'refund-penalty',
          ),
        );
      }
      swap.refundedAmount = refund;
      swap.status = 'REFUNDED';
      swap.settled = true;
      return;
    }

    if (outcome === 'FAILED') {
      if (held > 0n) {
        this.emitMove(
          this.ledger.lose(swap.depositAddress, originToken.assetId, held, this.now(), 'failed-swap'),
        );
      }
      swap.status = 'FAILED';
      swap.settled = true;
      return;
    }

    if (held < swap.amountIn) {
      swap.incomplete = true;
      swap.status = 'INCOMPLETE_DEPOSIT';
      return;
    }
    const settleMove = this.ledger.transfer({
      from: swap.depositAddress,
      to: 'solver',
      assetId: originToken.assetId,
      amount: swap.amountIn,
      t: this.now(),
      txHash: this.txHashFor('settle'),
      reason: 'solver filled the order',
    });
    this.emitMove(settleMove);
    const destinationToken = this.tokenById(swap.request.destinationAsset);
    const credit = this.ledger.credit(
      swap.request.recipient,
      destinationToken.assetId,
      swap.amountOut,
      this.now(),
      'swap delivered to recipient',
    );
    this.emitMove(credit);
    swap.originHash = this.txHashFor('origin');
    swap.destHash = this.txHashFor('destination');
    swap.status = 'SUCCESS';
    swap.settled = true;
  }

  private statusBody(swap: SwapRecord): StatusResponseBody {
    const originToken = this.tokenById(swap.request.originAsset);
    const destinationToken = this.tokenById(swap.request.destinationAsset);
    const status: SwapStatus = swap.forcedStatus ?? this.effectiveStatus(swap);
    const amountOut = swap.forcedAmountOut ?? swap.amountOut.toString();
    const destinationHashes =
      swap.clearDestinationHashes || !swap.destHash
        ? []
        : [
            {
              hash: swap.destHash,
              explorerUrl: explorerUrl(destinationToken.blockchain, swap.destHash),
            },
          ];
    const details: StatusResponseBody['swapDetails'] = {
      intentHashes: swap.originHash ? [swap.originHash] : [],
      nearTxHashes:
        (originToken.blockchain === 'near' && swap.originHash) ||
        (destinationToken.blockchain === 'near' && swap.destHash)
          ? [swap.originHash, swap.destHash].filter((value): value is string => Boolean(value))
          : [],
      amountIn: swap.amountIn.toString(),
      amountInFormatted: fromSmallest(swap.amountIn, originToken.decimals),
      amountInUsd: usdString(swap.amountInUsd),
      amountOut,
      amountOutFormatted: fromSmallest(BigInt(amountOut), destinationToken.decimals),
      amountOutUsd: usd2(
        (Number(amountOut) / 10 ** destinationToken.decimals) * destinationToken.price,
      ),
      slippage: swap.request.slippageTolerance,
      originChainTxHashes: swap.fundingTxHash
        ? [
            {
              hash: swap.fundingTxHash,
              explorerUrl: explorerUrl(originToken.blockchain, swap.fundingTxHash),
            },
          ]
        : [],
      destinationChainTxHashes: destinationHashes,
      refundedAmount: (swap.refundedAmount ?? 0n).toString(),
      refundedAmountFormatted: fromSmallest(swap.refundedAmount ?? 0n, originToken.decimals),
      refundedAmountUsd: usd2(
        (Number(swap.refundedAmount ?? 0n) / 10 ** originToken.decimals) * originToken.price,
      ),
    };
    return {
      quoteResponse: swap.response,
      status,
      updatedAt: this.isoNow(),
      swapDetails: details,
    };
  }

  private effectiveStatus(swap: SwapRecord): SwapStatus {
    if (swap.forcedStatus) return swap.forcedStatus;
    if (swap.status === 'SUCCESS' || swap.status === 'REFUNDED' || swap.status === 'FAILED') {
      return swap.status;
    }
    if (swap.incomplete) return 'INCOMPLETE_DEPOSIT';
    if (!swap.funded) {
      return swap.knownAt ? 'KNOWN_DEPOSIT_TX' : 'PENDING_DEPOSIT';
    }
    if (swap.stranded) return 'PENDING_DEPOSIT';
    if (this.now() < swap.processingAt) {
      return swap.knownAt ? 'KNOWN_DEPOSIT_TX' : 'PENDING_DEPOSIT';
    }
    if (this.now() < swap.successAt) return 'PROCESSING';
    return swap.status;
  }

  private tokenById(assetId: string): TokenInfo {
    const token = this.tokenMap.get(assetId);
    if (!token) return tokenById(assetId);
    return token;
  }

  private addressForChain(chain: string, quoteId: string): string {
    const prng = prngFor(this.scenario.id, this.suiteSeed, 'deposit', quoteId);
    switch (chain) {
      case 'near':
        return prng.hex(64);
      case 'sol':
      case 'sui':
      case 'aptos': {
        let out = '';
        for (let index = 0; index < 44; index += 1) out += BASE58[prng.int(BASE58.length)];
        return out;
      }
      case 'btc': {
        let out = 'bc1q';
        for (let index = 0; index < 38; index += 1) out += BECH32[prng.int(BECH32.length)];
        return out;
      }
      default:
        return `0x${prng.hex(40)}`;
    }
  }

  private prngFor(...parts: string[]) {
    return prngFor(this.scenario.id, this.suiteSeed, ...parts);
  }

  private txHashFor(seed: string): string {
    this.txCount += 1;
    const prng = this.prngFor('tx', seed, String(this.txCount));
    return `0x${prng.hex(64)}`;
  }

  private uuidFor(seed: string): string {
    const hex = this.prngFor('uuid', seed).hex(32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private applyFaultOutcome(fault: ReturnType<FaultEngine['run']>): void {
    if (fault.warpMs > 0) {
      this.clock.advance(fault.warpMs);
      this.emit({
        kind: 'clock.advance',
        ms: fault.warpMs,
        reason: 'fault warp',
      });
    }
    for (const fired of fault.fired) {
      this.emit({
        kind: 'fault.fired',
        scenarioId: this.scenario.id,
        faultId: fired.faultId,
        message: fired.message,
        untrustedText: fired.untrustedText,
      });
    }
  }

  private respond(
    path: string,
    method: string,
    status: number,
    body: unknown,
    faulted = false,
  ): SandboxResponse {
    this.emit({ kind: 'api.response', path, method, status, body, faulted });
    return {
      status,
      body,
      headers: {
        date: new Date(this.absoluteNow()).toUTCString(),
        'content-type': 'application/json',
      },
    };
  }

  private emit(
    event:
      | Omit<Extract<LogEvent, { kind: 'api.request' }>, 'i' | 't'>
      | Omit<Extract<LogEvent, { kind: 'api.response' }>, 'i' | 't'>
      | Omit<Extract<LogEvent, { kind: 'clock.advance' }>, 'i' | 't'>
      | Omit<Extract<LogEvent, { kind: 'fault.fired' }>, 'i' | 't'>
      | Omit<Extract<LogEvent, { kind: 'agent.message' }>, 'i' | 't'>
      | Omit<Extract<LogEvent, { kind: 'agent.report' }>, 'i' | 't'>,
  ): void {
    this.events.push({ ...event, i: this.events.length, t: this.now() } as LogEvent);
  }

  private emitMove(move: LedgerMove): void {
    const key = `${move.id}`;
    if (this.seenEvents.has(key)) return;
    this.seenEvents.add(key);
    if (move.kind === 'credit') {
      this.events.push({
        i: this.events.length,
        t: move.t,
        kind: 'ledger.credit',
        account: move.to,
        assetId: move.assetId,
        amount: move.amount.toString(),
        usd: usd2(move.usd),
        reason: move.reason ?? 'credit',
      });
      return;
    }
    if (move.kind === 'loss') {
      this.events.push({
        i: this.events.length,
        t: move.t,
        kind: 'ledger.lost',
        account: move.from ?? 'unknown',
        assetId: move.assetId,
        amount: move.amount.toString(),
        usd: usd2(move.usd),
        reason: move.reason ?? 'loss',
      });
      return;
    }
    this.events.push({
      i: this.events.length,
      t: move.t,
      kind: 'ledger.transfer',
      from: move.from ?? 'unknown',
      to: move.to,
      assetId: move.assetId,
      amount: move.amount.toString(),
      usd: usd2(move.usd),
      txHash: move.txHash ?? '',
      memo: move.memo,
      funding: move.funding,
      lossUsd: move.lossUsd > 0 ? usd2(move.lossUsd) : undefined,
      reason: move.reason,
    });
  }
}

export function createSandbox(options: SandboxOptions): Sandbox {
  return new Sandbox(options);
}

export function createFetch(sandbox: Sandbox, runBaseUrl = 'http://sandbox.local/r/run'): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input);
    const url = new URL(raw, runBaseUrl);
    const path = url.pathname.replace(/^\/r\/[^/]+/, '') + url.search;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    let body: unknown;
    if (init?.body !== undefined && init.body !== null) {
      body = typeof init.body === 'string' ? safeJson(init.body) : init.body;
    }
    const response = await sandbox.handle({
      method,
      path,
      headers: headersToObject(init?.headers),
      body,
    });
    const text =
      typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? null);
    return new Response(text, {
      status: response.status,
      headers: {
        'content-type': 'application/json',
        date: response.headers?.date ?? new Date(sandbox.absoluteNow()).toUTCString(),
      },
    });
  };
  return fn as typeof fetch;
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

function queryFrom(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  return safeJson(body);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...(headers as Record<string, string>) };
}

export function explorerUrl(chain: string, hash: string): string {
  switch (chain) {
    case 'near':
      return `https://nearblocks.io/txns/${hash}`;
    case 'eth':
      return `https://etherscan.io/tx/${hash}`;
    case 'sol':
      return `https://solscan.io/tx/${hash}`;
    case 'btc':
      return `https://mempool.space/tx/${hash}`;
    default:
      return `https://basescan.org/tx/${hash}`;
  }
}

export { toSmallest };
