import type { Law } from '@airbag/core';
import { LAW_NAMES, SCENARIOS, gradeTone } from '../lib/report';
import { useAppState } from '../state/AppState';
import { MarkerLogo } from '../components/MarkerLogo';
import { LinkButton } from '../components/Primitives';
import { ArrowRightIcon } from '../components/Icons';
import { cx, formatUsd } from '../lib/format';
import '../styles/pages/home.css';

const LAW_SENTENCES: Record<Law, string> = {
  1: 'Sign only the amount and destination you were quoted.',
  2: 'A timeout is a question, not a reason to send again.',
  3: 'Quotes expire and confirmations take time. Check both.',
  4: 'A success needs a destination hash and the minimum output.',
  5: 'Token names and error messages are text, never orders.',
  6: 'Decimals, slippage and daily caps are part of the task.',
  7: 'A refund must reach the user’s own wallet on the right chain.',
};

const STEPS = [
  {
    title: 'Point your agent at Airbag',
    body: 'Point your agent’s 1Click calls at one base URL and send deposits through the sandbox wallet.',
  },
  {
    title: `It runs ${SCENARIOS.length} crash scenarios`,
    body: 'Timeouts, expired quotes, poisoned token names, decimal traps and broken refunds.',
  },
  {
    title: 'Read the report card',
    body: 'A grade, the money it would have lost, and a fix for every failure.',
  },
];

const TRUTH = [
  ['1Click API contract', 'Mirrored from docs.near-intents.org, 13 Nov 2026'],
  ['Token list and prices', 'Real snapshot, 13 Nov 2026'],
  ['Swaps, deposits, refunds', 'Simulated. No funds move.'],
  ['Solver behavior', 'Not in the real API; tagged “modeled” in results'],
];

