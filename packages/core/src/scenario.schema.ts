import { z } from 'zod';

const lawSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

const partialTaskSchema = z
  .object({
    id: z.string().optional(),
    text: z.string().optional(),
    originAssetId: z.string().optional(),
    destinationAssetId: z.string().optional(),
    originSymbol: z.string().optional(),
    destinationSymbol: z.string().optional(),
    amount: z.string().optional(),
    amountUsd: z.number().optional(),
    recipient: z.string().optional(),
    refundTo: z.string().optional(),
    refundType: z.enum(['ORIGIN_CHAIN', 'INTENTS']).optional(),
    maxSlippageBps: z.number().optional(),
    swapCount: z.number().int().min(1).max(6).optional(),
    thinkMs: z.number().min(0).optional(),
  })
  .strict();

const partialPolicySchema = z
  .object({
    perSwapUsd: z.number().positive().optional(),
    dailyUsd: z.number().positive().optional(),
    maxSlippageBps: z.number().optional(),
    quoteMinTtlSec: z.number().optional(),
    allowRefundTo: z.array(z.string()).optional(),
    confirmationMs: z.number().optional(),
  })
  .strict();

const balanceSchema = z.object({
  account: z.string(),
  assetId: z.string(),
  amount: z.string(),
});

const statusSchema = z.enum([
  'PENDING_DEPOSIT',
  'KNOWN_DEPOSIT_TX',
  'PROCESSING',
  'SUCCESS',
  'INCOMPLETE_DEPOSIT',
  'REFUNDED',
  'FAILED',
]);

const matcherSchema = z
  .object({
    path: z.string().optional(),
    method: z.string().optional(),
    nth: z.number().int().positive().optional(),
    nthLte: z.number().int().positive().optional(),
    afterEvent: z.string().optional(),
    atVirtualMs: z.number().optional(),
    swapStatus: statusSchema.optional(),
    quoteKind: z.enum(['dry', 'wet']).optional(),
  })
  .strict();

const failAction = z.object({
  fail: z.object({ status: z.number().int(), body: z.unknown().optional(), taint: z.boolean().optional() }),
});
const mutateAction = z.object({ mutate: z.record(z.string(), z.unknown()) });
const delayAction = z.object({ delay: z.number().positive() });
const warpAction = z.object({ warpClock: z.number().positive() });
const injectAction = z.object({
  injectText: z.object({ field: z.string(), text: z.string(), assetId: z.string().optional() }),
});
const outcomeAction = z.object({
  setOutcome: z.object({
    status: statusSchema,
    amountOut: z.string().optional(),
    clearDestinationHashes: z.boolean().optional(),
  }),
});
const failWithQuoteAction = z.object({
  failWithCreatedQuote: z.object({ status: z.number().int(), message: z.string() }),
});

const actionSchema = z.union([
  failAction,
  mutateAction,
  delayAction,
  warpAction,
  injectAction,
  outcomeAction,
  failWithQuoteAction,
]);

const doSchema = z
  .union([actionSchema, z.array(actionSchema).min(1)])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const ruleSchema = z
  .object({
    rule: z.string(),
    gt: z.number().optional(),
    gte: z.number().optional(),
    lt: z.number().optional(),
    lte: z.number().optional(),
    eq: z.union([z.number(), z.string()]).optional(),
  })
  .strict();

export const scenarioFileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    law: lawSchema,
    title: z.string().min(2),
    story: z.string().min(2),
    priority: z.enum(['P0', 'P1', 'P2']),
    weight: z.number().positive().default(1),
    unboundedLoss: z.boolean().default(false),
    modeled: z.boolean().default(false),
    llmSensitive: z.boolean().default(false),
    world: z
      .object({
        task: z.union([z.literal('default'), partialTaskSchema]).optional(),
        policy: partialPolicySchema.optional(),
        solverLatencyMs: z.number().min(0).optional(),
        quoteTtlMs: z.number().min(0).optional(),
        refundPenaltyBps: z.number().min(0).max(10_000).optional(),
        finalOutcome: z.enum(['SUCCESS', 'REFUNDED', 'FAILED']).optional(),
        supportedAssets: z.array(z.string()).optional(),
        extraBalances: z.array(balanceSchema).optional(),
      })
      .strict()
      .optional(),
    faults: z
      .array(
        z
          .object({
            id: z.string().optional(),
            on: z.enum(['onTokens', 'onQuote', 'onTransfer', 'onStatus', 'onRequest', 'onTime']),
            when: matcherSchema.optional(),
            do: doSchema,
          })
          .strict(),
      )
      .default([]),
    judge: z
      .object({
        invariants: z.array(z.string()).min(1),
        failIf: z.array(ruleSchema).optional(),
        warnIf: z.array(ruleSchema).optional(),
      })
      .strict(),
    fix: z.object({ key: z.string() }).strict(),
  })
  .strict();

export type ScenarioFile = z.infer<typeof scenarioFileSchema>;
