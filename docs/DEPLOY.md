# Deploy and local setup

This page covers the optional wallet and database path. The simulator, report card and replay work
without a wallet, an account, a database or any API keys.

## What runs where

- **Static app:** `apps/web/dist`. Routes are real paths (`/report`, `/replay/<id>`), so the host must
  serve `index.html` for unknown paths. `vercel.json` already does; see "Single page app fallback" below.
- **API:** `packages/server/src/api.ts` exports `createApiApp()`, a Hono app mounted at `/api`. It
  handles wallet sessions and saved runs.
- **Local demo:** `scripts/demo.ts` serves the static app and proxies `/api` to a second port on
  `127.0.0.1`, so browser cookies stay on one origin.
- **Vercel:** the static app plus the API as one serverless function on the same origin. See
  [Vercel with the API](#vercel-with-the-api) below.

## Run locally with wallet and Neon

Prerequisites: Node 22 or newer and pnpm 9 or newer.

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Create a Neon database. See [Create a Neon database](#create-a-neon-database).

3. Put the settings in `.env.local` at the repository root. `pnpm demo` loads `.env.local` and then
   `.env`; variables already set in the shell take precedence.

   ```dotenv
   DATABASE_URL=postgresql://user:password@your-neon-host/airbag?sslmode=require
   NEAR_NETWORK=testnet
   AIRBAG_ALLOWED_ORIGIN=http://localhost:4321
   AIRBAG_DATA_DIR=.data
   VITE_NEAR_NETWORK=testnet
   ```

   `.env.local` and `.env` are gitignored. Never commit a real connection string.

4. Run the migration against that database.

   ```bash
   pnpm db:migrate
   ```

5. Build the web app with the matching NEAR network, then start the demo.

   ```bash
   pnpm --filter @airbag/web build
   pnpm demo
   ```

   `VITE_NEAR_NETWORK` is read at build time. Rebuild the web app after changing it. `pnpm demo` only
   builds the web app when `apps/web/dist/index.html` is missing.

6. Open the printed URL and use the wallet connect flow. Use `testnet` for wallet testing. The
   sandbox never moves real funds.

`AIRBAG_ALLOWED_ORIGIN` must match the origin in the browser address bar exactly, with no trailing
slash. The demo normally prints `http://localhost:4321`. If that port is busy and the demo picks
another port, update this value before starting it.

## Environment variables

| Variable                | Read by                | Example                                                  | Purpose                                                                          |
| ----------------------- | ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`          | API runtime, migration | `postgresql://user:password@host/airbag?sslmode=require` | Neon Postgres connection string.                                                 |
| `NEAR_NETWORK`          | API runtime            | `testnet` or `mainnet`                                   | Network reported by `GET /api/health`. Keep it aligned with `VITE_NEAR_NETWORK`. |
| `AIRBAG_ALLOWED_ORIGIN` | API runtime            | `http://localhost:4321`                                  | Exact browser origin allowed to call the API.                                    |
| `AIRBAG_AUTH_RECIPIENT` | API runtime            | `agentairbag.xyz`                                        | Recipient signed in the wallet message. Empty uses the request host.             |
| `NEAR_RPC_URL`          | API runtime            | `https://rpc.testnet.near.org`                           | Optional. NEAR JSON-RPC endpoint for the access key check. Empty uses the public RPC for `NEAR_NETWORK`. |
| `AIRBAG_DATA_DIR`       | API runtime            | `.data`                                                  | Directory for the local JSON store when `DATABASE_URL` is unset.                 |
| `VITE_NEAR_NETWORK`     | Web build              | `testnet` or `mainnet`                                   | Network compiled into the browser app. Keep it equal to `NEAR_NETWORK`.          |

## Access key ownership check

A NEP-413 signature only proves the caller holds some private key. So after the signature is valid
and before a session is created, `POST /api/auth/verify` checks that the public key is an access key
of the account:

- **Implicit accounts** (64 lowercase hex characters) are owned by the ed25519 key whose bytes spell
  the account id. No network call is made.
- **Named accounts** are checked with the NEAR JSON-RPC `query` method (`view_access_key`,
  `finality: final`). Full access keys and function-call keys both count. The RPC is
  `https://rpc.mainnet.near.org` when `NEAR_NETWORK=mainnet` and `https://rpc.testnet.near.org`
  otherwise; set `NEAR_RPC_URL` (a plain URL, not a secret) to use another endpoint.
- **A key that is not on the account** gets `401`. **An RPC that cannot be reached, times out after
  8 seconds or sends an unreadable reply** gets `503` and no session: the check fails closed.

The check needs outbound HTTPS from the API to the RPC. Tests replace it with a stub and never touch
the network.

## Create a Neon database

1. Sign in at [neon.tech](https://neon.tech) and create a project. Pick a region close to you.
2. In the project dashboard, open **Connect** and copy the pooled connection string.
3. Keep `sslmode=require` in the string and use it as `DATABASE_URL`.
4. Run `pnpm db:migrate` once to create the tables.
5. Start the demo with `pnpm demo`.

If the connection string is printed in a terminal or a log, rotate the database password in Neon.

## Migrations

```bash
pnpm db:migrate
```

The command reads `DATABASE_URL` and applies `db/schema.sql` through `scripts/db-migrate.ts`. Run it
once per database, and again after pulling changes that add a migration. The API also applies the
same schema on first database use, so the migration is a preflight that surfaces connection or
permission errors before the demo. Without `DATABASE_URL` there is nothing to migrate.

## Without DATABASE_URL

The API uses a local JSON store instead of Postgres. Set `AIRBAG_DATA_DIR` to choose the directory;
`.data` is a good local choice and is gitignored. Wallet connect and saved runs still work on that
machine, but the data is local to that directory and is not shared with another host.

Delete the directory to reset the local data.

## Vercel with the API

This is how it is set up. It is a description of the configuration, not a statement that a given
deployment is live.

- **The function.** `api/index.js` is a single self-contained ESM bundle of
  `packages/server/src/vercel.ts` (the Hono app from `createApiApp()`), built by esbuild. Regenerate
  it with `pnpm build:api` after changing `packages/server`, `packages/core` or `db/schema.sql`.
  It is committed on purpose, because Vercel detects functions from the repository, not from build
  output. `pnpm build:api --check` (part of `pnpm verify`) fails if the committed file is stale.
- **The static app.** `pnpm build` writes `apps/web/dist`, which Vercel serves as before.
- **The rewrite.** `vercel.json` sends every path except `/api/...` to `/index.html`, so API paths
  reach the function instead of the app shell. Files that exist still win.
- **The schema file.** `vercel.json` ships `db/schema.sql` with the function (`includeFiles`). The
  function applies it on the first request that touches the database, so no separate migration is
  needed there; `pnpm db:migrate` remains a useful preflight.
- **Nonces.** With `DATABASE_URL` set, sign-in nonces are stored in the `auth_nonces` table and
  consumed atomically, because the instance that issues a nonce may not be the one that verifies it.
  Without `DATABASE_URL` the API falls back to the local JSON store and an in-memory nonce map, which
  is only suitable for a single process and is not a serverless setup.

Set these in the Vercel project settings (Production). Nothing in the repository contains a value.

| Variable                | Needed | Purpose                                                                        |
| ----------------------- | ------ | ------------------------------------------------------------------------------ |
| `DATABASE_URL`          | yes    | Neon Postgres connection string; sessions, runs and nonces live here.          |
| `NEAR_NETWORK`          | no     | Network reported by `GET /api/health`. Empty means `testnet`.                  |
| `VITE_NEAR_NETWORK`     | no     | Network compiled into the web app at build time. Keep equal to `NEAR_NETWORK`. |
| `AIRBAG_ALLOWED_ORIGIN` | no     | Exact public origin, for example `https://agentairbag.xyz`. Same origin works without it. |
| `AIRBAG_AUTH_RECIPIENT` | no     | Recipient signed in the wallet message. Empty uses the request host.           |
| `NEAR_RPC_URL`          | no     | NEAR RPC endpoint for the key ownership check. Empty uses the public RPC.      |

Check it after a deploy with `GET /api/health`, which reports `"db": "neon"` when `DATABASE_URL` is
read.

## Node host path

To run wallet connect and saved runs in production, serve the static app and the API on one origin:

- Run a Node 22 process that serves `apps/web/dist` and forwards `/api` to the Hono app, or put the
  static files and the API behind one reverse proxy on the same hostname.
- Set the runtime variables from the table above on that host.
- Run `pnpm db:migrate` once against the production database.
- Use HTTPS. Set `AIRBAG_ALLOWED_ORIGIN` to the public HTTPS origin.

`scripts/demo.ts` is a local demo, not a production server. It binds to `127.0.0.1` and has no TLS,
process supervision or hardening for public traffic. Use it as the reference for the two-port split,
not as the deployment itself.

## Published documents

`pnpm build` runs `pnpm build:site`, which copies the documents listed in `scripts/site-files.ts` into `apps/web/public` (generated and gitignored), so the site serves `/llms.txt`, `/llms-full.txt`, `/AGENTS.md`, `/README.md`, `/docs/*.md`, `/fixtures/report.*.json`, `/examples/http-agent.mjs` and `/data/scenarios.yaml` as real files. Relative links inside the copied Markdown are rewritten to absolute URLs. `vercel.json` sets the content types and CORS. A missing path with a file extension returns 404 instead of the app shell. `pnpm check:site` verifies the build, and `pnpm check:site https://agentairbag.xyz/` verifies the live site.

## Single page app fallback

The app uses clean paths, so opening `/report` directly must return `index.html` and let the app route.

| Host | What to do |
| --- | --- |
| Vercel | Nothing. `vercel.json` rewrites every path except `/api/...` to `/index.html`; real files still win. |
| Cloudflare Pages | Nothing. A project without a top-level `404.html` is treated as a single page app. |
| GitHub Pages | Copy `index.html` to `404.html` in the published folder. Pages serves it for unknown paths. |
| `pnpm demo` | Nothing. The demo server falls back to `index.html`. |

An old `/#/report` address is rewritten to `/report` on load, so early bookmarks still work.

## Project domain

The live site is `https://agentairbag.xyz`. It is a Vercel project named `agentairbag`, connected to
this repository, and every push to `main` deploys it (root directory `./`, build `pnpm build`, output
`apps/web/dist`, from `vercel.json`). The page metadata (`canonical`, `og:url`, `og:image` in
`apps/web/index.html`) already points at that domain.

To move to another host: add the domain there, create the DNS records it asks for, wait for HTTPS,
then open the site logged out. If an API runs on the same origin, set
`AIRBAG_ALLOWED_ORIGIN=https://agentairbag.xyz`. If the hostname changes, update the three metadata
URLs first.

## What is not built

- **No claim that the hosted API is live.** The Vercel function is configured as described above;
  without `DATABASE_URL` it falls back to a process-local store that does not suit serverless. When
  `GET /api/me` returns the app shell instead of JSON, the app disables **Connect wallet**.
- **No production host configuration.** There is no Dockerfile, Terraform, or managed host setup for
  the Node path.
- **No credentials are included.** Neon, wallet and network settings are supplied by the operator.
