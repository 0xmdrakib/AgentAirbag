# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor and others) working in this repository.
Humans: the [README](README.md) is the better starting point.

## What this is

Agent Airbag crash-tests AI agents that move money. It is a sandboxed replica of the NEAR Intents
1Click swap API, 21 scripted faults grouped into seven laws, a Judge that scores from ledger truth,
and a Guard policy engine. Everything is simulated; no real funds move.

## Setup

```bash
# Node 22+, pnpm 9+ (corepack enable if pnpm is missing)
pnpm install --frozen-lockfile
```

No API keys are needed for anything below. `NEARAI_API_KEY` is only for the optional LLM agent and
`DATABASE_URL` only for Neon; see `.env.example`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm verify` | The full gate: lint, typecheck, tests, HTTP and process smokes, attack demo, llms check, build, demo smoke. Run before finishing. |
| `pnpm test` | Vitest, all packages (131 tests) |
| `pnpm test:api` | Wallet auth and store tests only |
| `pnpm airbag run --agent naive --summary` | Dummy: expect grade F, 21 crashed |
| `pnpm airbag run --agent hardened --summary` | Seatbelt: expect grade A, 21 survived |
| `pnpm demo:attack` | Injection demo: unguarded loses, guarded blocks and still completes |
| `pnpm demo` | Build, then serve the app at http://localhost:4321 |
| `pnpm build:scenarios`, `pnpm build:fixtures` | Regenerate scenario data and the two golden reports |
| `pnpm build:api` | Regenerate the committed Vercel function `api/index.js` after editing `packages/server`, `packages/core` or `db/schema.sql`; `--check` fails if it is stale |
| `pnpm build:site` | Publish the documents next to the app (done by `pnpm build`): `llms.txt`, `AGENTS.md`, `docs/*.md` and the reports are served from the site. `pnpm check:site [url]` verifies them, locally or against a live URL |
| `pnpm llms` | Regenerate `llms-full.txt` after editing any doc it includes |
| `pnpm lint`, `pnpm typecheck`, `pnpm format` | Static checks and formatting |

UI checks (`pnpm ui:audit`, `ui:interact`, `ui:share`, `ui:seed`) and `pnpm screenshots` need the
demo running and a local Chrome or Chromium (`CHROME_PATH` overrides discovery).

## Repository map

```text
packages/core      sandbox, ledger, virtual clock, seeded PRNG, scenario runtime, judge, scoring
packages/guard     allow / warn / block policy engine (no I/O)
packages/agents    Dummy, Seatbelt, LLM adapter, cassette replay, process adapter
packages/server    Hono HTTP sandbox, CLI, wallet auth API, Postgres or JSON store
apps/web           React + Vite app, History API routing (a static host must serve index.html for unknown paths)
scenarios/         21 YAML scenarios, three per law
fixtures/          live token and quote snapshots, generated golden reports
docs/              architecture, scenarios, claims, facts, deploy, process records
scripts/           demo server, builders, smoke tests, UI checks
```

## Invariants (do not break these)

- **Determinism.** No `Date.now()`, argument-less `new Date()` or `Math.random()` in
  `packages/core`. Use the injected clock and seeded PRNG. The same seed must give a byte-identical
  report hash; `packages/core/test/golden.test.ts` pins the Dummy and Seatbelt hashes.
- **Isomorphic core.** `packages/core` has no Node imports; ESLint enforces it.
- **Money is `bigint`**, as smallest-unit strings on the wire. Format only in the UI.
- **Ledger truth.** The Judge reads the event log and ledger, never the agent's own claim. The UI
  never recomputes a verdict.
- **Frozen contracts.** `types.ts`, `report.schema.ts` and `scenario.schema.ts` in
  `packages/core/src` change only with a `DECISIONS.md` entry and regenerated fixtures.
- **One real-host file.** Only `packages/server/src/liveProbe.ts` may name the real 1Click host, and
  only for `GET /v0/tokens` and a dry quote. A test scans the source.
- **Sign-in checks key ownership.** `POST /api/auth/verify` must keep proving that the public key is
  an access key of the account (`packages/server/src/nearKeys.ts`) and fail closed. A valid signature
  alone proves nothing about the account name.
- **Changing a number changes the hash.** If scenarios, the Judge or an agent change, regenerate with
  `pnpm build:fixtures`, update `golden.test.ts` and the figures in README and `docs/`, and explain it
  in `DECISIONS.md`.

## Honesty rules

- Label every simulated or modeled result as such (`modeled: true` in the scenario YAML).
- Never write "safe", "certified", "secure" or "guaranteed". Reports say "survived these crashes".
- Claim no LLM result, hosted URL or report signature that does not exist. Every claim in the README
  must have a row in `docs/CLAIMS.md`.
- Never commit a secret. Keys come from the environment; `.env` and `.data/` are gitignored.
- Do not push, publish or submit anything on the maintainer's behalf without being asked.

## Style

- TypeScript strict, ESM, Prettier defaults from `.prettierrc.json`.
- Light theme only. Inter for text, JetBrains Mono for code. Icons are Lucide.
- No em dashes in prose or code comments.
- Keep commits small and conventional (`feat(web):`, `fix(core):`, `docs:`).

## Finding more

- [`llms.txt`](llms.txt): index of every document with one-line descriptions
- [`llms-full.txt`](llms-full.txt): the main documents in one file
- [`docs/README.md`](docs/README.md): the docs map
