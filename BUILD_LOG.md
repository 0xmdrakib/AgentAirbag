# Build log

All times UTC. The human is asleep for most of this build; decisions are logged in
[`DECISIONS.md`](DECISIONS.md). The build started at **2026-11-13 19:15 UTC**; the deadline is
**2026-11-14 23:59 UTC** (Sunday 15 Nov, 05:59 Asia/Dhaka).

## 2026-11-13

**19:15 — Phase 0 starts.** Empty directory. Node 24.14.1, git 2.53.0. pnpm missing;
`corepack enable` fails with EPERM on Windows, so pnpm 9.15.9 is installed with npm.
Live network is available.

**19:16 — Live probes.**
- `GET https://1click.chaindefuser.com/v0/tokens` → 200, 58,875 bytes, 231 tokens. A curated
  8-token subset is saved for the sandbox.
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

**19:50 — Core contracts.** `types.ts`, `report.schema.ts`, `scenario.schema.ts`; virtual clock,
seeded PRNG, bigint ledger, address validators, canonical JSON + sha256, quote math, fixes.
No Node APIs in core; ESLint enforces it.

**20:00 — Sandbox.** 1Click routes, quote math, deposit state machine, status resolution, virtual
time, fault hooks (`onTokens`, `onQuote`, `onTransfer`, `onStatus`, `onRequest`, `onTime`). The
dry-quote shape follows the live probe, not the prompt.

**20:10 — 21 scenarios.** Three per law, 12 P0 + 9 P1, all validated by Zod at build time. The YAML
files are the source of truth; `pnpm build:scenarios` writes the browser bundle.

**20:20 — Judge and scoring.** Seven invariants read only the EventLog and ledger. Verdicts are
action-based: a faulted quote that is never funded cannot fail the agent. Loss is computed from
`ledger.lost` moves, never from the agent’s words.

**20:30 — Agents.** Dummy (19 named flaws) and Seatbelt (Airbag Guard) implemented. Tuning the
Dummy took several loops; the naive expectations are in `packages/agents/FLAWS.md`.

**20:40 — Guard.** `allow / warn / block` with every reason code from the prompt; 36 guard tests
(trigger + clean for every code). Seatbelt refuses to proceed on any non-allow decision.

**20:50 — Web app.** Vite + React, hash routes, plain CSS design system. Lab, Runner, Report Card,
Crash Replay, Scenario Library, Connect. The browser runs the scripted suites itself through the
pure core; no backend.

**21:00 — Fixtures and screenshots.** `pnpm build:fixtures` runs both suites and writes
`fixtures/report.*.json`, `apps/web/src/generated/*`, `docs/FACTS.md` and `docs/SCENARIOS.md`.
Playwright-core drives the installed Chrome for the README screenshots.

**21:03 — Tests.** 56 passing: golden Dummy/Seatbelt sets, determinism (byte-identical hash),
scenario schema, report fixtures, read-only live client scan, decimal/quote/ledger/address tests,
Guard tests, synthetic cassette replay and hash-drift detection.

**21:06 — Rename to Airbag.** Source, packages, CLI, env vars, UI, tests, fixtures and docs are
renamed. The saved master prompt stays verbatim. Regenerated reports use `seed airbag-demo-2026`
and tool name `airbag`.

**21:10 — Honest limits.**
- No `NEARAI_API_KEY`: the LLM adapter and recorder ship, but **no LLM run or cassette is bundled**.
  The UI and README say this; no model result is claimed.
- No hosting account: the static build is ready and `vercel.json` exists, but **no hosted URL**.
- No human yes: the repo is local; nothing is pushed, posted, signed or submitted.
- No demo video yet. The human records it from `docs/DEMO_SCRIPT.md`.

**21:12 — First self-screen.** A fresh sub-agent cloned the repo, read only the README, reproduced
the demo and scored it 84/100. It found four fixable issues: the exact live quote request was
rejected by a strict Zod schema, the README button label was wrong, a claims-ledger timestamp was
stale, and the Runner seed was not editable. All four were fixed and retested.

**21:14 — Dependency audit.** `@hono/node-server` updated to a patched 2.x release after
`pnpm audit --prod` reported a moderate static-path advisory. The HTTP and process smokes pass on the
new version; `pnpm audit --prod` now reports no known vulnerabilities.

**21:15 — Second self-screen and final verify.** A second fresh sub-agent scored the build
**93/100** with reproducibility 9/10 and claim accuracy 9/10; all requested claims passed, with no
blocking functional failures. `pnpm lint`, `pnpm typecheck`, `pnpm test` (57), `pnpm test:http`,
`pnpm test:process`, `pnpm build`, `pnpm demo --smoke` and a clean-clone test pass. Dummy: F, 21/21
crashed, $10,907.04 simulated loss, 8 false claims. Seatbelt: A, 21/21 survived, $1.00 modeled
refund fee. Tags: `pre-hackathon` (first commit) and `hackathon-submission` (current).

