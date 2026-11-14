import { fixByKey } from '../fixes';
import { buildRunReport } from '../scoring';
import { BUDGETS, DEFAULT_BALANCES, DEFAULT_POLICY, DEFAULT_TASK, USER_WALLET, VIRTUAL_EPOCH_ISO } from '../constants';
import { createFetch, createSandbox, type Sandbox } from '../sandbox';
import { judge } from '../judge';
import { tokensFor } from '../tokens';
import type {
  AgentAdapter,
  AgentContext,
  AgentReport,
  LogEvent,
  RunReport,
  ScenarioDefinition,
  ScenarioResult,
  UserPolicy,
  UserTask,
  Verdict,
} from '../types';

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export interface RunScenarioOptions {
  scenario: ScenarioDefinition;
  agent: AgentAdapter;
  seed: string;
  wallTimeoutMs?: number;
}

export interface ScenarioRun {
  result: ScenarioResult;
  sandbox: Sandbox;
  trials?: Verdict[];
}

export function buildWorld(scenario: ScenarioDefinition): {
  task: UserTask;
  policy: UserPolicy;
  tokens: ReturnType<typeof tokensFor>;
  balances: { account: string; assetId: string; amount: string }[];
  solverLatencyMs: number;
  quoteTtlMs: number;
  refundPenaltyBps: number;
  finalOutcome?: 'SUCCESS' | 'REFUNDED' | 'FAILED';
} {
  const overrides = scenario.world?.task;
  const task: UserTask = {
    ...DEFAULT_TASK,
    ...(overrides && overrides !== 'default' ? overrides : {}),
    id: scenario.id,
  };
  const policy: UserPolicy = {
    ...DEFAULT_POLICY,
    ...(scenario.world?.policy ?? {}),
  };
  if (!policy.allowRefundTo.includes(task.refundTo)) {
    policy.allowRefundTo = [...policy.allowRefundTo, task.refundTo];
  }
  const tokens = tokensFor(scenario.world?.supportedAssets);
  const balances = [...DEFAULT_BALANCES, ...(scenario.world?.extraBalances ?? [])];
  return {
    task,
    policy,
    tokens,
    balances,
    solverLatencyMs: scenario.world?.solverLatencyMs ?? 20_000,
    quoteTtlMs: scenario.world?.quoteTtlMs ?? 2 * 60 * 60 * 1000,
    refundPenaltyBps: scenario.world?.refundPenaltyBps ?? 100,
    finalOutcome: scenario.world?.finalOutcome,
  };
}

export async function runScenario(options: RunScenarioOptions): Promise<ScenarioRun> {
  const { scenario, agent, seed } = options;
  const world = buildWorld(scenario);
  const sandbox = createSandbox({
    scenario,
    suiteSeed: seed,
    task: world.task,
    policy: world.policy,
    tokens: world.tokens,
    balances: world.balances,
    solverLatencyMs: world.solverLatencyMs,
    quoteTtlMs: world.quoteTtlMs,
    refundPenaltyBps: world.refundPenaltyBps,
    finalOutcome: world.finalOutcome,
  });

  const baseFetch = createFetch(sandbox, `http://sandbox.local/r/${scenario.id}`);
  const api = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (sandbox.apiCalls >= BUDGETS.apiCalls) {
      throw new BudgetExceededError(`API call budget of ${BUDGETS.apiCalls} exceeded`);
    }
    return baseFetch(input, init);
  }) as typeof fetch;

  const controller = new AbortController();
  const context: AgentContext = {
    api,
    baseUrl: `http://sandbox.local/r/${scenario.id}`,
    sandbox,
    wallet: {
      async transfer(to, assetId, amount, memo) {
        const response = await api(`${context.baseUrl}/sandbox/v0/wallet/transfer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            from: USER_WALLET,
            to,
            assetId,
            amount: amount.toString(),
            ...(memo ? { memo } : {}),
          }),
        });
        const data = (await response.json()) as { txHash?: string; error?: string };
        if (!response.ok || !data.txHash) {
          throw new Error(data.error ?? `Transfer failed with ${response.status}`);
        }
        return { txHash: data.txHash };
      },
      async balance(account, assetId) {
        const response = await api(
          `${context.baseUrl}/sandbox/v0/wallet/balance?account=${encodeURIComponent(account)}&assetId=${encodeURIComponent(assetId)}`,
        );
        const data = (await response.json()) as { amount?: string };
        return BigInt(data.amount ?? '0');
      },
    },
    task: world.task,
    policy: world.policy,
    now: () => sandbox.absoluteNow(),
    sleep: async (ms) => {
      if (sandbox.now() + ms > BUDGETS.virtualMs) {
        throw new BudgetExceededError('Virtual time budget of 30 minutes exceeded');
      }
      sandbox.sleep(ms);
    },
    report: async (report: AgentReport) => {
      const response = await api(`${context.baseUrl}/sandbox/v0/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!response.ok) throw new Error(`Report rejected with ${response.status}`);
    },
    message: (text: string) => sandbox.agentMessage(text),
    signal: controller.signal,
  };

  const timeout = options.wallTimeoutMs ?? 120_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new BudgetExceededError(`Agent exceeded the ${timeout}ms wall-clock limit`));
    }, timeout);
  });

  try {
    await Promise.race([agent.run(context), timeoutPromise]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sandbox.agentMessage(`Agent stopped: ${message}`);
  } finally {
    if (timer) clearTimeout(timer);
  }

  sandbox.finalize();
  const lossUsd = sandbox.totalLossUsd();
  // Freeze the evidence before judging. An in-process agent can still reach the
  // sandbox and push events after finalize; the result must not change after this point.
  const events = structuredClone(sandbox.events);
  const judged = judge({
    scenario,
    task: world.task,
    policy: world.policy,
    tokens: world.tokens,
    events,
    report: sandbox.getReport(),
    lossUsd,
  });

  const result: ScenarioResult = {
    id: scenario.id,
    law: scenario.law,
    title: scenario.title,
    story: scenario.story,
    priority: scenario.priority,
    verdict: judged.verdict,
    modeled: scenario.modeled,
    lossUsd: judged.lossUsd.toFixed(2),
    violations: judged.violations,
    events,
    fix: fixByKey(scenario.fix.key),
  };
  return { result, sandbox };
}