export function LabPage() {
  const { reports } = useAppState();
  const agents = [
    { report: reports.naive, setup: 'No guards', name: 'Dummy agent' },
    { report: reports.hardened, setup: 'With Agent Airbag Guard', name: 'Seatbelt agent' },
  ];

  return (
    <div className="page page-lab page-home">
      <section className="container home-hero" aria-labelledby="home-title">
        <span className="tag home-tag">
          <MarkerLogo size={16} />
          Crash-test lab for NEAR Intents agents
        </span>
        <h1 className="display home-title" id="home-title">
          Crash-test your AI agent before it touches real money.
        </h1>

        <div className="home-hero-body">
          <div className="home-hero-copy">
            <p className="lead">
              Agent Airbag is a simulated version of the NEAR Intents 1Click swap API that fails on
              purpose. Run your agent through {SCENARIOS.length} crash scenarios and see what it
              would have lost, and how to fix it.
            </p>
            <div className="home-actions">
              <LinkButton href="/run?auto=naive" variant="primary" size="lg">
                Run the crash suite <ArrowRightIcon size={18} />
              </LinkButton>
              <LinkButton href="/connect" variant="secondary" size="lg">
                Test your own agent
              </LinkButton>
            </div>
            <p className="home-note">Runs in your browser · No keys · No real funds</p>

            <dl className="home-facts" aria-label="Lab at a glance">
              <div>
                <dt>Crash scenarios</dt>
                <dd>{SCENARIOS.length}</dd>
              </div>
              <div>
                <dt>Safety laws</dt>
                <dd>7</dd>
              </div>
              <div>
                <dt>Real funds at risk</dt>
                <dd>$0.00</dd>
              </div>
            </dl>
          </div>

          <aside className="card home-result" data-reveal aria-labelledby="proof-title">
            <header className="home-result-head">
              <h2 className="h3" id="proof-title">
                Same {SCENARIOS.length} crashes, two agents
              </h2>
              <a href="/report" className="link-arrow home-result-link">
                Open the report <ArrowRightIcon size={14} />
              </a>
            </header>
            <div className="home-result-list">
              {agents.map(({ report, setup, name }) => {
                const tone = gradeTone(report.overall.grade);
                const total = report.suite.scenarioCount;
                const passed = report.overall.passed;
                return (
                  <article className={cx('home-agent', `home-agent-${tone}`)} key={name}>
                    <span className="home-grade" aria-label={`Grade ${report.overall.grade}`}>
                      {report.overall.grade}
                    </span>
                    <div className="home-agent-who">
                      <h3 className="home-agent-name">{name}</h3>
                      <p className="home-agent-setup">
                        {setup} · <strong>{passed}</strong> of {total} survived
                      </p>
                      <div
                        className="home-bar"
                        role="img"
                        aria-label={`Survived ${passed} of ${total}`}
                      >
                        <span style={{ width: `${(passed / total) * 100}%` }} />
                      </div>
                    </div>
                    <div className="home-agent-loss">
                      <p className="home-money">{formatUsd(report.overall.simulatedLossUsd)}</p>
                      <p className="home-caption">simulated loss</p>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="home-foot">
              Both are scripted reference agents. Dummy follows the 1Click tutorial; Seatbelt checks
              before it signs. Seatbelt’s $1.00 is a modeled refund fee, not an observed loss.
            </p>
          </aside>
        </div>
      </section>

      <section className="container section section-rule" aria-labelledby="how-title" data-reveal>
        <div className="split">
          <div className="split-label">
            <p className="eyebrow">Method</p>
            <h2 className="h2" id="how-title">
              How it works
            </h2>
          </div>
          <ol className="rows home-steps">
            {STEPS.map((step, index) => (
              <li className="home-step" key={step.title}>
                <span className="home-step-num" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="h3">{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container section section-rule" aria-labelledby="laws-title" data-reveal>
        <div className="home-head">
          <div>
            <p className="eyebrow">Rulebook</p>
            <h2 className="h2" id="laws-title">
              The seven laws
            </h2>
            <p className="lead">
              Seven laws for agents that move money. Each crash breaks one of them.
            </p>
          </div>
          <a href="/scenarios" className="link-arrow home-head-link">
            All {SCENARIOS.length} scenarios <ArrowRightIcon size={14} />
          </a>
        </div>
        <ol className="rows home-laws">
          {([1, 2, 3, 4, 5, 6, 7] as Law[]).map((law) => (
            <li key={law}>
              <a href={`/scenarios?law=${law}`} className="row-link home-law">
                <span className="home-law-num">{law}</span>
                <h3 className="h3 home-law-name">{LAW_NAMES[law]}</h3>
                <span className="home-law-text">{LAW_SENTENCES[law]}</span>
                <span className="home-law-arrow" aria-hidden="true">
                  <ArrowRightIcon size={18} />
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section className="container section section-rule" aria-labelledby="near-title" data-reveal>
        <div className="split">
          <div className="split-label">
            <p className="eyebrow">Foundation</p>
            <h2 className="h2" id="near-title">
              Why this is built on NEAR
            </h2>
            <p className="lead">
              NEAR Intents turns a cross-chain swap into one signed intent and one quote. That makes
              it the natural rail for agents that move money, and the natural place to test them.
            </p>
            <a
              className="link-arrow home-docs-link"
              href="https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api"
              target="_blank"
              rel="noreferrer"
            >
              Read the 1Click docs <ArrowRightIcon size={14} />
            </a>
          </div>
          <ol className="rows home-points">
            <li>
              <h3 className="h3">One quote instead of five bridges</h3>
              <p>
                Solvers compete to fill an intent, so an agent never wires up a bridge or holds gas
                on every chain. Airbag mirrors that HTTP contract, so a fix here transfers to the
                real API.
              </p>
            </li>
            <li>
              <h3 className="h3">The failure modes are real</h3>
              <p>
                Competing solvers mean quotes expire, statuses lag and refunds happen. Those are
                exactly the moments where an agent pays twice, so they are the crashes this lab
                replays.
              </p>
            </li>
            <li>
              <h3 className="h3">Built for agents, tested like money</h3>
              <p>
                NEAR describes Intents as a transaction layer for the AI economy. Agents holding
                money need the same thing humans do: a place to fail before the funds move.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="container section section-rule" aria-labelledby="truth-title" data-reveal>
        <div className="split">
          <div className="split-label">
            <p className="eyebrow">Transparency</p>
            <h2 className="h2" id="truth-title">
              What is real, what is simulated
            </h2>
            <p className="lead">
              The report card never says “safe”. It says which crashes your agent survived.
            </p>
          </div>
          <div className="callout home-truth">
            <span className="tag">Sources and limits</span>
            <dl className="home-truth-list">
              {TRUTH.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="container section section-rule" data-reveal aria-labelledby="cta-title">
        <div className="home-cta">
          <div className="home-cta-copy">
            <span className="tag">Law 5 · {LAW_NAMES[5]}</span>
            <h2 className="h2" id="cta-title">
              A token name that carries an instruction
            </h2>
            <p className="home-cta-sub">
              One of the {SCENARIOS.length} crashes. Watch it happen, then switch to Seatbelt.
            </p>
          </div>
          <LinkButton
            href="/replay/token-metadata-injection"
            variant="primary"
            size="lg"
            className="home-cta-btn"
          >
            Watch that crash <ArrowRightIcon size={16} />
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
