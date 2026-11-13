/**
 * Airbag domain types. This file is part of the frozen contract set
 * (types.ts, report.schema.ts, scenario.schema.ts) frozen at the end of Phase 1.
 */

export type Verdict = 'PASS' | 'WARN' | 'FAIL';
export type VerdictWord = 'Survived' | 'Wobbled' | 'Crashed';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Law = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type AgentKind = 'scripted' | 'llm' | 'cassette' | 'process';
export type Outcome = 'success' | 'refunded' | 'failed' | 'pending' | 'aborted';
export type Priority = 'P0' | 'P1' | 'P2';

export const LAW_NAMES: Record<Law, string> = {
  1: 'Pay only what you quoted',
  2: 'Never pay twice',
  3: 'Respect the clock',
  4: 'Verify, never assume',
  5: 'Data is not a command',
  6: 'Stay inside the limits',
  7: 'Always keep an exit',
};

export const LAW_SHORT: Record<Law, string> = {
  1: 'Quote fidelity',
  2: 'No double pay',
  3: 'Deadlines',
  4: 'Verification',
  5: 'Untrusted data',
  6: 'Limits',
  7: 'Exit path',
};

/** One token exactly as the live 1Click `GET /v0/tokens` returns it. */
export interface TokenInfo {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt: string;
  contractAddress?: string;
  coingeckoId?: string;
}

export interface UserTask {
  id: string;
  text: string;
  originAssetId: string;
  destinationAssetId: string;
  originSymbol: string;
  destinationSymbol: string;
  /** Human-readable decimal amount for one swap, for example "100" or "0.003". */
  amount: string;
  amountUsd: number;
  recipient: string;
  refundTo: string;
  refundType: 'ORIGIN_CHAIN' | 'INTENTS';
  maxSlippageBps: number;
  /** How many swaps this task asks the agent to perform. Default 1. */
  swapCount: number;
  /** Virtual milliseconds the agent "thinks" after its first quote. Default 0. */
  thinkMs: number;
}

export interface UserPolicy {
  perSwapUsd: number;
  dailyUsd: number;
  maxSlippageBps: number;
  quoteMinTtlSec: number;
  allowRefundTo: string[];
  confirmationMs: number;
}

export interface TokenBalance {
  account: string;
  assetId: string;
  amount: string;
}

export interface ScenarioWorld {
  task: UserTask;
  policy: UserPolicy;
  balances: TokenBalance[];
  solverLatencyMs: number;
  /** Virtual milliseconds between now and the quote deadline for wet quotes. */
  quoteTtlMs: number;
  refundPenaltyBps: number;
  finalOutcome?: 'SUCCESS' | 'REFUNDED' | 'FAILED';
  /** Token asset ids the sandbox exposes. Defaults to the curated snapshot. */
  supportedAssets?: string[];
}

export type SwapStatus =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'INCOMPLETE_DEPOSIT'
  | 'REFUNDED'
  | 'FAILED';

export interface QuoteRequestBody {
  dry: boolean;
  depositMode?: 'SIMPLE' | 'MEMO';
  swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'FLEX_INPUT';
  slippageTolerance: number;
  originAsset: string;
  destinationAsset: string;
  depositType: 'ORIGIN_CHAIN' | 'INTENTS';
  amount: string;
  refundTo: string;
  refundType: 'ORIGIN_CHAIN' | 'INTENTS';
  recipient: string;
  recipientType: 'DESTINATION_CHAIN' | 'INTENTS';
  deadline: string;
  connectedWallets?: string[];
  sessionId?: string;
  virtualChainRecipient?: string;
  virtualChainRefundRecipient?: string;
  customRecipientMsg?: string;
  referral?: string;
  quoteWaitingTimeMs?: number;
  appFees?: { recipient: string; fee: number }[];
  [key: string]: unknown;
}

export interface QuoteResponseBody {
  quote: {
    depositAddress?: string;
    depositMemo?: string;
    amountIn: string;
    amountInFormatted: string;
    amountInUsd: string;
    minAmountIn: string;
    amountOut: string;
    amountOutFormatted: string;
    amountOutUsd: string;
    minAmountOut: string;
    deadline?: string;
    timeWhenInactive?: string;
    timeEstimate: number;
    refundFee: string;
    withdrawFee: string;
    virtualChainRecipient?: string;
    virtualChainRefundRecipient?: string;
    customRecipientMsg?: string;
  };
  quoteRequest: QuoteRequestBody & {
    confidentiality?: string;
    insured?: boolean;
    appFees?: { recipient: string; fee: number }[];
  };
  signature: string;
  timestamp: string;
  correlationId: string;
}

export interface SwapDetails {
  intentHashes: string[];
  nearTxHashes: string[];
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  slippage: number;
  originChainTxHashes: { hash: string; explorerUrl: string }[];
  destinationChainTxHashes: { hash: string; explorerUrl: string }[];
  refundedAmount: string;
  refundedAmountFormatted: string;
  refundedAmountUsd: string;
}

export interface StatusResponseBody {
  quoteResponse: QuoteResponseBody;
  status: SwapStatus;
  updatedAt: string;
  swapDetails: SwapDetails;
}

export interface AgentReport {
  outcome: Outcome;
  amountOut?: string;
  txHashes?: string[];
  message: string;
}

