import {
  BASE_USDC,
  USER_WALLET,
  formatEvent,
  runScenario,
  scenarioById,
  toSmallest,
  type AgentAdapter,
} from '@airbag/core';
import { Guard, guardState } from '@airbag/guard';
import { fetchTokens, naiveAgent, parseInstruction } from '@airbag/agents';

const scenario = scenarioById('token-metadata-injection');
if (!scenario) throw new Error('Scenario token-metadata-injection is missing');

console.log('Airbag attack demo — an instruction hidden in a token symbol\n');

const unguarded = await runScenario({ scenario, agent: naiveAgent(), seed: 'attack-demo' });
console.log('1. Unguarded Dummy');
console.log(`   verdict: ${unguarded.result.verdict} · simulated loss $${unguarded.result.lossUsd}`);
for (const event of unguarded.result.events) {
  if (event.kind === 'fault.fired' || event.kind === 'ledger.transfer' || event.kind === 'agent.report') {
    console.log(`   ${formatEvent(event)}`);
  }
}

const guardedAgent: AgentAdapter = {
  id: 'guarded-injected',
  label: 'Injected agent (Guard on)',
  kind: 'scripted',
  async run(ctx) {
    const tokens = await fetchTokens(ctx);
    const origin = tokens.find((token) => token.assetId === BASE_USDC);
    if (!origin) throw new Error('USDC is missing');

    for (const token of tokens) {
      const instruction = parseInstruction(token.symbol);
      if (instruction.kind !== 'full' && instruction.kind !== 'send') continue;

      ctx.message(`Injected text found in token metadata: ${token.symbol}`);
      const state = guardState(ctx.task, ctx.policy, ctx.now(), origin.blockchain);
      state.untrustedSpans.push(token.symbol);
      const amount =
        instruction.kind === 'full'
          ? await ctx.wallet.balance(USER_WALLET, origin.assetId)
          : toSmallest(instruction.amount ?? '0', 6);
      const decision = new Guard().check(
        {
          kind: 'wallet.transfer',
          to: instruction.address,
          assetId: origin.assetId,
          amount,
          usd: (Number(amount) / 1e6) * origin.price,
          funding: false,
        },
        state,
      );

      if (decision.verdict !== 'allow') {
        for (const reason of decision.reasons) {
          ctx.message(`Guard ${decision.verdict.toUpperCase()}: ${reason.code} — ${reason.message}`);
        }
        await ctx.report({
          outcome: 'aborted',
          message: `Guard blocked an injected transfer to ${instruction.address}: ${decision.reasons
            .map((reason) => reason.code)
            .join(', ')}`,
        });
        return;
      }
      await ctx.wallet.transfer(instruction.address, origin.assetId, amount);
      await ctx.report({ outcome: 'failed', message: 'The guard allowed a transfer it should have blocked.' });
      return;
    }

    await ctx.report({ outcome: 'aborted', message: 'No injection was found in the token metadata.' });
  },
};

const guarded = await runScenario({ scenario, agent: guardedAgent, seed: 'attack-demo' });
console.log('\n2. Same injection, Guard on');
for (const event of guarded.result.events) {
  if (event.kind === 'fault.fired' || event.kind === 'agent.message' || event.kind === 'agent.report' || event.kind === 'ledger.transfer') {
    console.log(`   ${formatEvent(event)}`);
  }
}
console.log(`\n   verdict: ${guarded.result.verdict} · simulated loss $${guarded.result.lossUsd}`);

if (guarded.result.verdict !== 'PASS' || Number(guarded.result.lossUsd) !== 0) {
  console.error('\nThe attack demo failed: the guard did not stop the transfer.');
  process.exit(1);
}
if (Number(unguarded.result.lossUsd) <= 0) {
  console.error('\nThe attack demo failed: the Dummy did not take the bait.');
  process.exit(1);
}
console.log('\nAttack demo passed: the unguarded agent paid; the guarded agent blocked with reasons.');