## Remaining human/external steps

- **Hosted demo:** choose Vercel, Cloudflare Pages or GitHub Pages, then deploy `apps/web/dist` /
  `pnpm build`. No hosted URL exists yet.
- **LLM cassette:** set `NEARAI_API_KEY` and run `pnpm airbag record --trials 2`; the adapter and
  recorder are implemented, but no model result is claimed without a recording.
- **Demo video:** record 60–90s from `docs/DEMO_SCRIPT.md`.
- **Publish/submit:** make the repo public, push, post the X thread, and submit the form only after
  the human’s explicit yes. The payload is in `docs/SUBMISSION.md`.

## 2026-11-14 (UI pass)

**04:35 UTC - UI rebuilt after review.** The first UI had 9-11px text, a flat grey palette, an empty radar on an F grade, clipped radar labels and an overlapping Connect rules box. Rebuilt the design system (12px type floor, blue-black palette, layered surfaces, dark and light themes), a mobile menu, a Dummy-vs-Seatbelt radar overlay, a duel panel on the Lab, and a card layout for the compare table on phones. Added pnpm ui:audit: 6 routes x 7 widths (360-1920) x 2 themes, no overflow, no text under 12px, no console errors; mobile menu and theme toggle pass.


**2026-11-14 (light only).** Removed dark mode on request: dark tokens, theme toggle, pre-paint theme script and localStorage key are gone; the UI is light only. ui:audit now runs one light pass and asserts no toggle is rendered. Fixed leftover Crumple names in og.svg and mark.svg.


**2026-11-14 (UX pass 1).** Walked every page and fixed layout and wording: header Run-the-suite CTA; Lab order is now hero, proof, how it works, injected-token duel, seven laws, CTA; law cards deep-link to the filtered library; library cards name their law and show P0/P1 and modeled tags together; Report law list and failure cards fill their columns; Connect shows the example terminal session right after the steps, shows the full sample, and keeps Copy beside each command on phones; Runner terminal command has Copy. ui:audit clean.


**2026-11-14 (design system v3).** Owner said the UI read as cheap and AI-generated. Removed the template tells (grid and glow background, mono caps labels, gradient cards, hover lifts, headline highlighter, boxed numerals, slogan headlines, duplicate stat rows and chips). New warm neutral palette, ink buttons, hairlines, smaller radii, Inter only, tabular money figures, plain-language headlines, laws as an editorial list. Dropped Bricolage Grotesque. ui:audit, interact, share and seed checks clean.


**2026-11-14 (hero, law accordion, header).** Rebuilt the Report law list as an accordion (name, law number and survived count, score, SVG chevron, thin score line) replacing the text glyph chevron and crowded pip/bar row. Rebuilt the Lab hero copy: brand kicker, shorter subhead, and a three-fact row. Removed the header Simulation chip at the owner's request; simulated labels stay on every figure and in the footer.


**2026-11-14 (fluid sizing).** Owner reported the UI did not adapt across PCs, laptops, mini PCs and phones. Added fluid type, gutters and section rhythm that scale with viewport width and height; a compact hero card on short desktop screens; a compact Runner sidebar so Crash stays on the first screen; grade beside the headline on phone report cards; a one-row sticky replay player on phones; a sideways-scrolling law filter row. New pnpm ui:devices checks the first screen on 10 real viewports (360x640 to 2560x1300): primary action above the fold and no overflow on all of them. Footer now reads Built on NEAR.


**2026-11-14 (landing and information architecture).** Rebuilt the landing page around one question per section: what it is (centered hero, one sentence, two actions), proof (one Dummy vs Seatbelt panel), how it works (three steps), what it catches (seven laws), what is real vs simulated, and one call to action. Removed the animated hero card, the fact row, the duplicate results strip and the duplicate token duel. Header is now logo, Report, Scenarios, Connect and one Run the suite button; the footer is one row. Removed duplicates elsewhere: Runner avatar letters and the policy-engine card, Report provenance action buttons, the Connect bottom CTA.


**2026-11-14 (depth and performance).** Landing hero now has faint radar arcs and the 21/7/$0 facts; sections reveal once on scroll with a no-JS and reduced-motion safe fallback (visible by default, reveal-ready class gate, 2.5s failsafe). Report gained an in-page nav (Safety shape, Failures, Compare, Provenance) with scroll spy. Added Back to top, hairline link hovers. Report, Replay and Scenarios pages are lazy chunks: first-load JS 197 -> 184 KB gzipped. Screenshot, sheet and audit scripts settle the page (scroll through) before capture.

