import { CopyButton, PageIntro } from '../components/Primitives';
import { ArrowRightIcon, TerminalIcon } from '../components/Icons';
import '../styles/pages/connect.css';

const SERVE = 'pnpm airbag serve';
const ENV = [
  'base=http://localhost:4321/r/demo',
  'export ONECLICK_BASE_URL=$base',
  'export AIRBAG_BASE_URL=$base',
].join('\n');
const RUN = 'pnpm airbag run --cmd "node examples/http-agent.mjs"';
const SAMPLE = `// my-agent.js: the three rules
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

const TERMINAL = `$ pnpm install
$ pnpm airbag serve
Sandbox listening on http://localhost:4321  (next free port if taken)

$ pnpm airbag run --agent naive --summary
Dummy (no guards)      0 survived · 21 crashed · $10,907.04 simulated loss

$ pnpm airbag run --agent hardened --summary
Seatbelt (Guard)      21 survived · 0 crashed · $1.00 modeled refund fee

$ pnpm airbag run --cmd "node examples/http-agent.mjs" --summary
Bring your own: http-agent    … your agent's own row`;

export function ConnectPage() {
  return (
    <div className="page page-connect cnx-page">
      <PageIntro
        className="container cnx-hero"
        label="Bring your own agent"
        title="Test your own agent"
        body="Point your agent’s 1Click calls at one base URL and send deposits through the sandbox wallet. Your own agent runs use the local CLI; this page only shows the steps."
      />

      <section className="container section section-rule" aria-labelledby="cnx-steps-title">
        <div className="split">
          <div className="split-label">
            <p className="eyebrow">Three steps</p>
            <h2 className="h2" id="cnx-steps-title">
              Run it on your machine
            </h2>
          </div>
          <ol className="cnx-steps">
            <li className="cnx-step">
              <span className="cnx-num mono" aria-hidden="true">
                01
              </span>
              <div className="cnx-step-body">
                <h3 className="h3">Start the sandbox</h3>
                <p>
                  Runs on 4321, picks the next free port if that one is taken. No network needed.
                </p>
                <CodeLine code={SERVE} />
              </div>
            </li>
            <li className="cnx-step">
              <span className="cnx-num mono" aria-hidden="true">
                02
              </span>
              <div className="cnx-step-body">
                <h3 className="h3">Point your agent at one run</h3>
                <p>
                  Every run has its own URL prefix, ledger and virtual clock. Create more runs with{' '}
                  <code className="mono">POST /sandbox/v0/runs</code>. Use the port the server
                  printed if 4321 was taken.
                </p>
                <CodeBlock code={ENV} label="env" />
              </div>
            </li>
            <li className="cnx-step">
              <span className="cnx-num mono" aria-hidden="true">
                03
              </span>
              <div className="cnx-step-body">
                <h3 className="h3">Run every crash</h3>
                <p>
                  The harness starts your process once per scenario, exports a fresh base URL, and
                  judges the ledger when the process exits.
                </p>
                <CodeLine code={RUN} />
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="container section section-rule" aria-labelledby="cnx-contract-title">
        <div className="split">
          <div className="split-label">
            <p className="eyebrow">The contract</p>
            <h2 className="h2" id="cnx-contract-title">
              What your agent must do
            </h2>
          </div>
          <div className="cnx-contract">
            <ol className="cnx-rules rows">
              <li className="cnx-rule">
                <span className="cnx-num mono" aria-hidden="true">
                  01
                </span>
                <p>
                  Take the deposit path through{' '}
                  <code className="mono">POST /sandbox/v0/wallet/transfer</code>. That is what moves
                  the fake ledger.
                </p>
              </li>
              <li className="cnx-rule">
                <span className="cnx-num mono" aria-hidden="true">
                  02
                </span>
                <p>
                  Trust the server’s virtual time. Read the <code className="mono">timestamp</code>{' '}
                  and <code className="mono">Date</code> header, never your local clock.
                </p>
              </li>
              <li className="cnx-rule">
                <span className="cnx-num mono" aria-hidden="true">
                  03
                </span>
                <p>
                  Post a final claim to <code className="mono">POST /sandbox/v0/report</code>. Money
                  movement is judged from the ledger; your claim is only used to catch a false one.
                </p>
              </li>
            </ol>

            <h3 className="eyebrow cnx-table-label">Calls in the sample below</h3>
            <ul className="cnx-calls rows" aria-label="HTTP calls used by the sample agent">
              <li className="cnx-call">
                <span className="cnx-method mono">GET</span>
                <code className="cnx-path mono">/v0/tokens</code>
                <span className="cnx-call-note">Look up the asset ids to swap.</span>
              </li>
              <li className="cnx-call">
                <span className="cnx-method mono">GET</span>
                <code className="cnx-path mono">/sandbox/v0/time</code>
                <span className="cnx-call-note">Read the virtual clock.</span>
              </li>
              <li className="cnx-call">
                <span className="cnx-method mono">POST</span>
                <code className="cnx-path mono">/v0/quote</code>
                <span className="cnx-call-note">Ask for a quote and a deposit address.</span>
              </li>
              <li className="cnx-call">
                <span className="cnx-method mono">POST</span>
                <code className="cnx-path mono">/sandbox/v0/wallet/transfer</code>
                <span className="cnx-call-note">Send the fake deposit.</span>
              </li>
              <li className="cnx-call">
                <span className="cnx-method mono">POST</span>
                <code className="cnx-path mono">/sandbox/v0/report</code>
                <span className="cnx-call-note">Post your final claim.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="container section section-rule" aria-labelledby="cnx-sample-title">
        <div className="split">
          <div className="split-label">
            <p className="eyebrow">Starter</p>
            <h2 className="h2" id="cnx-sample-title">
              A minimal agent to start from
            </h2>
            <p className="cnx-side-note">
              The sample below is deliberately naive: it reports “pending” instead of guessing. Swap
              in your own agent and let the crashes find the gaps.
            </p>
          </div>
          <div className="cnx-code cnx-sample">
            <div className="cnx-code-head">
              <span className="cnx-code-label mono">my-agent.js</span>
              <CopyButton value={SAMPLE} label="Copy sample" className="cnx-copy" />
            </div>
            <pre className="mono" tabIndex={0}>
              <code>{SAMPLE}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className="container section section-rule" aria-labelledby="cnx-run-title">
        <div className="split">
          <div className="split-label">
            <p className="eyebrow">Output</p>
            <h2 className="h2" id="cnx-run-title">
              What a run looks like
            </h2>
            <p className="cnx-side-note">
              Two bundled agents first, then the same harness pointed at your own process.
            </p>
          </div>
          <div className="cnx-code cnx-terminal">
            <div className="cnx-code-head">
              <span className="cnx-code-label cnx-code-label-icon mono">
                <TerminalIcon size={16} /> terminal
              </span>
            </div>
            <pre className="mono" tabIndex={0}>
              <code>{TERMINAL}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className="container section" aria-labelledby="cnx-limits-title">
        <aside className="callout cnx-limits">
          <span className="tag">Good to know</span>
          <h2 className="h3" id="cnx-limits-title">
            Real keys and real chain RPC
          </h2>
          <p>
            An agent that signs with real keys over a real chain RPC cannot be sandboxed by this
            tool. It needs to call the 1Click HTTP contract, or use an in-process adapter.
          </p>
          <a href="/run" className="link-arrow cnx-limits-link">
            Run the suite <ArrowRightIcon size={16} />
          </a>
        </aside>
      </section>
    </div>
  );
}

function CodeLine({ code }: { code: string }) {
  return (
    <div className="cnx-line">
      <code className="mono">
        <span className="cnx-prompt" aria-hidden="true">
          $
        </span>{' '}
        {code}
      </code>
      <CopyButton value={code} className="cnx-copy" />
    </div>
  );
}

function CodeBlock({ code, label = 'shell' }: { code: string; label?: string }) {
  return (
    <div className="cnx-code">
      <div className="cnx-code-head">
        <span className="cnx-code-label mono">{label}</span>
        <CopyButton value={code} className="cnx-copy" />
      </div>
      <pre className="mono" tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
