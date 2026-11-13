# Verified facts

Fact, source, date, how verified. Live behavior wins over the prompt when they disagree.

## Hackathon

| Fact | Source | Date | How verified |
| --- | --- | --- | --- |
| Development ends and the repo must be public by **2026-11-14T23:59:00Z** | `https://nearhackathon.com/HACKATHON.md` | 2026-11-13 | Re-fetched; line 9 and the dates table |
| Judging 16–18 Nov; results by 2026-11-18T23:59Z | HACKATHON.md | 2026-11-13 | Re-fetched |
| Submission is `POST https://nearhackathon.com/api/applications`, max 12,000 bytes | HACKATHON.md | 2026-11-13 | Re-fetched; API section |
| Fields: `requestId`, `projectName`, `leadName`, `email`, `size`, `tracks`, `nearAddress`, `projectUrl`, `demoUrl`, `idea`, `consent` | HACKATHON.md | 2026-11-13 | Re-fetched; request table |
| `size` is exactly `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` | HACKATHON.md | 2026-11-13 | Re-fetched |
| Consent text: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” | HACKATHON.md | 2026-11-13 | Re-fetched; read verbatim before submitting |
| Track IDs `security` and `open` | HACKATHON.md / prompt section 3 | 2026-11-13 | Re-fetched; track list |
| A coding agent may file, only with the human’s explicit confirmation at each irreversible step | HACKATHON.md | 2026-11-13 | Re-fetched |
| Response codes 201 / 400 / 403 / 409 / 413 / 503; fixes via `/request-changes` | HACKATHON.md | 2026-11-13 | Re-fetched |
| README must be machine-readable, show what was built in the window, list libraries/templates, include a LICENSE, and stay public through judging | HACKATHON.md | 2026-11-13 | Re-fetched |

## 1Click API (live)

| Fact | Source | Date | How verified |
| --- | --- | --- | --- |
| Base URL is `https://1click.chaindefuser.com` | `https://docs.near-intents.org/near-intents/1click-api` | 2026-11-13 | `GET /v0/tokens` returned 200 |
| `GET /v0/tokens` returns an array; object fields include `assetId`, `decimals`, `blockchain`, `symbol`, `price`, `priceUpdatedAt`, `contractAddress`, `coingeckoId` | Live response | 2026-11-13 19:14 UTC | Saved `fixtures/tokens.snapshot.json` (58,875 bytes) |
| Base USDC is `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near`, 6 decimals, price 0.999546 | Live token list | 2026-11-13 | Saved snapshot |
| NEAR wNEAR is `nep141:wrap.near`, 24 decimals, price 3.54 | Live token list | 2026-11-13 | Saved snapshot |
| Base cbBTC is `nep141:base-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near`, 8 decimals | Live token list | 2026-11-13 | Saved snapshot |
| `POST /v0/quote` with `dry: true` returns 201; top level `quote`, `quoteRequest`, `signature`, `timestamp`, `correlationId` | Live response | 2026-11-13 19:15 UTC | Saved `fixtures/quotes.snapshot.json` |
| A dry quote has **no** `depositAddress`, `deadline` or `timeWhenInactive`; `timeEstimate` is **35** (likely seconds; the docs do not state the unit) | Live response | 2026-11-13 | Observed; recorded as unverified unit |
| `quote` includes `refundFee: "2400"`, `withdrawFee: "0"`, `minAmountIn`, `amountOut`, `minAmountOut`, `amountInUsd`, `amountOutUsd` | Live response | 2026-11-13 | Saved snapshot |
| `quoteRequest` echo adds `confidentiality: "public"`, `insured: false`, `quoteWaitingTimeMs: 0`, and an `appFees` entry with `recipient` and `fee: 20` | Live response | 2026-11-13 | Saved snapshot |
| A malformed quote (missing recipient) returns **400 with an empty body** | Live request | 2026-11-13 | `Invoke-WebRequest`; body empty |
| An unsupported asset returns **400 with an empty body** | Live request | 2026-11-13 | Body empty |
| `GET /v0/status?depositAddress=<made-up>` returns **404 with an empty body** | Live request | 2026-11-13 | Body empty |
| A request without a bearer token succeeds | Live request | 2026-11-13 | No `Authorization` header sent |
| `KNOWN_DEPOSIT_TX` appears in documented example responses but not the documented status list | 1Click docs | 2026-11-13 | Read the docs; supported and marked undocumented |
| JWT fee discrepancy: docs page says 0.1%, HACKATHON.md says no JWT means 0.2% | Docs + HACKATHON.md | 2026-11-13 | Not resolved; irrelevant because Airbag never executes a real swap |

