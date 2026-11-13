# Build log

All times UTC. The human is asleep for most of this build; decisions are logged in
[`DECISIONS.md`](DECISIONS.md).

## 2026-11-13

**19:15 — Phase 0 starts.** Empty directory. Node 24.14.1, git 2.53.0. pnpm missing;
`corepack enable` fails with EPERM on Windows, so pnpm 9.15.9 is installed with npm.
Live network is available.

**19:16 — Live probes.**
- `GET https://1click.chaindefuser.com/v0/tokens` → 200, 58,875 bytes, 8 curated tokens saved.
- `POST /v0/quote` with `dry: true`, 100 USDC Base → NEAR → 201. The live response differs from the
  prompt in useful ways: no `depositAddress`, `deadline` or `timeWhenInactive`; `timeEstimate` is
  35; `refundFee` 2400; `withdrawFee` 0; `quoteRequest` adds `confidentiality: public`,
  `insured: false`, `quoteWaitingTimeMs: 0`, and an `appFees` entry with `fee: 20`.
- Malformed quote and unknown deposit address return **empty 400 / 404 bodies**, not JSON.
- `nearhackathon.com/HACKATHON.md` re-fetched. Dates, form fields, size values, consent text and
  track names match the prompt. The repo must be public by 2026-11-14T23:59:00Z.

**19:30 — Name check.** `npm view crumple` is a WebGL delete animation; a web search found
[crumple.priberry.com](https://crumple.priberry.com/), “the crash test for AI coding agents”. Direct
name and metaphor clash. The prompt’s fallback list applies. Decision: **rename to Airbag** before
docs and screenshots. `npm view airbag` is an unrelated execution-orchestration library; no
crash-test product was found with the name.

**19:40 — Scaffold.** pnpm workspace: `packages/core`, `packages/guard`, `packages/agents`,
`packages/server`, `apps/web`. TypeScript strict, Vitest, ESLint flat config, Prettier.

**20:00 — Core contracts.** `types.ts`, `report.schema.ts`, `scenario.schema.ts`; virtual clock,
seeded PRNG, bigint ledger, address validators, canonical JSON + sha256, quote math, fixes.
No Node APIs in core; ESLint enforces it.

**20:30 — Sandbox.** 1Click routes, quote math, deposit state machine, status resolution, virtual
time, fault hooks (`onTokens`, `onQuote`, `onTransfer`, `onStatus`, `onRequest`, `onTime`). The
dry-quote shape follows the live probe, not the prompt.

**21:00 — 21 scenarios.** Three per law, 12 P0 + 9 P1, all validated by Zod at build time. The YAML
files are the source of truth; `pnpm build:scenarios` writes the browser bundle.

**21:30 — Judge and scoring.** Seven invariants read only the EventLog and ledger. Verdicts are
action-based: a faulted quote that is never funded cannot fail the agent. Loss is computed from
`ledger.lost` moves, never from the agent’s words.

**22:00 — Agents.** Dummy (19 named flaws) and Seatbelt (Airbag Guard) implemented. Tuning the
Dummy took several loops; the naive expectations are in `packages/agents/FLAWS.md`.

**23:00 — Guard.** `allow / warn / block` with every reason code from the prompt; 36 guard tests
(trigger + clean for every code). Seatbelt refuses to proceed on any non-allow decision.

## 2026-11-14

**00:00 — Web app.** Vite + React, hash routes, plain CSS design system. Lab, Runner, Report Card,
Crash Replay, Scenario Library, Connect. The browser runs the scripted suites itself through the
pure core; no backend.

**01:00 — Fixtures and screenshots.** `pnpm build:fixtures` runs both suites and writes
`fixtures/report.*.json`, `apps/web/src/generated/*`, `docs/FACTS.md` and `docs/SCENARIOS.md`.
Playwright-core drives the installed Chrome for the README screenshots.

**01:30 — Tests.** 56 passing: golden Dummy/Seatbelt sets, determinism (byte-identical hash),
scenario schema, report fixtures, read-only live client scan, decimal/quote/ledger/address tests,
Guard tests, synthetic cassette replay and hash-drift detection.

**02:00 — Rename to Airbag.** Source, packages, CLI, env vars, UI, tests, fixtures and docs are
renamed. The saved master prompt stays verbatim. Regenerated reports use `seed airbag-demo-2026`
and tool name `airbag`.

**02:20 — Honest limits.**
- No `NEARAI_API_KEY`: the LLM adapter and recorder ship, but **no LLM run or cassette is bundled**.
  The UI and README say this; no model result is claimed.
- No hosting account: the static build is ready and `vercel.json` exists, but **no hosted URL**.
- No human yes: the repo is local; nothing is pushed, posted, signed or submitted.
- No demo video yet. The human records it from `docs/DEMO_SCRIPT.md`.

**02:30 — Current state.** `pnpm lint`, `pnpm typecheck`, `pnpm test` (57), `pnpm build`, and
`pnpm demo --smoke` pass. Dummy: F, 21/21 crashed, $10,907.04 simulated loss, 8 false claims.
Seatbelt: A, 21/21 survived, $1.00 modeled refund fee. Next: final screenshots, git init/tags,
clean-clone test, README claim audit, then the human’s five steps.
