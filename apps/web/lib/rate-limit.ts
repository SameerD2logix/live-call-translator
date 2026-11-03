import "server-only";
import { pool } from "@/lib/db";
import { securityEvent } from "@/lib/security-log";

/**
 * Fixed-window limit, one atomic statement (safe under concurrency and across instances).
 * Returns true if the call is allowed. Fails CLOSED: if the database can't be reached the
 * request is refused, since every route using this also needs the database anyway.
 */
export async function allow(key: string, limit: number, windowSeconds: number, route: string): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO app_rate_limit (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count        = CASE WHEN app_rate_limit.window_start < now() - make_interval(secs => $2) THEN 1 ELSE app_rate_limit.count + 1 END,
       window_start = CASE WHEN app_rate_limit.window_start < now() - make_interval(secs => $2) THEN now() ELSE app_rate_limit.window_start END
     RETURNING count`,
    [key, windowSeconds],
  );
  const allowed = (rows[0]?.count ?? Infinity) <= limit;
  if (!allowed) securityEvent("rate_limited", { route, userId: key.split(":")[1] });
  return allowed;
}
