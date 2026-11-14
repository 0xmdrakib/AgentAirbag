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
- **Vercel:** static only in this repository. See [Vercel](#vercel) below.

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
| `AIRBAG_DATA_DIR`       | API runtime            | `.data`                                                  | Directory for the local JSON store when `DATABASE_URL` is unset.                 |
| `VITE_NEAR_NETWORK`     | Web build              | `testnet` or `mainnet`                                   | Network compiled into the browser app. Keep it equal to `NEAR_NETWORK`.          |

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

## Vercel

`vercel.json` keeps the static deployment: `pnpm build` writes `apps/web/dist`, and Vercel serves it
with no serverless function.

A same-origin API on Vercel would need two things that are not in this repository:

1. A serverless entry point, for example `api/index.ts`, that adapts `createApiApp()` to the Vercel
   Node handler signature.
2. A rewrite from `/api/*` to that function.

Adding only `functions` or `rewrites` to `vercel.json` cannot create that entry point. This repository
therefore does not configure one, and the Vercel deployment has no API. The simulator, report card
and replay work there. Wallet connect and saving runs do not.

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

## Single page app fallback

The app uses clean paths, so opening `/report` directly must return `index.html` and let the app route.

| Host | What to do |
| --- | --- |
| Vercel | Nothing. `vercel.json` has a rewrite of every path to `/index.html`; real files still win. |
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

- **No hosted API.** The live site is static, so `GET /api/me` returns the app shell and the app
  disables **Connect wallet**. Wallet sign-in and saved runs work only with the Node API.
- **No Vercel function for the API.** The Vercel configuration is static only.
- **No production host configuration.** There is no Dockerfile, Terraform, or managed host setup for
  the Node path.
- **No credentials are included.** Neon, wallet and network settings are supplied by the operator.
