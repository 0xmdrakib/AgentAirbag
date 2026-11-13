import { z } from 'zod';

export const tokenInfoSchema = z.object({
  assetId: z.string().min(1),
  decimals: z.number().int().min(0).max(36),
  blockchain: z.string().min(1),
  symbol: z.string().min(1),
  price: z.number().nonnegative(),
  priceUpdatedAt: z.string(),
  contractAddress: z.string().optional(),
  coingeckoId: z.string().optional(),
});

export const quoteRequestSchema = z
  .object({
    dry: z.boolean(),
    depositMode: z.enum(['SIMPLE', 'MEMO']).optional(),
    swapType: z.enum(['EXACT_INPUT', 'EXACT_OUTPUT', 'FLEX_INPUT']),
    slippageTolerance: z.number().int().min(0).max(10_000),
    originAsset: z.string().min(1),
    destinationAsset: z.string().min(1),
    depositType: z.enum(['ORIGIN_CHAIN', 'INTENTS']),
    amount: z.string().regex(/^\d+$/),
    refundTo: z.string().min(1),
    refundType: z.enum(['ORIGIN_CHAIN', 'INTENTS']),
    recipient: z.string().min(1),
    recipientType: z.enum(['DESTINATION_CHAIN', 'INTENTS']),
    deadline: z.string().min(1),
    confidentiality: z.string().optional(),
    insured: z.boolean().optional(),
    connectedWallets: z.array(z.string()).optional(),
    sessionId: z.string().optional(),
    virtualChainRecipient: z.string().optional(),
    virtualChainRefundRecipient: z.string().optional(),
    customRecipientMsg: z.string().optional(),
    referral: z.string().optional(),
    quoteWaitingTimeMs: z.number().optional(),
    appFees: z.array(z.object({ recipient: z.string(), fee: z.number() })).optional(),
  })
  .strict();

export const agentReportSchema = z.object({
  outcome: z.enum(['success', 'refunded', 'failed', 'pending', 'aborted']),
  amountOut: z.string().optional(),
  txHashes: z.array(z.string()).optional(),
  message: z.string(),
});

const eventBase = { i: z.number().int(), t: z.number() };

export const logEventSchema = z.discriminatedUnion('kind', [
  z.object({
    ...eventBase,
    kind: z.literal('api.request'),
    path: z.string(),
    method: z.string(),
    body: z.unknown().optional(),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('api.response'),
    path: z.string(),
    method: z.string(),
    status: z.number(),
    body: z.unknown().optional(),
    faulted: z.boolean().optional(),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('ledger.transfer'),
    from: z.string(),
    to: z.string(),
    assetId: z.string(),
    amount: z.string(),
    usd: z.string(),
    txHash: z.string(),
    memo: z.string().optional(),
    funding: z.boolean(),
    lossUsd: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('ledger.credit'),
    account: z.string(),
    assetId: z.string(),
    amount: z.string(),
    usd: z.string(),
    reason: z.string(),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('ledger.lost'),
    account: z.string(),
    assetId: z.string(),
    amount: z.string(),
    usd: z.string(),
    reason: z.string(),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('clock.advance'),
    ms: z.number(),
    reason: z.string(),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('fault.fired'),
    scenarioId: z.string(),
    faultId: z.string(),
    message: z.string(),
    untrustedText: z.string().optional(),
  }),
  z.object({ ...eventBase, kind: z.literal('agent.message'), text: z.string() }),
  z.object({ ...eventBase, kind: z.literal('agent.report'), report: agentReportSchema }),
]);

export const violationSchema = z.object({
  invariant: z.string(),
  message: z.string(),
  evidence: z.array(z.number().int()),
  severity: z.enum(['fail', 'warn']),
  falseClaim: z.boolean().optional(),
});

export const fixSchema = z.object({
  key: z.string(),
  title: z.string(),
  snippet: z.string(),
});

export const scenarioResultSchema = z.object({
  id: z.string(),
  law: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
  title: z.string(),
  story: z.string(),
  priority: z.enum(['P0', 'P1', 'P2']),
  verdict: z.enum(['PASS', 'WARN', 'FAIL']),
  modeled: z.boolean(),
  trials: z.array(z.enum(['PASS', 'WARN', 'FAIL'])).optional(),
  lossUsd: z.string(),
  violations: z.array(violationSchema),
  events: z.array(logEventSchema),
  fix: fixSchema.optional(),
});

export const lawResultSchema = z.object({
  law: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
  name: z.string(),
  score: z.number().min(0).max(100),
  scenarios: z.array(scenarioResultSchema),
});

export const runReportSchema = z.object({
  schemaVersion: z.literal(1),
  tool: z.object({ name: z.literal('airbag'), version: z.string() }),
  suite: z.object({
    seed: z.string(),
    scenarioCount: z.number().int(),
    epoch: z.string(),
  }),
  agent: z.object({
    id: z.string(),
    kind: z.enum(['scripted', 'llm', 'cassette', 'process']),
    label: z.string(),
    model: z.string().optional(),
    recordedAt: z.string().optional(),
  }),
  overall: z.object({
    score: z.number().min(0).max(100),
    grade: z.enum(['A', 'B', 'C', 'D', 'F']),
    cappedBy: z.array(z.string()).optional(),
    simulatedLossUsd: z.string(),
    falseClaims: z.number().int(),
    passed: z.number().int(),
    warned: z.number().int(),
    failed: z.number().int(),
  }),
  laws: z.array(lawResultSchema),
  hash: z.string(),
  signature: z
    .object({ alg: z.literal('ed25519'), publicKey: z.string(), sig: z.string() })
    .optional(),
});

export type RunReportInput = z.infer<typeof runReportSchema>;
