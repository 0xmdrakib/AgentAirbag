# Submission runbook

**Do not submit, push, go public, post or sign anything without the human’s explicit “yes”.** The
agent may prepare the payload and run the checks; the human sends it.

Deadline: **2026-11-14T23:59:00Z** (Sunday 15 Nov, 05:59 Asia/Dhaka). Target a 201 by 04:30 Dhaka to
leave a retry buffer.

## What only the human does

| When (Dhaka) | Action |
| --- | --- |
| Before the freeze | Create a mainnet NEAR payout account; provide the project name, lead name, email, team size, and hosting choice |
| 02:30 Sun | Record the demo video from `docs/DEMO_SCRIPT.md`; the human records it |
| 03:00 Sun | Say **yes** to making the repo public, then send the public repo URL |
| 03:30 Sun | Post the X thread with the video; send the X post URL |
| 04:00 Sun | Read the printed payload and the consent notice, then say **submit** |
| 04:30 Sun | Target a confirmed 201 |

## Before the human steps

1. `pnpm verify` passes: lint, typecheck, 57 tests, build, demo smoke.
2. `pnpm demo` from a clean checkout prints the report URL within 60 seconds.
3. Run the clean-clone test:
   ```bash
   node scripts/clean-clone-test.mjs
   # or, on Linux/macOS:
   bash scripts/clean-clone-test.sh
   ```
4. Run the honesty audit:
   - Search README/UI for “real”, “on-chain”, “mainnet”, “secure”, “safe”, “certified”, “guarantee”,
     “prevents all”. Justify or remove each.
   - Every number comes from `docs/FACTS.md` or a report file.
   - Every modeled scenario is tagged.
   - No LLM replay is claimed; there is no cassette.
   - No hosted URL is claimed until it exists. `https://agentairbag.xyz` serves the static app over HTTPS and was checked logged out; the demo URL in the form is the X post, not this.
   - The pre-hackathon baseline, every library and every template are disclosed.
5. Tag the final commit `hackathon-submission`. Confirm `pre-hackathon` exists. Add the public diff
   link to the README disclosure when the repo URL exists.
6. The human makes the repo public, then check `gh repo view --json visibility` and an unauthenticated
   README fetch. Check every link and the demo from a logged-out window.

## Payload (placeholders are human-provided; never invent them)

```json
{
  "requestId": "<UUID generated once and reused on retries>",
  "projectName": "Agent Airbag",
  "leadName": "<2–80 chars, from the human>",
  "email": "<max 160 chars, from the human>",
  "size": "1",
  "tracks": ["security", "open"],
  "nearAddress": "<lowercase mainnet NEAR account, from the human>",
  "projectUrl": "<public GitHub repo URL>",
  "demoUrl": "<public X post URL>",
  "idea": "<the field below, 20–2000 chars>",
  "consent": true
}
```

- Allowed `size` values exactly: `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`.
- Send no other fields and never a `website` field (spam trap).
- Body under 12,000 bytes.
- The consent text, read verbatim: **“I agree that the organizers may use these details to review our
  submission and contact us about this hackathon.”**

## “What did you build?” (draft, honest)

Agent Airbag is a crash-test lab for AI agents that move money. NEAR Intents has no testnet, so agent
builders test swap agents with real funds. Airbag replaces the 1Click Swap API with a drop-in sandbox:
change one base URL and the agent runs in a simulated world with a ledger, a virtual clock and no real
funds. We crash it 21 ways across seven laws: pay only what you quoted, never pay twice, respect the
clock, verify never assume, data is not a command, stay inside the limits, always keep an exit. A judge
scores every run from ledger truth, not from what the agent says, and produces a report card with a
safety radar, the simulated loss and a fix for each failure. The repo includes a scripted Dummy and a
hardened Seatbelt agent, Airbag Guard (allow / warn / block policy engine), a browser-only demo and a
CLI for bring-your-own agents. Token prices are a real read-only snapshot; no funds move. The LLM
adapter and cassette recorder target NEAR AI Cloud, but no key was available in the build window, so no
LLM result is claimed. No hosted demo was deployed in the window.

Count this after filling any human fields; keep it under 2,000 characters.

## X thread (the human posts; adapt the URLs and recount to 280)

**Post 1 (video attached):**
This AI agent just lost $99.95. (Simulated.) It paid, the confirmation timed out, and it paid again.
Cars get crash-tested before they hit the road. AI agents that move money are not. So I built Agent Airbag at
NEAR HACKATHON. @NEARProtocol #NEARHackathon

**Post 2:**
Agent Airbag is a fake NEAR Intents. Change one base URL and your agent runs in a simulated world with a
ledger and a clock. Then we crash it 21 ways across 7 laws: pay only what you quoted, never pay twice,
respect the clock, verify, do not obey data, stay in limits, keep an exit.

**Post 3:**
Intents has no testnet, so people test with real money. Airbag mirrors the 1Click API, uses a real
token/price snapshot and a read-only dry run, and ships an LLM adapter for NEAR AI Cloud. Same code,
zero funds. No LLM replay is claimed; the Dummy is labelled modeled.

**Post 4:**
Try the local demo: <repo or demo URL>. Code: <repo URL>. A question for builders: which failure
should be crash number 22?

## Response handling

| Status | Action |
| --- | --- |
| 201 | Saved. Record the time. Stop. Do not resubmit. |
| 400 | Fix the fields listed in `fields`, resend with the same `requestId`. |
| 403 | Stop and tell the human. Do not retry. |
| 409 | Already submitted or the email limit was reached. Ask the human; change neither the link nor the email. |
| 413 | Shorten the text, resend with the same `requestId`. |
| 503 | Wait a minute, resend with the same `requestId`. |

After 201: keep the repo public through judging and any hosted demo up through 25 Nov. Fixes go through
`https://nearhackathon.com/request-changes`, entered by the human. As a safe default, make no further
commits to the submitted branch; use a separate branch for later work.