export interface RunSuiteOptions {
  agent: AgentAdapter;
  scenarios: ScenarioDefinition[];
  seed: string;
  onResult?: (result: ScenarioResult) => void;
  trials?: number;
  wallTimeoutMs?: number;
}

export async function runSuite(options: RunSuiteOptions): Promise<RunReport> {
  const { agent, scenarios, seed, onResult } = options;
  const trials = options.trials ?? 1;
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    if (trials <= 1) {
      const { result } = await runScenario({
        scenario,
        agent,
        seed,
        wallTimeoutMs: options.wallTimeoutMs,
      });
      results.push(result);
      onResult?.(result);
      continue;
    }

    const trialVerdicts: Verdict[] = [];
    const trialResults: ScenarioResult[] = [];
    let totalLossCents = 0;
    for (let trial = 0; trial < trials; trial += 1) {
      const { result } = await runScenario({
        scenario,
        agent,
        seed: `${seed}:trial${trial + 1}`,
        wallTimeoutMs: options.wallTimeoutMs,
      });
      trialVerdicts.push(result.verdict);
      trialResults.push(result);
      totalLossCents += Math.round(Number(result.lossUsd) * 100);
    }
    const aggregate: Verdict = trialVerdicts.includes('FAIL')
      ? 'FAIL'
      : trialVerdicts.includes('WARN')
        ? 'WARN'
        : 'PASS';
    // A failing scenario must show the evidence that caused the failure, not a
    // clean earlier trial. Pick the worst trial: highest-severity violation,
    // then the largest loss.
    const evidence = aggregate === 'PASS' ? trialResults[0]! : worstTrial(trialResults);
    const result: ScenarioResult = {
      ...evidence,
      verdict: aggregate,
      trials: trialVerdicts,
      lossUsd: (totalLossCents / 100).toFixed(2),
    };
    results.push(result);
    onResult?.(result);
  }

  return buildRunReport({
    agent: {
      ...agent,
      // The cassette or model timestamp is wall-clock metadata. Derive it from
      // the fixed virtual epoch so the same seed and cassette always hash the same.
      ...(agent.recordedAt ? { recordedAt: VIRTUAL_EPOCH_ISO } : {}),
    },
    scenarios,
    results,
    seed,
  });
}

function worstTrial(results: ScenarioResult[]): ScenarioResult {
  return results.reduce((worst, candidate) => {
    const worstSeverity = trialSeverity(worst);
    const candidateSeverity = trialSeverity(candidate);
    if (candidateSeverity !== worstSeverity) {
      return candidateSeverity > worstSeverity ? candidate : worst;
    }
    return Number(candidate.lossUsd) > Number(worst.lossUsd) ? candidate : worst;
  });
}

function trialSeverity(result: ScenarioResult): number {
  let severity = 0;
  for (const violation of result.violations) {
    if (violation.severity === 'fail') return 2;
    severity = 1;
  }
  return severity;
}

/** A compact event log for terminal output. */
export function formatEvent(event: LogEvent): string {
  switch (event.kind) {
    case 'api.request':
      return `→ ${event.method} ${event.path}`;
    case 'api.response':
      return `← ${event.status} ${event.path}${event.faulted ? ' (faulted)' : ''}`;
    case 'ledger.transfer':
      return `transfer ${event.amount} ${event.assetId.split(':').pop()} ${event.from.slice(0, 8)} → ${event.to.slice(0, 12)}${event.lossUsd ? ` (loss $${event.lossUsd})` : ''}`;
    case 'ledger.credit':
      return `credit ${event.amount} → ${event.account.slice(0, 16)}`;
    case 'ledger.lost':
      return `LOST $${event.usd} (${event.reason})`;
    case 'clock.advance':
      return `clock +${Math.round(event.ms / 1000)}s (${event.reason})`;
    case 'fault.fired':
      return `AIRBAG FAULT: ${event.message}`;
    case 'agent.message':
      return `agent: ${event.text}`;
    case 'agent.report':
      return `agent report: ${event.report.outcome}: ${event.report.message}`;
  }
  return 'event';
}
