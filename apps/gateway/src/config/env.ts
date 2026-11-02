/**
 * Validated configuration. The process refuses to start if anything is missing or unsafe.
 * Error output lists variable NAMES only, never values, so secrets can't leak into logs.
 */
import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const csv = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((s) => s.split(",").map((part) => part.trim()).filter(Boolean));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    TRUST_PROXY: bool.default(false),

    ALLOWED_ORIGINS: csv("http://localhost:3000"),
    TICKET_SECRET: z.string().min(32, "must be at least 32 characters"),
    TICKET_ISSUER: z.string().default("lct-web"),
    TICKET_AUDIENCE: z.string().default("lct-gateway"),

    STT_PROVIDER: z.enum(["elevenlabs", "mock"]).default("elevenlabs"),
    TRANSLATION_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
    TTS_PROVIDER: z.enum(["elevenlabs", "mock"]).default("elevenlabs"),

    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_STT_MODEL: z.string().default("scribe_v2_realtime"),
    ELEVENLABS_TTS_MODEL: z.string().default("eleven_flash_v2_5"),
    ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),
    STT_SECONDARY_LANGUAGES: csv("en").pipe(z.array(z.enum(["ur", "en"]))),
    VAD_SILENCE_SECS: z.coerce.number().min(0.3).max(3).default(0.7),

    ANTHROPIC_API_KEY: z.string().optional(),
    TRANSLATION_MODEL: z.string().default("claude-haiku-5-5"),

    DAILY_MINUTES_QUOTA: z.coerce.number().int().positive().default(120),
    MAX_SESSION_MINUTES: z.coerce.number().int().positive().default(60),
  })
  .superRefine((env, ctx) => {
    const requireIf = (key: keyof typeof env, condition: boolean) => {
      if (condition && !env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: "is required for the selected provider" });
      }
    };
    requireIf("ELEVENLABS_API_KEY", env.STT_PROVIDER === "elevenlabs" || env.TTS_PROVIDER === "elevenlabs");
    requireIf("ELEVENLABS_DEFAULT_VOICE_ID", env.TTS_PROVIDER === "elevenlabs");
    requireIf("ANTHROPIC_API_KEY", env.TRANSLATION_PROVIDER === "anthropic");

    if (env.NODE_ENV === "production") {
      if ([env.STT_PROVIDER, env.TRANSLATION_PROVIDER, env.TTS_PROVIDER].includes("mock")) {
        ctx.addIssue({ code: "custom", path: ["STT_PROVIDER"], message: "mock providers are not allowed in production" });
      }
      if (env.ALLOWED_ORIGINS.some((origin) => !origin.startsWith("https://"))) {
        ctx.addIssue({ code: "custom", path: ["ALLOWED_ORIGINS"], message: "must contain only https:// origins in production" });
      }
    }
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid gateway configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
