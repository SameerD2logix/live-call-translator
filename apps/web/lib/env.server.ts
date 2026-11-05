/**
 * Validated server-side settings. Throws with variable NAMES (never values) if misconfigured.
 *
 * This module deliberately doesn't import "server-only": the Better Auth CLI loads lib/auth.ts
 * (and therefore this file) in plain Node to run migrations. Nothing here is a secret by itself;
 * it only reads process.env, which Next.js never exposes to the browser without NEXT_PUBLIC_.
 */
import { z } from "zod";

const secret = z.string().min(32, "must be at least 32 characters");
const isProd = process.env.NODE_ENV === "production";

const ServerEnv = z
  .object({
    APP_ORIGIN: z.url().refine((v) => new URL(v).origin === v, "must be an origin only, e.g. https://app.example.com"),
    DATABASE_URL: z.string().startsWith("postgres", "must be a postgres:// connection string"),
    BETTER_AUTH_SECRET: secret,
    GATEWAY_PUBLIC_URL: z.url(),
    GATEWAY_INTERNAL_URL: z.url(),
    GATEWAY_TICKET_SECRET: secret,
    INTERNAL_API_SECRET: secret,
    TICKET_ISSUER: z.string().default("lct-web"),
    TICKET_AUDIENCE: z.string().default("lct-gateway"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    // Three different jobs, three different keys: one leak must not unlock the others.
    const secrets = [env.BETTER_AUTH_SECRET, env.GATEWAY_TICKET_SECRET, env.INTERNAL_API_SECRET];
    if (new Set(secrets).size !== secrets.length) issue("INTERNAL_API_SECRET", "all three secrets must be different");

    if (!isProd) return;
    if (!env.APP_ORIGIN.startsWith("https://")) issue("APP_ORIGIN", "must use https:// in production");
    if (!env.GATEWAY_PUBLIC_URL.startsWith("wss://")) issue("GATEWAY_PUBLIC_URL", "must use wss:// in production");
    if (!env.GATEWAY_INTERNAL_URL.startsWith("https://")) issue("GATEWAY_INTERNAL_URL", "must use https:// in production");
    // Staging only (no email provider yet): emails are written to the server log instead.
    if (process.env.STAGING_MODE === "true") return;
    if (!env.RESEND_API_KEY) issue("RESEND_API_KEY", "is required in production (verification and reset emails)");
    if (!env.EMAIL_FROM) issue("EMAIL_FROM", "is required in production");
  });

export type ServerEnv = z.infer<typeof ServerEnv>;
let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (!cached) {
    // "NAME=" (empty) in .env.local means "not set".
    const defined = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));
    const parsed = ServerEnv.safeParse(defined);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", ");
      throw new Error(`Invalid server environment: ${problems}`);
    }
    cached = parsed.data;
  }
  return cached;
}
