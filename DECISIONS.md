# Decisions

Three lines each: decision, alternatives, reason.

## Product and name

**Rename Crumple → Airbag.** Alternatives: keep Crumple, Bumper, Rollcage. Reason: the Phase 0
search found `crumple.priberry.com`, a crash-test product for AI coding agents with the same name and
metaphor. The prompt says rename on a clash; Airbag is the closest fallback and no direct
money-agent crash-test product was found under it. The saved master prompt is verbatim and still
says Crumple; the shipped code, UI, CLI, packages and docs say Airbag.

**Tracks: AI Security & Defense + Open Innovation.** Alternatives: only security. Reason: the Guard
and the attack demo fit Track 06 directly; the intents sandbox is a new testing layer, which fits
Track 13. The form can list both.

## Architecture

**One pure TypeScript core, no backend.** Alternatives: a Node API for runs, a separate worker.
Reason: the demo must run on a static host with no keys or network, and the CLI must use the same
judge and scenarios. ESLint bans Node imports in `packages/core`; a test scans the live client.

**Plain CSS design system instead of Tailwind v4.** Alternatives: Tailwind, CSS-in-JS. Reason: the
design is a small, highly custom system (radar, scenario grid, replay scrubber). Hand-written tokens
and components keep the initial JavaScript at 193 KB gzipped (the index chunk; the wallet SDK is a separate 85 KB chunk loaded on connect)
and remove a build dependency. This is a deliberate
deviation from the pinned stack in the prompt; the visual spec is implemented.

**Zod at every boundary; `bigint` for money.** Alternatives: io-ts, plain TS, `number`. Reason: the
scenario YAML, report and quote wire formats need runtime validation; money must not round through
floats. Amounts are smallest-unit strings on the wire and `bigint` internally.

**Virtual clock and seeded PRNG in the core.** Alternatives: real time, `Math.random`. Reason: a
golden test must produce a byte-identical report hash for the same seed. The wall-clock timeout lives
in the Node harness, not the core.

**EventLog is the only judge input.** Alternatives: re-run the scenario, trust the agent’s report.
Reason: replay, audit and honesty all need one ordered source of truth. The UI never recomputes a
verdict.

## Sandbox fidelity

**Copy the live dry-quote shape, not only the docs.** Alternatives: follow the prompt’s documented
shape. Reason: the live `POST /v0/quote` on 13 Nov 2026 omits `depositAddress`, `deadline` and
`timeWhenInactive` for `dry: true`, returns `timeEstimate: 35`, `refundFee: 2400`,
`withdrawFee: 0`, and echoes `confidentiality`, `insured`, `quoteWaitingTimeMs` and `appFees`. Live
behavior wins; recorded in `docs/VERIFIED_FACTS.md`.

**Empty 400/404 bodies for quote/status errors.** Alternatives: JSON error envelopes. Reason: the
live probes returned empty bodies for a malformed quote and an unknown deposit address. Scenario
5.2 injects a JSON 500 body, which is a modeled fault, not a claim about the real 400 shape.

**Support `KNOWN_DEPOSIT_TX`.** Alternatives: only the documented status list. Reason: the docs’
example responses show it between submit and PROCESSING; the prompt asks to support it and note it
as undocumented.

**Lax refund validation in Law 7 scenarios.** Alternatives: reject invalid refund addresses at quote
time. Reason: the judge must score the agent’s decision, so 7.1 and 7.2 accept the unsafe quote and
then flag `exit-intact`. The behavior is marked `modeled: true` in the YAML and docs; the real API
may reject it earlier.

**Modeled refund penalties and stranded memo deposits.** Alternatives: no penalty, or a documented
real fee. Reason: the real system’s penalty/stranding behavior was not verified. They are labelled
`modeled: true`; the card shows the modeled fee. This is why Seatbelt’s overall loss is $1.00 even
though it survives all 21: scenario 4.1 models a 1% refund fee that the world charges, not a safety
violation by the agent.

## Judge and scoring

**Only action-based quote violations fail.** Alternatives: fail on any bad quote the sandbox returns.
Reason: a faulted quote that the agent rejects should not fail the agent. `pay-matches-quote`,
`within-policy` and `exit-intact` are gated on a funding transfer; a safe abort is a PASS.

**Invariant violations decide verdicts; world loss alone does not.** Alternatives: any loss → WARN or
FAIL. Reason: scenario 4.1 charges a modeled refund fee to an agent that reports it honestly. The
agent did the right thing; the loss is displayed but is not a safety failure. FAIL requires a
critical invariant violation or a false claim; WARN is a non-critical warning such as a missing
report.

