import type { Law } from '@airbag/core';
import { LAW_NAMES, SCENARIOS, gradeTone } from '../lib/report';
import { useAppState } from '../state/AppState';
import { MarkerLogo } from '../components/MarkerLogo';
import { LinkButton } from '../components/Primitives';
import { ArrowRightIcon } from '../components/Icons';
import { cx, formatUsd } from '../lib/format';

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
    <div className="page page-lab">
      <div className="landing-top container">
        <section className="landing-hero">
        <p className="landing-kicker">
          <MarkerLogo size={16} />
          Crash-test lab for NEAR Intents agents
        </p>
        <h1 className="landing-title">Crash-test your AI agent before it touches real money.</h1>
        <p className="landing-sub">
          Agent Airbag is a simulated version of the NEAR Intents 1Click swap API that fails on
          purpose. Run your agent through {SCENARIOS.length} crash scenarios and see what it would
          have lost, and how to fix it.
        </p>
        <div className="landing-actions">
          <LinkButton href="/run?auto=naive" variant="primary" size="lg">
            Run the crash suite <ArrowRightIcon size={18} />
          </LinkButton>
          <LinkButton href="/connect" variant="secondary" size="lg">
            Test your own agent
          </LinkButton>
        </div>
        <p className="landing-note">Runs in your browser · No keys · No real funds</p>
        <dl className="hero-facts landing-facts">
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
      </section>

      <section className="landing-proof" data-reveal aria-labelledby="proof-title">
        <div className="result-card">
          <header className="result-head">
            <h2 className="result-title" id="proof-title">
              Same {SCENARIOS.length} crashes, two agents
            </h2>
            <a href="/report" className="proof-link">
              Open the report <ArrowRightIcon size={14} />
            </a>
          </header>
          <div className="result-rows">
            {agents.map(({ report, setup, name }) => {
              const tone = gradeTone(report.overall.grade);
              const total = report.suite.scenarioCount;
              const passed = report.overall.passed;
              return (
                <article className={cx('result-row', `result-${tone}`)} key={name}>
                  <span className="result-grade" aria-label={`Grade ${report.overall.grade}`}>
                    {report.overall.grade}
                  </span>
                  <div className="result-who">
                    <h3 className="result-name">{name}</h3>
                    <p className="result-setup">{setup}</p>
                  </div>
                  <div className="result-loss">
                    <p className="result-money">{formatUsd(report.overall.simulatedLossUsd)}</p>
                    <p className="result-caption">simulated loss</p>
                  </div>
                  <div className="result-survival">
                    <div
                      className="result-bar"
                      role="img"
                      aria-label={`Survived ${passed} of ${total}`}
                    >
                      <span style={{ width: `${(passed / total) * 100}%` }} />
                    </div>
                    <p className="result-count">
                      <strong>{passed}</strong> of {total} survived
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="result-foot">
            Both are scripted reference agents. Dummy follows the 1Click tutorial; Seatbelt checks
            before it signs. Seatbelt’s $1.00 is a modeled refund fee, not an observed loss.
          </p>
        </div>
      </section>
      </div>

      <section className="container section" aria-labelledby="how-title" data-reveal>
        <h2 className="h2 landing-h2" id="how-title">
          How it works
        </h2>
        <ol className="how-grid">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="how-num">{index + 1}</span>
              <h3 className="h3">{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container section" aria-labelledby="laws-title" data-reveal>
        <div className="landing-section-head">
          <div>
            <h2 className="h2 landing-h2" id="laws-title">
              The seven laws
            </h2>
            <p className="section-sub">
              Seven laws for agents that move money. Each crash breaks one of them.
            </p>
          </div>
          <a href="/scenarios" className="proof-link">
            All {SCENARIOS.length} scenarios <ArrowRightIcon size={14} />
          </a>
        </div>
        <ol className="law-list">
          {([1, 2, 3, 4, 5, 6, 7] as Law[]).map((law) => (
            <li key={law}>
              <a href={`/scenarios?law=${law}`} className="law-row">
                <span className="law-row-num">{law}</span>
                <span className="law-row-name">{LAW_NAMES[law]}</span>
                <span className="law-row-text">{LAW_SENTENCES[law]}</span>
                <span className="law-row-link" aria-hidden="true">
                  <ArrowRightIcon size={16} />
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section className="container section" aria-labelledby="near-title" data-reveal>
        <div className="why-near">
          <div className="why-near-intro">
            <h2 className="h2 landing-h2" id="near-title">
              Why this is built on NEAR
            </h2>
            <p className="section-sub">
              NEAR Intents turns a cross-chain swap into one signed intent and one quote. That
              makes it the natural rail for agents that move money, and the natural place to test
              them.
            </p>
            <a
              className="proof-link"
              href="https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api"
              target="_blank"
              rel="noreferrer"
            >
              Read the 1Click docs <ArrowRightIcon size={14} />
            </a>
          </div>
          <ol className="why-near-list">
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

      <section className="container section" aria-labelledby="truth-title" data-reveal>
        <div className="truth-block">
          <div>
            <h2 className="h2 landing-h2" id="truth-title">
              What is real, what is simulated
            </h2>
            <p className="section-sub">
              The report card never says “safe”. It says which crashes your agent survived.
            </p>
          </div>
          <dl className="truth-list">
            {TRUTH.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container section" data-reveal>
        <div className="cta-band">
          <div>
            <h2 className="h2">A token name that carries an instruction</h2>
            <p className="section-sub">
              One of the {SCENARIOS.length} crashes. Watch it happen, then switch to Seatbelt.
            </p>
          </div>
          <div className="cta-actions">
            <LinkButton href="/replay/token-metadata-injection" variant="primary" size="lg">
              Watch that crash <ArrowRightIcon size={16} />
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}