## NEAR AI Cloud

| Fact | Source | Date | How verified |
| --- | --- | --- | --- |
| Base URL `https://cloud-api.near.ai/v1`, OpenAI-compatible, model list at `/v1/model/list` | Prompt and NEAR AI docs | 2026-11-13 | **Unverified live**: no `NEARAI_API_KEY` was available |
| A tool-calling model must be selected | Prompt | 2026-11-13 | Adapter reads `AIRBAG_MODEL` or the model list at runtime |
| Attestation/signature endpoints | Prompt | 2026-11-13 | **Unverified**; P2 not shipped |
| LLM cassette recording | Adapter code | 2026-11-14 | Implemented; **no live recording** because there is no key |

## Name and prior art

| Fact | Source | Date | How verified |
| --- | --- | --- | --- |
| “Crumple” is already a crash-test product for AI coding agents | `https://crumple.priberry.com/` | 2026-11-14 | Web search; page reads “the crash test for AI coding agents” |
| `npm view crumple` is an unrelated WebGL delete animation | npm | 2026-11-14 | `npm view crumple` |
| `npm view airbag` is an unrelated execution-orchestration library; no direct money-agent crash test found | npm + search | 2026-11-14 | Name check; fallback chosen |
| Closest money-agent work: AttackBench, Argus, Agent Money Benchmark | Prompt + web search | 2026-11-14 | Compared in README |

## Toolchain and environment

| Fact | Source | Date | How verified |
| --- | --- | --- | --- |
| Node 24.14.1 | Local shell | 2026-11-13 | `node -v` |
| pnpm 9.15.9 | Local shell | 2026-11-13 | Installed with npm after `corepack enable` hit EPERM |
| git 2.53.0 | Local shell | 2026-11-13 | `git --version` |
| Chrome and Edge are installed; Playwright-core uses Chrome for screenshots | Local shell | 2026-11-14 | Paths checked; screenshots generated |
| Docker availability | — | 2026-11-13 | **Unverified**; the clean-clone test uses a temp directory, not Docker |
| Hosting account | — | 2026-11-14 | **None available**; static build ready, no hosted URL |
| Time left at Phase 0 | 2026-11-13 19:15 UTC | 2026-11-13 | Deadline 2026-11-14 23:59 UTC → ~28.7 hours |

## Discrepancies

1. **Dry quote shape:** the prompt documents `depositAddress`, `deadline` and `timeWhenInactive` on
   quotes; the live dry quote omits all three. The sandbox omits them for dry quotes and includes
   them for wet quotes. `timeEstimate` is 35, not a time in milliseconds.
2. **Error bodies:** the prompt says to copy the real error body shape; the real 400/404 responses
   had empty bodies. The sandbox returns empty bodies for those, and uses a modeled JSON 500 only
   inside scenario 5.2.
3. **JWT fee:** 0.1% (docs page) vs 0.2% (HACKATHON.md). Irrelevant here; no real swap.
4. **Refund fee:** the live quote returns `refundFee: "2400"` while the sandbox models a 1% refund
   penalty for the late-deposit scenarios. The difference is labeled `modeled`.
5. **Name:** the prompt’s working name was taken; Airbag is the shipped name.
6. **Definition-of-done item 3:** no LLM cassette is bundled because no key was available. The code
   ships, but the claim is not made.
7. **Definition-of-done item 4:** no hosted demo is deployed because no hosting account was
   available. The static build and config are ready.
