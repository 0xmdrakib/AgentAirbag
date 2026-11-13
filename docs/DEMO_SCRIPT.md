# Demo script (60–90 seconds)

Record at 1080p / 30 fps, captions burned in (Inter), voice-over optional. **The human records and
posts this.** Everything shown must exist in the local build.

| Time | Shot | Caption |
| --- | --- | --- |
| 0:00–0:05 | Lab hero, the mini ledger flashes red | This AI agent just lost $99.95. (Simulated.) |
| 0:05–0:15 | Lab headline and hero | AI agents swap crypto by themselves. NEAR Intents has no testnet, so they get tested with real money. |
| 0:15–0:30 | Press **Run the crash suite**; the grid fills; grade F lands | Airbag crashes a scripted agent 21 ways. |
| 0:30–0:45 | Replay `timeout-after-transfer`, scrub to the second payment | It paid, the call timed out, it paid again. |
| 0:45–0:55 | Toggle **Dummy → Seatbelt**; the same crash, no loss | Same crash. Seatbelt checked the status first. |
| 0:55–1:10 | Scenario Library → `token-metadata-injection`; show the modeled tag and the Dummy loss | A scripted Dummy drained $9,995 by obeying a token’s name. This result is modeled by the agent’s `followsInlineInstructions` flag; there is no LLM recording in this build. |
| 1:10–1:20 | Terminal: `pnpm demo`, then `pnpm airbag run --cmd "node my-agent.js"` | One command. Or point your own agent at it. |
| 1:20–1:30 | End card with the demo URL (when hosted) and repo URL | Which crash should be next? |

## Honesty rules for the recording

- Say **scripted** or **modeled** for Dummy’s injection result. Do not say “a real LLM obeyed”.
- Say **simulated loss**, not “lost funds”.
- Do not show a hosted URL until it exists.
- Do not claim a cassette or LLM score; none is bundled.
- The report card is a real run of the local build; do not hand-animate numbers.

## Screenshots to capture

1. `docs/report-card.png` — the Dummy report at the top (F, simulated loss, radar).
2. `docs/replay.png` — Replay at the second payment, with the violation card visible.
3. `docs/scenario-library.png` — the 21-card library with the modeled tag visible.

The current build’s screenshots live in `artifacts/screens/`; copy the final three into `docs/` before
recording. `docs/report-card.png` is referenced by the README.

## Developer UI checks

These are manual tools, not part of `pnpm verify`:

- `pnpm tsx scripts/screenshot.ts` — captures the six routes and a mobile report from a local
  preview server (`pnpm --filter @airbag/web preview --port 4321`).
- `pnpm tsx scripts/interact.ts` — presses Crash, opens the report, skips to the crash and opens a
  YAML drawer; fails loudly if the page throws.
- `pnpm tsx scripts/share-check.ts` — copies a share link, opens it, toggles Dummy → Seatbelt and
  runs the suite through the `?auto=naive` route.

All three use the installed Chrome via Playwright-core and a preview server on a local port.

