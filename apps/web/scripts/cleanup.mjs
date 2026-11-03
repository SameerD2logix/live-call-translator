/**
 * Daily housekeeping (data minimisation): deletes records that have no further use.
 *   - expired sessions and expired verification/reset tokens (Better Auth tables)
 *   - Better Auth rate-limit rows and our own app_rate_limit rows older than a day
 * Consent records, voices and glossaries are kept while the account exists.
 *
 * Run once a day, e.g. a Render/Railway cron job or a scheduled GitHub Action:
 *   node apps/web/scripts/cleanup.mjs      (needs DATABASE_URL)
 * Better Auth's column names are checked first, so a schema change can't make this fail midway.
 */
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {
  // use the real environment
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

/** The column's SQL type, or null if the table/column doesn't exist. */
async function columnType(table, column) {
  const { rows } = await client.query(
    "SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
    [table, column],
  );
  return rows[0]?.data_type ?? null;
}

/** Runs the SQL for this column's type (or skips if absent); reports how many rows were removed. */
async function purge(label, table, column, sqlFor) {
  const type = await columnType(table, column);
  const sql = type ? sqlFor(type) : null;
  if (!sql) {
    console.log(`skip ${label}: ${table}.${column} ${type ? `has unexpected type ${type}` : "not found"}`);
    return;
  }
  const { rowCount } = await client.query(sql);
  console.log(`${label}: removed ${rowCount ?? 0}`);
}

const isTimestamp = (type) => type.startsWith("timestamp");
const isNumber = (type) => ["bigint", "integer", "numeric", "double precision"].includes(type);

try {
  await purge("expired sessions", "session", "expiresAt", (type) =>
    isTimestamp(type) ? `DELETE FROM "session" WHERE "expiresAt" < now()` : null,
  );
  await purge("expired verification tokens", "verification", "expiresAt", (type) =>
    isTimestamp(type) ? `DELETE FROM "verification" WHERE "expiresAt" < now()` : null,
  );
  // Better Auth has stored lastRequest as epoch milliseconds; handle a timestamp too.
  await purge("old auth rate-limit rows", "rateLimit", "lastRequest", (type) =>
    isNumber(type)
      ? `DELETE FROM "rateLimit" WHERE "lastRequest" < (extract(epoch from now() - interval '1 day') * 1000)`
      : isTimestamp(type)
        ? `DELETE FROM "rateLimit" WHERE "lastRequest" < now() - interval '1 day'`
        : null,
  );
  await purge("old app rate-limit rows", "app_rate_limit", "window_start", (type) =>
    isTimestamp(type) ? `DELETE FROM app_rate_limit WHERE window_start < now() - interval '1 day'` : null,
  );
} finally {
  await client.end();
}
