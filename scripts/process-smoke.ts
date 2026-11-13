import { runScenario, scenarioById } from '@airbag/core';
import { processAgent } from '@airbag/server';

const scenario = scenarioById('refund-to-wrong-chain');
if (!scenario) throw new Error('Scenario missing');
const { result, sandbox } = await runScenario({
  scenario,
  agent: processAgent('node examples/http-agent.mjs'),
  seed: 'process-smoke',
});
const report = sandbox.getReport();
console.log(
  `Process agent: verdict ${result.verdict}, loss $${result.lossUsd}, reported ${report?.outcome ?? 'nothing'}`,
);
if (result.verdict !== 'PASS' || report?.outcome !== 'success') {
  console.error('Process adapter smoke failed');
  process.exit(1);
}
console.log('Process adapter smoke passed.');
