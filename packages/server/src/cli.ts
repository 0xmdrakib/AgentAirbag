import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SCENARIOS,
  runSuite,
  runReportSchema,
  type RunReport,
} from '@airbag/core';
import { naiveAgent, hardenedAgent } from '@airbag/agents';
import { processAgent } from './processAgent';
import { startServer } from './http';
import { dryQuote, getTokens } from './liveProbe';

const program = new Command();
program.name('airbag').description('Crash-test dummies for AI agents that hold money.');

function writeReport(report: RunReport, path?: string): string {
  mkdirSync('artifacts', { recursive: true });
  const target = path ?? join('artifacts', `report.${report.agent.id}.json`);
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  return target;
}

function printReport(report: RunReport, summaryOnly: boolean): void {
  console.log(`\nairbag · ${report.agent.label}`);
  console.log(
    `score ${report.overall.score} · grade ${report.overall.grade} · ${report.overall.passed} survived · ${report.overall.warned} wobbled · ${report.overall.failed} crashed`,
  );
  console.log(
    `simulated loss $${report.overall.simulatedLossUsd} · false claims ${report.overall.falseClaims} · hash ${report.hash.slice(0, 12)}…`,
  );
  if (!summaryOnly) {
    for (const law of report.laws) {
      for (const result of law.scenarios) {
        const codes = result.violations.map((violation) => violation.invariant).join(',');
        console.log(
          `  ${result.verdict.padEnd(4)} L${result.law} ${result.id.padEnd(26)} loss $${result.lossUsd.padEnd(9)} ${codes}`,
        );
      }
    }
  }
}

