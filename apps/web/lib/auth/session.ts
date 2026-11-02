import "server-only";
import { serverEnv } from "@/lib/env.server";

export interface SessionUser {
  id: string;
}

/**
 * PHASE 1 PLACEHOLDER. Phase 2 replaces this body with Auth.js (email + password, argon2,
 * optional 2FA) backed by Postgres, e.g. `const session = await auth(); return session?.user ?? null`.
 *
 * Until then it returns a fixed development user ONLY when NODE_ENV is not production AND
 * DEV_AUTH_BYPASS=true. In production it always returns null, so a deployed build cannot be
 * used by anyone until real sign-in exists. This is deliberate.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (process.env.NODE_ENV !== "production" && serverEnv().DEV_AUTH_BYPASS === "true") {
    return { id: "dev-user" };
  }
  return null;
}
