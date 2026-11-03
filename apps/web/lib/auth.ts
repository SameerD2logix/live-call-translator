/**
 * Authentication: Better Auth with our own Postgres (users never leave our database).
 *
 *  - Email + password, hashed with Argon2id (OWASP baseline parameters)
 *  - Email verification required before the first session
 *  - Optional two-factor sign-in (authenticator app + one-time backup codes)
 *  - Passwords checked against known breaches (Have I Been Pwned, k-anonymity: only the
 *    first 5 characters of the password's SHA-1 hash leave the server)
 *  - Rate limits on sign-in, sign-up, reset and 2FA, stored in the database so they hold
 *    across serverless instances
 *  - Account deletion first deletes the cloned voice at the provider
 *
 * Imports here are relative on purpose: the Better Auth CLI loads this file to run migrations.
 */
import { hash, verify, type Options as Argon2Options } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { after } from "next/server";
import { pool } from "./db";
import { emails, sendEmail } from "./email";
import { serverEnv } from "./env.server";

const env = serverEnv();

// Argon2id (the library's default algorithm) with OWASP's baseline: 19 MiB, 2 passes, 1 lane.
const ARGON2: Argon2Options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Send after the response is out: no added latency, and no timing hint about whether an account exists. */
function sendLater(email: Parameters<typeof sendEmail>[0]): void {
  after(() => sendEmail(email).catch((err: unknown) => console.error("email send failed:", err instanceof Error ? err.message : "unknown")));
}

export const auth = betterAuth({
  appName: "Live Call Translator",
  baseURL: env.APP_ORIGIN,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_ORIGIN],
  database: pool,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 30 * 60,
    password: {
      hash: (password) => hash(password, ARGON2),
      verify: ({ hash: stored, password }) => verify(stored, password),
    },
    sendResetPassword: async ({ user, url }) => sendLater(emails.resetPassword(user.email, url)),
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => sendLater(emails.verify(user.email, url)),
  },

  user: {
    deleteUser: {
      enabled: true, // the client must send the current password
      beforeDelete: async (user) => {
        // Delete the clone at the provider BEFORE the account. If that fails, this throws and
        // the account stays, so we never leave an orphaned copy of someone's voice behind.
        const { deleteVoiceForUser } = await import("./voice/service");
        await deleteVoiceForUser(user.id);
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    freshAge: 60 * 15, // sensitive actions need a sign-in within the last 15 minutes
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 300, max: 5 },
      "/sign-up/email": { window: 3600, max: 5 },
      "/request-password-reset": { window: 3600, max: 3 },
      "/forget-password": { window: 3600, max: 3 },
      "/two-factor/verify-totp": { window: 300, max: 5 },
      "/two-factor/verify-backup-code": { window: 300, max: 5 },
      "/delete-user": { window: 3600, max: 5 },
    },
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },

  plugins: [
    twoFactor({ issuer: "Live Call Translator" }),
    haveIBeenPwned(),
    nextCookies(), // must stay last: lets server actions set auth cookies
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