**`cappedBy` only when the cap lowers the grade.** Alternatives: always show the unbounded-loss cap.
Reason: the Dummy is already F; “capped at F” is noise and looks like a scoring error. A cap only
applies when the score would otherwise be above C.

**Naive crashes on all 21.** Alternatives: tune it to survive a few. Reason: the requirement is at
least 14, with a target of 18+; the Dummy is a teaching agent, and every scenario has a named flaw.
The golden test asserts the exact set, not just a count. The report card is honest about it.

## LLM and cassettes

**No cassette is bundled.** Alternatives: fabricate a replay, or use a synthetic cassette as if it
were a model. Reason: no `NEARAI_API_KEY` was available. The adapter and recorder are implemented and
the replay machinery has a synthetic test, but no LLM result is claimed. The UI says “not recorded”
and the README repeats it. This is a deliberate honesty decision; it means definition-of-done item 3
is not fully met.

**LLM runs are labelled by model and recording date when present.** The `RunReport.agent` carries
`kind: llm | cassette`, `model` and `recordedAt`; the UI shows them in the report metadata. No cassette
exists yet, so the compare tray leaves the LLM row empty.

**Synthetic cassette test is clearly synthetic.** Alternatives: omit replay tests. Reason: the replay
and hash-drift machinery needs a regression test. The test fixture uses `model:
"synthetic-fixture"` and is not shipped as a product cassette.

## Web and demo

**The browser runs the scripted suites live.** Alternatives: only load fixtures. Reason: judges can
press Crash and watch the grid fill; the core is isomorphic and fast. The initial report card loads
from generated fixtures for a fast first paint.

**Hash routing.** Alternatives: history routing. Reason: static hosting on any path with no rewrite
rules. Vercel and Pages work without configuration.

**The demo prints the URL instead of requiring a browser.** Alternatives: fail if the browser cannot
open. Reason: CI and headless machines. `pnpm demo --smoke` never opens a browser.

**Screenshots use Playwright-core + installed Chrome.** Alternatives: Playwright’s bundled browser
download. Reason: no extra browser download; Chrome/Edge are present on the build machine. This is a
development tool, not a runtime dependency.

## UI design system v2

**Rebuild the visual system after the first screenshot review.** Alternatives: patch the v1 CSS.
Reason: v1 shipped 9–11px text, a flat grey-on-black palette, a radar that was empty for an F grade,
clipped radar labels and a broken Connect rules box. Patching would not fix a type scale. v2 sets a
12px floor, a 16px body, a cool light palette with a warm signal glow and layered surfaces. Red still means FAIL, green PASS, yellow the brand only.

**Radar labels are HTML, not SVG text.** Alternatives: SVG `<text>`. Reason: SVG text shrinks with
the viewBox and falls below 12px on phones. The radar also overlays the other agent (Dummy vs
Seatbelt) so an F grade is not an empty dot. Below 480px of chart width it shows codes and scores only.

**Design system v3: editorial instead of template.** The owner judged v2 as looking like a generic
AI-generated page. The tells were real: a grid background with colour glows, mono uppercase labels on
every section, gradient cards with big radii and hover lifts, a highlighter on the headline, boxed
01/02/03 numerals, chips everywhere and slogan headlines ("Point, crash, read."). v3 removes all of
them. Warm neutral palette, ink-black primary buttons, hairline borders, 6 to 14px radii, one sans
(Inter) for display and UI, mono only for code and API values, money in tabular Inter numerals.
Crash-test yellow is a marker only: the logo, the simulation dot, the final call to action and fault
highlights in the replay. Headlines are plain descriptions. Duplicated numbers were removed (Lab stats
row, Report hero chips). Bricolage Grotesque was dropped.

**No header "Simulation" chip.** The master prompt asked for a persistent SIMULATION chip on every
screen; the owner asked to remove it from the header. The honesty requirement is still met where the
numbers are: every money figure is labelled "simulated", the Lab hero says the API is sandboxed and
shows "$0 real funds at risk", modeled scenarios carry a "modeled" tag, and the footer on every page
says "Everything here is simulated · No real funds move".

**Light theme only.** v2 first shipped dark-first with a light toggle. The owner then asked for light
mode only, so the dark tokens, the toggle, the pre-paint theme script and the `localStorage` key were
removed. Alternatives: keep both themes. Reason: one theme means one palette to keep accessible and
one set of README screenshots. Tokens stay in `:root`; focus rings are a single blue outline that has
contrast on white.

