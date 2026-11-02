/**
 * Structured JSON logger.
 *
 * RULE: never pass audio, transcripts, translations, tickets or API keys to the logger.
 * Log ids, counts, durations and error codes only. The redact list is a safety net,
 * not permission to log sensitive objects.
 */
import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "lct-gateway" },
  redact: {
    paths: [
      "text",
      "*.text",
      "ticket",
      "*.ticket",
      "apiKey",
      "*.apiKey",
      "audio",
      "*.audio",
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["xi-api-key"]',
      'req.headers["x-api-key"]',
    ],
    censor: "[redacted]",
  },
});
