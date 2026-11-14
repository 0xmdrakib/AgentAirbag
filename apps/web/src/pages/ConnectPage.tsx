import { Chip, CopyButton, LinkButton, SectionHead } from '../components/Primitives';
import { ArrowRightIcon, ShieldIcon, TerminalIcon } from '../components/Icons';

const SERVE = 'pnpm airbag serve';
const ENV = `export ONECLICK_BASE_URL=http://localhost:4321/r/demo
export AIRBAG_BASE_URL=http://localhost:4321/r/demo`;
const RUN = 'pnpm airbag run --cmd "node my-agent.js"';
const SAMPLE = `// my-agent.js — the three rules
const base = process.env.AIRBAG_BASE_URL;

const tokens = await (await fetch(base + '/v0/tokens')).json();
const clock = await (await fetch(base + '/sandbox/v0/time')).json();
const quote = await (await fetch(base + '/v0/quote', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    dry: false, swapType: 'EXACT_INPUT', slippageTolerance: 100,
    originAsset: tokens.find((t) => t.symbol === 'USDC' && t.blockchain === 'base').assetId,
    destinationAsset: tokens.find((t) => t.symbol === 'wNEAR').assetId,
    depositType: 'ORIGIN_CHAIN', amount: '100000000',
    refundTo: '0x1111111111111111111111111111111111111111',
    refundType: 'ORIGIN_CHAIN', recipient: 'alice.near',
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(clock.now + 3600_000).toISOString(),
  }),
})).json();

// Move the fake deposit through the sandbox wallet, then report.
await fetch(base + '/sandbox/v0/wallet/transfer', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    from: '0x1111111111111111111111111111111111111111',
    to: quote.quote.depositAddress,
    assetId: quote.quoteRequest.originAsset,
    amount: quote.quote.amountIn,
    ...(quote.quote.depositMemo ? { memo: quote.quote.depositMemo } : {}),
  }),
});

await fetch(base + '/sandbox/v0/report', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ outcome: 'pending', message: 'Mock agent finished; status not verified.' }),
});`;

export function ConnectPage() {
  return (
    <div className="page container page-connect">
      <div className="page-head">
        <div>
          <h1 className="h1">Test your own agent</h1>
          <p className="page-sub">
            Change one base URL. If your agent follows the 1Click docs and sends its deposit through
            the sandbox wallet, it can run the whole suite. Live runs use the local CLI; this page
            only shows the steps.
          </p>
        </div>
      </div>

      <div className="connect-grid">
        <div className="connect-steps">
          <article className="connect-step">
            <span className="step-num mono">01</span>
            <div>
              <h2 className="h3">Start the sandbox</h2>
              <p>Runs on 4321, picks the next free port if that one is taken. No network needed.</p>
              <CodeLine code={SERVE} />
            </div>
          </article>
          <article className="connect-step">
            <span className="step-num mono">02</span>
            <div>
              <h2 className="h3">Point your agent at one run</h2>
              <p>
                Every run has its own URL prefix, ledger and virtual clock. Create more runs with{' '}
                <span className="mono">POST /sandbox/v0/runs</span>.
              </p>
              <CodeBlock code={ENV} />
            </div>
          </article>
          <article className="connect-step">
            <span className="step-num mono">03</span>
            <div>
              <h2 className="h3">Run every crash</h2>
              <p>
                The harness starts your process once per scenario, exports a fresh base URL, and
                waits for your final report.
              </p>
              <CodeLine code={RUN} />
            </div>
          </article>
        </div>

        <aside className="limits-card">
          <div className="limits-head">
            <ShieldIcon size={18} />
            <h2 className="h3">What your agent must do</h2>
          </div>
          <ol className="limits-list">
            <li>
              <span className="limits-num mono">01</span>
              <p>
                Take the deposit path through{' '}
                <code className="mono">POST /sandbox/v0/wallet/transfer</code>. That is what moves
                the fake ledger.
              </p>
            </li>
            <li>
              <span className="limits-num mono">02</span>
              <p>
                Trust the server’s virtual time. Read the <code className="mono">timestamp</code>{' '}
                and <code className="mono">Date</code> header, never your local clock.
              </p>
            </li>
            <li>
              <span className="limits-num mono">03</span>
              <p>
                Post a final claim to <code className="mono">POST /sandbox/v0/report</code>. The
                judge ignores it and reads the ledger; the report is only a claim to compare.
              </p>
            </li>
          </ol>
          <p className="limits-note">
            An agent that signs with real keys over a real chain RPC cannot be sandboxed by this
            tool. It needs to call the 1Click HTTP contract, or use an in-process adapter.
          </p>
        </aside>
      </div>

      <section className="section">
        <SectionHead
          title="A minimal agent to start from"
          body="The sample below is deliberately naive: it reports “pending” instead of guessing. Swap in your own agent and let the crashes find the gaps."
        />
        <div className="sample-code">
          <div className="sample-code-head">
            <span className="mono">my-agent.js</span>
            <CopyButton value={SAMPLE} label="Copy sample" />
          </div>
          <pre className="mono">
            <code>{SAMPLE}</code>
          </pre>
        </div>
      </section>

      <section className="section">
        <SectionHead
          title="What a run looks like"
          body="Example terminal session. The Dummy and Seatbelt lines are the bundled reference agents; your agent gets its own row."
        />
        <div className="terminal-card">
          <div className="terminal-head">
            <TerminalIcon size={16} /> <span className="mono">terminal</span>
          </div>
          <pre className="mono">
            <code>{`$ pnpm install\n$ pnpm airbag serve\nAirbag sandbox listening on http://localhost:4321\nDefault run: http://localhost:4321/r/demo\n$ pnpm airbag run --cmd "node my-agent.js"\n\nDummy (no guards)      0 survived · 21 crashed · $10,907.04 simulated loss\nSeatbelt (Guard)      21 survived · 0 crashed · $1.00 simulated loss`}</code>
          </pre>
        </div>
      </section>

      <section className="section connect-cta">
        <div>
          <h2 className="h2">No install needed to look around</h2>
          <p className="section-sub">
            Live bring-your-own runs need the local CLI because a static page cannot accept an
            incoming process. The CLI is one command and works offline after install.
          </p>
        </div>
        <div className="cta-actions">
          <LinkButton href="#/run" variant="primary">
            Run a scripted suite <ArrowRightIcon size={16} />
          </LinkButton>
          <LinkButton href="#/scenarios" variant="secondary">
            Browse the crashes
          </LinkButton>
        </div>
      </section>
    </div>
  );
}

function CodeLine({ code }: { code: string }) {
  return (
    <div className="code-line">
      <span className="mono code-prompt">$</span>
      <code className="mono">{code}</code>
      <CopyButton value={code} />
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="code-block">
      <pre className="mono">
        <code>{code}</code>
      </pre>
      <CopyButton value={code} />
    </div>
  );
}