**Responsive is enforced by a script, not by eye.** `pnpm ui:audit` opens six routes at 360, 390,
768, 1024, 1280, 1440 and 1920 px and fails on horizontal overflow, text under 12px,
text past the viewport, small tap targets and console errors. It also tests the mobile menu and
checks that no theme toggle is rendered. It is a manual tool (needs a preview server and a local Chrome), not part of `pnpm verify`.

## Release and limits

**No hosted deploy, push, post, signature or submission.** Alternatives: none that the agent may do
alone. Reason: the five irreversible steps require the human’s explicit yes. The repo stays local;
`docs/SUBMISSION.md` contains the runbook and the payload placeholders.

**No report signing.** Alternatives: Node ed25519 in the server. Reason: P2 stretch and not needed for
the core demo; the hash is still sha256 of canonical JSON. The README says so.

**No Docker image.** Alternatives: a Dockerfile for the clean-clone test. Reason: P2 and time; the
clean-clone test uses a fresh directory and pnpm instead.

## Wallet connect and saved runs

**Optional, not a gate on the simulator.** The crash suite, report and replay stay usable with no
wallet so a judge can evaluate the product without installing a wallet. Connecting unlocks account
features only: saving a report and the My runs list. Alternatives considered: gate the whole app.
Rejected because it turns a 60 second demo into a wallet setup task.

**NEAR wallet selector with MyNearWallet.** `@near-wallet-selector/*` is imported on first connect,
so the landing page does not pay for the SDK (the initial bundle grows by about 9 KB, the wallet
chunk is about 85 KB gzipped on demand). Sign-in uses NEP-413: the server issues a nonce, the wallet
signs the standard payload, and the API verifies ed25519 or secp256k1 locally, then sets an HttpOnly
session cookie. Sessions are stored hashed.

**Postgres on Neon, with a local file store.** If `DATABASE_URL` is set the API uses
`@neondatabase/serverless`; otherwise it writes `.data/airbag.json`. This keeps the demo runnable
offline and still ships a real hosted path. The schema is idempotent and `pnpm db:migrate` applies it.
The report body is capped at 512 KB.

**Known limit:** signature verification proves key possession, not that the key is currently a
full-access key of the claimed account, because the API does not call NEAR RPC. A production deploy
should add that RPC check; it is listed in docs/DEPLOY.md.

## Icons and wallet providers

**One icon family: Lucide.** The hand-drawn SVGs read as inconsistent weights and odd shapes, and the
wallet glyph in particular looked like a card. Every icon now comes from `lucide-react` (MIT, 24px
grid, 1.75 stroke) through thin wrappers in `components/Icons.tsx`, so export names and call sites did
not change. The brand mark stays custom.

**Wallet providers.** Only modules that work without an API key or project id are registered:
MyNearWallet, Sender, OKX Wallet and Nightly, plus Bitget when its extension is present. Meteor,
HERE and Coin98 were tested and removed because one of them crashed the selector at open time; the
picker hides modules that the selector does not expose. WalletConnect needs a project id and Ledger
needs hardware, so both are out of scope for this build.

## Clean URLs instead of hash routing

**The app now uses the History API.** This replaces the earlier hash routing decision. Links read
`/report` and `/replay/<id>` instead of `/#/report`. Alternatives: keep hash routing. Reason: the hash
made every shared link look unfinished, and the only cost of clean paths is one host rule, serve
`index.html` for unknown paths, which Vercel, Cloudflare Pages and the demo server already provide
(GitHub Pages needs a `404.html` copy). A click handler turns plain `<a href="/path">` into client
navigation, anchors such as `#main` still scroll natively, and an old `/#/report` address is rewritten
on load. Vite's `base` is now `/`.

## Documents are served by the site

**The agent-facing files are published at the site root, not only in the repository.** `llms.txt`,
`llms-full.txt`, `AGENTS.md`, the docs, the two reports and the scenarios (as one YAML file) are
copied into the static build by `pnpm build:site`. Alternatives: link to raw.githubusercontent.com
only. Reason: `agentairbag.xyz/llms.txt` is the address an agent will try first, and before this the
SPA rewrite answered it with the app shell and a 200, which is worse than a 404. The rewrite now skips
paths with a file extension, `vercel.json` sets content types, and `pnpm check:site` (part of
`verify`) fails if a published file is missing or is the app shell.