/** A single line of the event log. Indexes are stable within one scenario. */
export type LogEvent =
  | {
      i: number;
      t: number;
      kind: 'api.request';
      path: string;
      method: string;
      body?: unknown;
    }
  | {
      i: number;
      t: number;
      kind: 'api.response';
      path: string;
      method: string;
      status: number;
      body?: unknown;
      faulted?: boolean;
    }
  | {
      i: number;
      t: number;
      kind: 'ledger.transfer';
      from: string;
      to: string;
      assetId: string;
      amount: string;
      usd: string;
      txHash: string;
      memo?: string;
      funding: boolean;
      lossUsd?: string;
      reason?: string;
    }
  | {
      i: number;
      t: number;
      kind: 'ledger.credit';
      account: string;
      assetId: string;
      amount: string;
      usd: string;
      reason: string;
    }
  | {
      i: number;
      t: number;
      kind: 'ledger.lost';
      account: string;
      assetId: string;
      amount: string;
      usd: string;
      reason: string;
    }
  | { i: number; t: number; kind: 'clock.advance'; ms: number; reason: string }
  | {
      i: number;
      t: number;
      kind: 'fault.fired';
      scenarioId: string;
      faultId: string;
      message: string;
      untrustedText?: string;
    }
  | { i: number; t: number; kind: 'agent.message'; text: string }
  | { i: number; t: number; kind: 'agent.report'; report: AgentReport };

export interface Violation {
  invariant: string;
  message: string;
  evidence: number[];
  severity: 'fail' | 'warn';
  falseClaim?: boolean;
}

export interface Fix {
  key: string;
  title: string;
  snippet: string;
}

export interface ScenarioResult {
  id: string;
  law: Law;
  title: string;
  story: string;
  priority: Priority;
  verdict: Verdict;
  modeled: boolean;
  trials?: Verdict[];
  lossUsd: string;
  violations: Violation[];
  events: LogEvent[];
  fix?: Fix;
}

export interface LawResult {
  law: Law;
  name: string;
  score: number;
  scenarios: ScenarioResult[];
}

export interface AgentInfo {
  id: string;
  kind: AgentKind;
  label: string;
  model?: string;
  recordedAt?: string;
}

export interface RunReport {
  schemaVersion: 1;
  tool: { name: 'airbag'; version: string };
  suite: { seed: string; scenarioCount: number; epoch: string };
  agent: AgentInfo;
  overall: {
    score: number;
    grade: Grade;
    cappedBy?: string[];
    simulatedLossUsd: string;
    falseClaims: number;
    passed: number;
    warned: number;
    failed: number;
  };
  laws: LawResult[];
  hash: string;
  signature?: { alg: 'ed25519'; publicKey: string; sig: string };
}

export interface SandboxHandle {
  handle(request: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;
}

export interface AgentContext {
  api: typeof fetch;
  baseUrl: string;
  sandbox?: SandboxHandle;
  wallet: {
    transfer(
      to: string,
      assetId: string,
      amount: bigint,
      memo?: string,
    ): Promise<{ txHash: string }>;
    balance(account: string, assetId: string): Promise<bigint>;
  };
  task: UserTask;
  policy: UserPolicy;
  /** Virtual epoch milliseconds. Never use the wall clock. */
  now(): number;
  sleep(ms: number): Promise<void>;
  report(r: AgentReport): Promise<void>;
  message(text: string): void;
  signal: AbortSignal;
}

export interface AgentAdapter {
  id: string;
  label: string;
  kind: AgentKind;
  model?: string;
  recordedAt?: string;
  run(ctx: AgentContext): Promise<void>;
}

export interface ScenarioDefinition {
  id: string;
  law: Law;
  title: string;
  story: string;
  priority: Priority;
  weight: number;
  unboundedLoss: boolean;
  modeled: boolean;
  llmSensitive: boolean;
  world?: {
    task?: 'default' | Partial<UserTask>;
    policy?: Partial<UserPolicy>;
    solverLatencyMs?: number;
    quoteTtlMs?: number;
    refundPenaltyBps?: number;
    finalOutcome?: 'SUCCESS' | 'REFUNDED' | 'FAILED';
    supportedAssets?: string[];
    extraBalances?: TokenBalance[];
  };
  faults: ScenarioFault[];
  judge: {
    invariants: string[];
    failIf?: JudgeRule[];
    warnIf?: JudgeRule[];
  };
  fix: { key: string };
}

export interface ScenarioFault {
  id?: string;
  on: FaultPoint;
  when?: FaultMatcher;
  do: FaultAction[];
}

export type FaultPoint = 'onTokens' | 'onQuote' | 'onTransfer' | 'onStatus' | 'onRequest' | 'onTime';

export interface FaultMatcher {
  path?: string;
  method?: string;
  nth?: number;
  nthLte?: number;
  afterEvent?: string;
  atVirtualMs?: number;
  swapStatus?: SwapStatus;
  quoteKind?: 'dry' | 'wet';
}

export type FaultAction =
  | { fail: { status: number; body?: unknown; taint?: boolean } }
  | { mutate: Record<string, unknown> }
  | { delay: number }
  | { warpClock: number }
  | { injectText: { field: string; text: string; assetId?: string } }
  | {
      setOutcome: {
        status: SwapStatus;
        amountOut?: string;
        clearDestinationHashes?: boolean;
      };
    }
  | { failWithCreatedQuote: { status: number; message: string } };

export interface JudgeRule {
  rule: string;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  eq?: number | string;
}
