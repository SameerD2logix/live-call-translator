-- Fixed-window rate limits for our own API routes (Better Auth limits its own routes separately).
-- Stored in Postgres so limits hold across serverless instances. Old rows are removed by scripts/cleanup.mjs.
CREATE TABLE IF NOT EXISTS app_rate_limit (
  key          text        PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL
);