## Wallet order, MyNearWallet and near.com

**Meteor leads the picker and MyNearWallet is last.** The order is Meteor, Nightly, OKX, Sender, then
Here, Coin98, Ledger and MyNearWallet, which carries a "Retiring" tag. MyNearWallet's own site says it
is in limited mode and planned for deprecation on 31 Oct 2026, with Meteor as the recommended path, so
it no longer gets promotional copy and the old footer line about it is gone.

**There is no near.com button.** near.com is NEAR's account app, not a wallet a third-party site can
connect to: a near.com account is controlled by a passkey or by another wallet, and near.com is not in
the NEAR Connect wallet manifest. A button that claimed to connect it would not work, so none exists.

**Known debt: the NEAR docs now call `@near-wallet-selector/*` deprecated** and recommend NEAR Connect
(`@hot-labs/near-connect`). The custom picker is independent of the library, so a migration changes
`selector.ts` and the provider, not the UI. It is listed on the roadmap as not built.

## Wallet picker and provider list

**The hand written Buffer shim was the reason most wallet modules failed.** It lacked
`Buffer.alloc`, `concat` and `slice`, so Meteor, Here, Coin98 and Ledger crashed the selector at
load time and were removed. Installing the real `buffer` package and exposing it as the global fixed
all of them. The picker now lists four primary wallets (MyNearWallet, Sender, OKX Wallet, Nightly)
and puts Meteor, Here, Coin98, Ledger and Bitget under More wallets, ordered by popularity.

**The upstream modal is gone.** It had no way to show a second tier and its fallback reopened the
old dialog after the picker closed, which produced a confusing second modal and a "connection
closed" message. The custom picker is the only chooser now. Wallet errors render through a portal
to `document.body` as a bottom toast, because the header's backdrop-filter traps fixed children.
Cancelling a wallet prompt is silent; only real failures show a message.

## Wallet API on Vercel

**The wallet API runs as a Vercel serverless function on the same origin as the static site.**
Alternatives: keep the deployment static only, or run the API on a separate Node host. Reason: same
origin keeps the session cookie first party with no CORS surface, and it needs no extra host to run
and pay for. Three consequences. First, sign-in nonces now live in Postgres (`auth_nonces`, optional
`saveNonce` and `takeNonce` on the store, consumed atomically) because the instance that issues a
nonce may not be the one that verifies it; the local JSON store and tests keep the in-memory map.
Second, the function is one esbuild bundle, `api/index.js`, generated by `pnpm build:api` and
committed because Vercel detects functions from the repository, not from build output;
`pnpm build:api --check` in `pnpm verify` fails if it is stale. Third, `db/schema.sql` ships with the
function through `includeFiles`, and `readSchemaStatements` falls back to the working directory when
the source-relative path is missing. The SPA rewrite now skips `/api/`. No report, scenario or Judge
number changed.

## Access key ownership check

**Sign-in now checks that the signing key belongs to the claimed account.** The NEP-413 signature
proved only that the caller held some private key, so anyone could sign in as any account name with a
fresh key and read that account's saved runs. `POST /api/auth/verify` now calls
`checkKeyOwnership` (`packages/server/src/nearKeys.ts`) after the signature and before the session.
Implicit accounts are checked locally (the hex of the ed25519 key must equal the account id); named
accounts use the NEAR JSON-RPC `view_access_key` query, accepting full access and function-call
keys. Alternatives: trust the signature alone (rejected, it is the hole), or require full access keys
only (rejected, wallets often sign with a function-call key). It fails closed: an unreachable,
timed-out or unreadable RPC returns 503 and no session. `NEAR_RPC_URL` optionally overrides the public
endpoint. An implicit account that later added other keys can only sign in with its own key; that is
the stricter reading and is deliberate. Tests pass `keyCheck: 'off'` or a stub and never use the
network.

## Name: Agent Airbag

**The product name is Agent Airbag; Airbag is the short form.** The maintainer chose it with the
domain `agentairbag.xyz`. The full name appears in the page titles, header and footer wordmark,
social metadata, preview image, README title, sandbox page, CLI banner and the wallet sign-in
message. Running prose and error messages keep the short form. Internal identifiers stay as they
are: the `@airbag/*` packages, the `pnpm airbag` command, `AIRBAG_*` variables, the
`airbag_session` cookie and the `tool` field inside report JSON, so no report hash changed. The
social preview is `apps/web/public/og.png` (1200x630), rendered by `pnpm og`, because X and most
unfurlers ignore SVG.
