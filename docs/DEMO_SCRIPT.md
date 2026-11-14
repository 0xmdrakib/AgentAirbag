# Demo script (60–90 seconds)

Record at 1080p / 30 fps, captions burned in (Inter), voice-over optional. **The human records and
posts this.** Everything shown must exist in the local build.

| Time | Shot | Caption |
| --- | --- | --- |
| 0:00–0:05 | Lab hero: headline, **Run the crash suite** and **Test your own agent** buttons, three facts, then the Dummy-vs-Seatbelt proof panel | Two scripted agents, the same 21 crashes: Dummy loses $10,907.04 in simulation. |
| 0:05–0:15 | Lab headline and hero | AI agents swap crypto by themselves. NEAR Intents has no testnet, so they get tested with real money. |
| 0:15–0:30 | Press **Run the crash suite**; the grid fills; grade F lands | Airbag crashes a scripted agent 21 ways. |
| 0:30–0:45 | Replay `timeout-after-transfer`, scrub to the second payment | It paid $99.95, the call timed out, and it paid again. |
| 0:45–0:55 | Toggle **Dummy → Seatbelt**; the same crash, no loss | Same crash. Seatbelt checked the status first. |
| 0:55–1:10 | Scenario Library → `token-metadata-injection`; show the modeled tag and the Dummy loss | A scripted Dummy drained $9,995 by obeying a token’s name. This result is modeled by the agent’s `followsInlineInstructions` flag; there is no LLM recording in this build. |
| 1:10–1:20 | Two terminals: `pnpm demo` in one, `pnpm airbag run --cmd "node examples/http-agent.mjs"` in the other | One command. Or point your own agent at it. |
| 1:20–1:30 | End card with the demo URL (when hosted) and repo URL | Which crash should be next? |

`pnpm demo` blocks on the static server, so the `pnpm airbag run` command needs a second terminal.

## Honesty rules for the recording

- Say **scripted** or **modeled** for Dummy’s injection result. Do not say “a real LLM obeyed”.
- Say **simulated loss**, not “lost funds”.
- Do not show a hosted URL until it exists.
- Do not claim a cassette or LLM score; none is bundled.
- The report card is a real run of the local build; do not hand-animate numbers.

## Screenshots to capture

1. `docs/report-card.png`: the Dummy report at the top (F, simulated loss, radar).
2. `docs/replay.png`: Replay at the second payment, with the violation card visible.
3. `docs/scenario-library.png`: the 21-card library with the modeled tag visible.

The screenshots in `docs/` were captured from this build. `docs/report-card.png` is referenced by
the README; `docs/replay.png` shows the second payment; `docs/scenario-library.png` shows the modeled
tag.

## Developer UI checks

These are manual tools, not part of `pnpm verify`. Start a preview server first, then run one:

```bash
pnpm --filter @airbag/web preview --port 4321
# in another shell:
pnpm screenshots      # six routes + mobile report -> artifacts/screens
pnpm ui:interact      # presses Crash, opens the report, skips to the crash, opens YAML
pnpm ui:share         # share link round-trip, Dummy -> Seatbelt toggle, auto-run
pnpm ui:seed          # custom seed -> report card shows it
pnpm ui:audit         # 6 routes x 7 widths (360..1920): overflow, text <12px, tap targets, mobile menu
pnpm ui:sheet '#/report' 390 4          # slice a long page side by side to read it at full size
pnpm ui:devices '#/run'                 # first screen on 10 real viewports (phones, 1024x600, 1366x660 ... 2560)
```

The scripts use `CHROME_PATH` if set, otherwise a local Chrome/Edge path; `AIRBAG_PREVIEW_URL`
overrides `http://localhost:4321/`. They are development tools, not part of the product runtime.

