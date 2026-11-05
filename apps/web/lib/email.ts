/**
 * Transactional email (verification, password reset) through Resend's HTTP API.
 * Development without RESEND_API_KEY: the message is printed to the server console so you
 * can click the link. Production without it: env validation refuses to start.
 */
import { serverEnv } from "./env.server";

interface Email {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(email: Email): Promise<void> {
  const env = serverEnv();
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Email provider returned HTTP ${res.status}`);
    return;
  }
  if (process.env.NODE_ENV !== "production" || process.env.STAGING_MODE === "true") {
    // DEVELOPMENT ONLY: links are single-use and short-lived, and this never runs in production.
    // eslint-disable-next-line no-console
    console.info(`\n[dev email] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
    return;
  }
  throw new Error("Email is not configured");
}

export const emails = {
  verify: (to: string, url: string): Email => ({
    to,
    subject: "Confirm your email for Live Call Translator",
    text: `Confirm your email address to finish creating your account:\n\n${url}\n\nThe link works once and expires in 1 hour. If you didn't sign up, ignore this email.`,
  }),
  resetPassword: (to: string, url: string): Email => ({
    to,
    subject: "Reset your Live Call Translator password",
    text: `Use this link to choose a new password:\n\n${url}\n\nThe link works once and expires in 30 minutes. Resetting signs you out everywhere. If you didn't ask for this, ignore this email; your password stays the same.`,
  }),
};
