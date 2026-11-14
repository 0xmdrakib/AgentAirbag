# Documentation map

Start with the [project README](../README.md). Machine-readable indexes: [`llms.txt`](../llms.txt)
and [`llms-full.txt`](../llms-full.txt).

## Understand the product

| Document | What it answers |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How a run works: lifecycle, determinism, money model, judge invariants, sandbox routes |
| [SCENARIOS.md](SCENARIOS.md) | All 21 crashes: story, injected fault, judge rule, fix |
| [FACTS.md](FACTS.md) | Grades, losses and counts, generated from code |
| [CLAIMS.md](CLAIMS.md) | Every public claim and the command that proves it |
| [VERIFIED_FACTS.md](VERIFIED_FACTS.md) | What was checked against live NEAR Intents responses, and when |

## Run and deploy

| Document | What it answers |
| --- | --- |
| [DEPLOY.md](DEPLOY.md) | Static hosting, the Node API, Neon, wallet connect, environment variables |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | A two-minute walkthrough for a screen recording |

## Process records

| Document | What it is |
| --- | --- |
| [../DECISIONS.md](../DECISIONS.md) | Non-obvious choices, with alternatives and reasons |
| [../BUILD_LOG.md](../BUILD_LOG.md) | Timeline of the build |
| [MASTER_PROMPT.md](MASTER_PROMPT.md) | The original build brief, saved verbatim (it uses the working name Crumple) |
| [HACKATHON.md](HACKATHON.md) | The organizers' instructions this project followed |
| [SUBMISSION.md](SUBMISSION.md) | The submission checklist and the draft payload fields |

## Images

`docs/images/` holds the README screenshots. Regenerate them with `pnpm screenshots` while
`pnpm demo` is running.
