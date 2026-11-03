/**
 * Database migrations, in order:
 *   1. Better Auth's own tables, via its CLI (reads lib/auth.ts, including the 2FA plugin).
 *   2. Our tables: every db/migrations/*.sql file not yet recorded in app_migration,
 *      each in its own transaction.
 * Usage (from apps/web): pnpm db:migrate     — reads .env.local if present.
 */
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the real environment (CI, hosting provider).
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

console.log("1/2 Better Auth tables");
const cli = spawnSync("pnpm", ["dlx", "@better-auth/cli@1", "migrate", "--config", "lib/auth.ts", "--yes"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
if (cli.status !== 0) process.exit(cli.status ?? 1);

console.log("2/2 App tables");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS app_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const applied = new Set((await client.query("SELECT name FROM app_migration")).rows.map((r) => r.name));
  const dir = new URL("../db/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(new URL(file, dir), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO app_migration (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  console.log("Done.");
} finally {
  await client.end();
}
