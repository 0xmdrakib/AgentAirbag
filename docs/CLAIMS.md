# Claims ledger

Every claim the README or UI makes, the command that proves it, and the expected output. If a claim
is not here, it is not a shipped claim.

| Claim | Evidence command | Expected output |
| --- | --- | --- |
| 21 crashes are implemented | `pnpm build:scenarios` | `Built 21 scenarios (12 P0, 9 P1)` |
| Dummy crashes on all 21 | `pnpm airbag run --agent naive --summary` | `0 survived · 21 crashed` |
| Seatbelt survives all 21 | `pnpm airbag run --agent hardened --summary` | `21 survived · 0 crashed`; grade A |
| The exact naive crash set is asserted | `pnpm test` | 147 tests pass, including `Dummy crashes on at least 14 crashes, and in this build on all 21` |
| The same seed produces a byte-identical report | `pnpm test` | `is deterministic: the same seed produces the same report hash` passes |
| The live client is read-only | `pnpm test` | `read-only live client` suite passes |
| The sandbox accepts the exact quoteRequest echoed by the live API | `pnpm test` | `drop-in 1Click quote compatibility` suite passes |
| Every scenario YAML validates and has a story + fix | `pnpm test` | `scenario contract` suite passes |
| Every report fixture validates against the schema | `pnpm test` | `report fixtures` suite passes |
| Guard returns allow / warn / block with reasons | `pnpm test` | `Airbag Guard` suite passes (41 tests in `packages/guard`) |
| A cassette response hash drift is caught | `pnpm test` | `fails loudly when a sandbox response drifts from the recording` passes |
| No dependency advisory reaches the server or core | `pnpm audit --prod` | Three advisories (secp256k1, base-x, elliptic), every path starting at `apps/web > @near-wallet-selector/*`, the browser wallet libraries. Five more entries list no path in this install. See `docs/SECURITY.md` |
| Sign-in and saving are rate limited, and storage per account is capped | `pnpm test:api` | `abuse.test.ts` passes: 429 with `Retry-After` past the limit, a fresh window after a minute, no blocking when the counter fails, 50 runs and 10 sessions per account, foreign-origin POST refused |
| The attack demo blocks the injected transfer | `pnpm demo:attack` | Unguarded loss `$9995.46`; guarded blocks with `TAINTED_VALUE`, still completes the swap and ends `PASS · $0.00` |
| The demo runs offline after install | `pnpm demo` (disconnect the network after `pnpm install`) | Report card at the printed URL; no API calls |
| The demo smoke passes | `pnpm demo --smoke` | `Demo smoke passed.` |
| The whole verification passes | `pnpm verify` | Lint, typecheck, tests, the HTTP sandbox smoke, the process adapter smoke, build, demo smoke exit 0 |
| A bring-your-own agent can use the HTTP sandbox | `pnpm test:http` | Tokens, quote, transfer, submit, SUCCESS with a destination hash, report accepted |
| A bring-your-own process runs through the adapter | `pnpm test:process` | `Process agent: verdict PASS, loss $0.00, reported success` |
| The report card is generated from ledger truth | `pnpm build:fixtures` | `fixtures/report.naive.json` and `report.hardened.json`; violations cite event indexes |
| Dummy’s simulated loss is $10,907.04 | `pnpm build:fixtures` or README report card | `F · 21 crashed · $10907.04 simulated loss` |
| Seatbelt’s simulated loss is $1.00 (modeled refund fee) | `pnpm build:fixtures` | `A · 0 crashed · $1.00 simulated loss` |
| The token/price snapshot is from a live read-only call | `fixtures/tokens.snapshot.json` | 58,875 bytes; 223 of 231 tokens carry `priceUpdatedAt` 2026-11-13T19:15:01.290Z, and the other 8 carry older timestamps |
| The dry quote snapshot is from a live read-only call | `fixtures/quotes.snapshot.json` | `quote.amountOut` present; `dry: true` in the echo |
| No real swap is executed | code + tests | The only live calls are GET tokens and POST quote with `dry: true`; the read-only test scans the source |
| The hosted static app needs no backend | `pnpm build` | `apps/web/dist` contains only static assets |
| The LLM adapter ships | `grep -R "class ToolRunner" packages/agents/src` | `tools.ts` defines the tool surface; `llm.ts` defines the adapter |
| No LLM result is claimed | UI Report → Compare | “LLM on NEAR AI Cloud: not recorded” |
| A hosted demo is live | `curl -sI https://agentairbag.xyz/report` | `200`; the page is the app |
| The hosted API is connected to Postgres | `curl -s https://agentairbag.xyz/api/health` | `{"ok":true,"db":"neon","network":"mainnet"}` |
| The documents are served as real files by the site | `pnpm check:site https://agentairbag.xyz/` | `22 published documents are served as real files by https://agentairbag.xyz/` (not the app shell) |
| Main routes and alternate UI states have browser checks | `pnpm ui:audit`, `pnpm ui:flows` (demo running) | Six routes at seven widths; successful reports, completed runs, replay switches, YAML drawers and saved-run dialogs. The flow check mocks the wallet API, not real wallet approval |
| `llms.txt` links resolve and `llms-full.txt` is current | `pnpm llms --check` | `llms.txt links resolve and llms-full.txt is current.` |
| No report signature is claimed | README + report metadata | `signature` is absent; README says so |

## Claims deliberately not made

- “Safe” or “certified”. The card says **survived these crashes**.
- “Real swaps” / “on-chain” / “mainnet funds”. Everything is simulated.
- A real LLM score or replay. No cassette is bundled.
- A signed transaction or any spend. Wallet sign-in signs a message only.
- That each real wallet extension was tested. Sign-in was tested end to end with a generated key.
- A live 1Click write path. The client is read-only.
- A NEAR report signature. Not shipped.
