import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildWorld,
  createSandbox,
  scenarioById,
  type QuoteRequestBody,
  type QuoteResponseBody,
} from '../src/index';

describe('drop-in 1Click quote compatibility', () => {
  it('accepts the exact quoteRequest echoed by the live API', () => {
    const snapshot = JSON.parse(
      readFileSync('fixtures/quotes.snapshot.json', 'utf8'),
    ) as QuoteResponseBody;
    const request = snapshot.quoteRequest as unknown as QuoteRequestBody;
    const scenario = scenarioById('refund-to-wrong-chain')!;
    const world = buildWorld(scenario);
    const sandbox = createSandbox({
      scenario,
      suiteSeed: 'compat-seed',
      task: world.task,
      policy: world.policy,
      tokens: world.tokens,
      balances: world.balances,
      solverLatencyMs: world.solverLatencyMs,
      quoteTtlMs: world.quoteTtlMs,
      refundPenaltyBps: world.refundPenaltyBps,
      finalOutcome: world.finalOutcome,
    });
    return sandbox
      .handle({ method: 'POST', path: '/v0/quote', body: request })
      .then((response) => {
        expect(response.status, JSON.stringify(response.body)).toBe(201);
        const body = response.body as QuoteResponseBody;
        expect(body.quoteRequest.confidentiality).toBe('public');
        expect(body.quoteRequest.insured).toBe(false);
      });
  });
});
