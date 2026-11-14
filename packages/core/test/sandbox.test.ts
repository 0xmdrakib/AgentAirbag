import { describe, expect, it } from 'vitest';
import {
  BASE_CBBTC,
  BASE_USDC,
  DEFAULT_BALANCES,
  DEFAULT_POLICY,
  DEFAULT_TASK,
  NEAR_WNEAR,
  RECIPIENT_NEAR,
  TOKENS,
  USER_WALLET,
  createSandbox,
  type QuoteRequestBody,
  type QuoteResponseBody,
  type ScenarioDefinition,
  type Sandbox,
  type SandboxOptions,
} from '../src/index';

const SCENARIO: ScenarioDefinition = {
  id: 'sandbox-test',
  law: 1,
  title: 'Sandbox accounting test',
  story: 'A focused scenario used to exercise sandbox deposit accounting.',
  priority: 'P2',
  weight: 1,
  unboundedLoss: false,
  modeled: false,
  llmSensitive: false,
  faults: [],
  judge: { invariants: [] },
  fix: { key: 'test' },
};

const SENDER = '0x2222222222222222222222222222222222222222';

function makeSandbox(overrides: Partial<SandboxOptions> = {}): Sandbox {
  return createSandbox({
    scenario: SCENARIO,
    suiteSeed: 'sandbox-test-seed',
    task: { ...DEFAULT_TASK },
    policy: { ...DEFAULT_POLICY },
    tokens: TOKENS,
    balances: DEFAULT_BALANCES,
    solverLatencyMs: 20_000,
    quoteTtlMs: 2 * 60 * 60 * 1000,
    refundPenaltyBps: 100,
    ...overrides,
  });
}

function quoteBody(sandbox: Sandbox, overrides: Partial<QuoteRequestBody> = {}): QuoteRequestBody {
  return {
    dry: false,
    depositMode: 'SIMPLE',
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100,
    originAsset: BASE_USDC,
    destinationAsset: NEAR_WNEAR,
    depositType: 'ORIGIN_CHAIN',
    amount: '100000000',
    refundTo: USER_WALLET,
    refundType: 'ORIGIN_CHAIN',
    recipient: RECIPIENT_NEAR,
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(sandbox.absoluteNow() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

async function requestQuote(sandbox: Sandbox, overrides: Partial<QuoteRequestBody> = {}) {
  return sandbox.handle({
    method: 'POST',
    path: '/v0/quote',
    body: quoteBody(sandbox, overrides),
  });
}

function depositAddressOf(response: { status: number; body: unknown }): string {
  expect(response.status).toBe(201);
  const body = response.body as QuoteResponseBody;
  const address = body.quote.depositAddress;
  expect(address).toBeTruthy();
  return address!;
}

async function transfer(
  sandbox: Sandbox,
  from: string,
  to: string,
  assetId: string,
  amount: bigint,
) {
  return sandbox.handle({
    method: 'POST',
    path: '/sandbox/v0/wallet/transfer',
    body: { from, to, assetId, amount: amount.toString() },
  });
}

describe('sandbox deposits', () => {
  it('refunds a short deposit instead of stranding it in escrow', async () => {
    const sandbox = makeSandbox();
    const quote = await requestQuote(sandbox);
    const depositAddress = depositAddressOf(quote);

    const funded = await transfer(sandbox, USER_WALLET, depositAddress, BASE_USDC, 97_000_000n);
    expect(funded.status).toBe(200);
    expect(sandbox.ledger.balance(depositAddress, BASE_USDC)).toBe(97_000_000n);

    sandbox.finalize();

    expect(sandbox.ledger.balance(depositAddress, BASE_USDC)).toBe(0n);
    expect(sandbox.ledger.balance(USER_WALLET, BASE_USDC)).toBe(10_000_000_000n);
    const refund = sandbox.ledger.moves.find(
      (move) => move.kind === 'transfer' && move.reason === 'incomplete deposit refund',
    );
    expect(refund).toBeDefined();
    expect(refund!.to).toBe(USER_WALLET);
    expect(refund!.amount).toBe(97_000_000n);
    expect(sandbox.totalLossUsd()).toBe(0);
  });

  it('rejects a deposit in the wrong asset without crediting the swap', async () => {
    const sandbox = makeSandbox({
      balances: [
        ...DEFAULT_BALANCES,
        { account: USER_WALLET, assetId: BASE_CBBTC, amount: '1000000000' },
      ],
    });
    const quote = await requestQuote(sandbox);
    const depositAddress = depositAddressOf(quote);

    const rejected = await transfer(sandbox, USER_WALLET, depositAddress, BASE_CBBTC, 100_000_000n);

    expect(rejected.status).toBe(400);
    expect(String((rejected.body as { error?: unknown }).error)).toMatch(/does not match/);
    expect(sandbox.ledger.balance(depositAddress, BASE_CBBTC)).toBe(0n);
    expect(sandbox.ledger.balance(depositAddress, BASE_USDC)).toBe(0n);
    expect(sandbox.ledger.balance(USER_WALLET, BASE_CBBTC)).toBe(1_000_000_000n);
  });

  it('sends a late deposit refund to the quote refund address, not the sender', async () => {
    const sandbox = makeSandbox({
      balances: [
        ...DEFAULT_BALANCES,
        { account: SENDER, assetId: BASE_USDC, amount: '5000000000' },
      ],
    });
    const quote = await requestQuote(sandbox, {
      deadline: new Date(sandbox.absoluteNow() + 10_000).toISOString(),
    });
    const depositAddress = depositAddressOf(quote);

    const funded = await transfer(sandbox, SENDER, depositAddress, BASE_USDC, 100_000_000n);
    expect(funded.status).toBe(200);

    expect(sandbox.ledger.balance(depositAddress, BASE_USDC)).toBe(0n);
    expect(sandbox.ledger.balance(SENDER, BASE_USDC)).toBe(4_900_000_000n);
    expect(sandbox.ledger.balance(USER_WALLET, BASE_USDC)).toBe(10_099_000_000n);

    const refund = sandbox.ledger.moves.find(
      (move) => move.kind === 'transfer' && move.reason === 'late deposit refund',
    );
    expect(refund).toBeDefined();
    expect(refund!.to).toBe(USER_WALLET);
    expect(refund!.amount).toBe(99_000_000n);
  });

});
