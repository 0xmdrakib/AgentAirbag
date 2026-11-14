-- Airbag accounts, sessions and saved crash-test runs.
-- Idempotent: db:migrate and the API bootstrap both run this file.

CREATE TABLE IF NOT EXISTS users (
  id bigserial PRIMARY KEY,
  account_id text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  grade text NOT NULL,
  score numeric NOT NULL,
  loss_usd text NOT NULL,
  passed int NOT NULL,
  failed int NOT NULL,
  report jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions (account_id);

CREATE INDEX IF NOT EXISTS runs_account_created_idx ON runs (account_id, created_at DESC);
