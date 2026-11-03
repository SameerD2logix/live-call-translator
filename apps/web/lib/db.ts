/**
 * One Postgres pool per server process (reused across hot reloads in development).
 * Every query in this app is parameterised ($1, $2…): never build SQL from strings.
 * For managed Postgres, put ?sslmode=require (or verify-full) in DATABASE_URL.
 */
import { Pool } from "pg";
import { serverEnv } from "./env.server";

const globalForDb = globalThis as unknown as { lctPool?: Pool };

export const pool =
  globalForDb.lctPool ??
  new Pool({
    connectionString: serverEnv().DATABASE_URL,
    max: 5, // serverless-friendly; raise on a long-running server
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.lctPool = pool;