program
  .command('run')
  .description('Run the crash suite with one agent')
  .option('--agent <agent>', 'naive | hardened | llm | cassette')
  .option('--cmd <command>', 'run a bring-your-own agent process')
  .option('--cassette <path>', 'replay one cassette file')
  .option('--dir <dir>', 'replay a directory of cassettes', 'cassettes/llm/unguarded')
  .option('--seed <seed>', 'suite seed', 'airbag-demo-2026')
  .option('--out <path>', 'write the report JSON here')
  .option('--summary', 'print only the summary', false)
  .option('--strict', 'exit non-zero when any scenario fails', false)
  .action(async (options: { agent?: string; cmd?: string; seed: string; out?: string; summary: boolean; strict: boolean; cassette?: string; dir: string }) => {
    let agent;
    if (options.cmd) {
      agent = processAgent(options.cmd);
    } else if (options.agent === 'naive' || options.agent === undefined) {
      agent = naiveAgent();
    } else if (options.agent === 'hardened') {
      agent = hardenedAgent();
    } else if (options.agent === 'llm') {
      if (!process.env.NEARAI_API_KEY) {
        console.error(
          'The LLM agent needs NEARAI_API_KEY. Without a key, use --agent cassette with a recording, or --agent naive.',
        );
        process.exit(2);
      }
      const { llmAgent } = await import('@airbag/agents/llm');
      agent = llmAgent();
    } else if (options.agent === 'cassette') {
      const { loadCassette, loadCassetteDir, cassetteBundleAgent } = await import('@airbag/agents/cassette');
      let cassettes;
      try {
        cassettes = options.cassette
          ? [loadCassette(options.cassette)]
          : loadCassetteDir(options.dir);
      } catch (error) {
        console.error(
          `No cassette could be loaded: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.error(
          'No honest LLM cassette is bundled with this build because no NEAR AI Cloud key was available. Record one with `pnpm airbag record`.',
        );
        process.exit(2);
      }
      if (!cassettes || cassettes.length === 0) {
        console.error(
          'The cassette directory is empty. No honest LLM cassette is bundled because no NEAR AI Cloud key was available.',
        );
        process.exit(2);
      }
      agent = cassetteBundleAgent(cassettes);
    } else {
      console.error(`Unknown agent: ${options.agent}`);
      process.exit(2);
    }

    const report = await runSuite({ agent, scenarios: SCENARIOS, seed: options.seed });
    const parsed = runReportSchema.safeParse(report);
    if (!parsed.success) {
      console.error('Report failed schema validation', parsed.error.issues);
      process.exit(1);
    }
    const target = writeReport(report, options.out);
    printReport(report, options.summary);
    console.log(`report: ${target}`);
    if (options.strict && report.overall.failed > 0) process.exit(1);
  });

program
  .command('serve')
  .description('Start the HTTP sandbox for bring-your-own agents')
  .option('--port <port>', 'preferred port', '4321')
  .action(async (options: { port: string }) => {
    const server = await startServer({ port: Number(options.port) });
    console.log(`Airbag sandbox listening on http://localhost:${server.port}`);
    console.log(`Default run: http://localhost:${server.port}/r/demo`);
    console.log('Point ONECLICK_BASE_URL at the run URL. No real funds move. Ctrl+C to stop.');
  });

program
  .command('probe-live')
  .description('Read-only probe of the real 1Click API; refresh snapshots')
  .action(async () => {
    console.log('Probing GET /v0/tokens and POST /v0/quote (dry:true)…');
    const tokens = await getTokens();
    const quote = await dryQuote();
    mkdirSync('fixtures', { recursive: true });
    writeFileSync(join('fixtures', 'tokens.snapshot.json'), `${JSON.stringify(tokens, null, 2)}\n`);
    writeFileSync(join('fixtures', 'quotes.snapshot.json'), `${JSON.stringify(quote, null, 2)}\n`);
    mkdirSync('docs', { recursive: true });
    const factsPath = join('docs', 'VERIFIED_FACTS.md');
    if (!existsSync(factsPath)) writeFileSync(factsPath, '# Verified facts\n');
    appendFileSync(
      factsPath,
      `\n## Live probe ${new Date().toISOString()}\n\n- GET /v0/tokens returned ${tokens.length} tokens. Snapshot: \`fixtures/tokens.snapshot.json\`.\n- POST /v0/quote with dry:true returned a quote with amountOut ${(quote as { quote?: { amountOut?: string } }).quote?.amountOut ?? 'unknown'}. Snapshot: \`fixtures/quotes.snapshot.json\`.\n- The client is read-only by construction; the source scan test enforces it.\n`,
    );
    console.log(`Saved ${tokens.length} tokens and one dry quote. Facts appended to ${factsPath}`);
  });

program
  .command('record')
  .description('Record LLM cassettes (requires NEARAI_API_KEY)')
  .option('--model <model>', 'NEAR AI Cloud model id')
  .option('--trials <n>', 'trials per scenario', '2')
  .option('--guarded', 'record the guarded variant', false)
  .option('--dir <dir>', 'cassette directory')
  .action(async (options: { model?: string; trials: string; guarded: boolean; dir?: string }) => {
    if (!process.env.NEARAI_API_KEY) {
      console.error('NEARAI_API_KEY is not set. Recording needs a NEAR AI Cloud key.');
      process.exit(2);
    }
    const { recordLlmSuite } = await import('@airbag/agents/llm');
    const dir =
      options.dir ??
      join('cassettes', 'llm', options.guarded ? 'guarded' : 'unguarded');
    const trials = Number(options.trials);
    console.log(
      `Recording ${SCENARIOS.length} scenarios × ${trials} trial(s) to ${dir}. This spends NEAR AI Cloud credits.`,
    );
    const reports = await recordLlmSuite({
      model: options.model,
      trials,
      guarded: options.guarded,
      recordDir: dir,
    });
    for (const [index, report] of reports.entries()) {
      console.log(
        `trial ${index + 1}: grade ${report.overall.grade} · ${report.overall.passed} passed · ${report.overall.failed} failed`,
      );
    }
    console.log('Recorded. Commit the cassettes only after reading the results honestly.');
  });

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  await program.parseAsync(process.argv);
}
