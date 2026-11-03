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
    // Signs the web app's server-to-server calls (create/delete voice). Must differ from TICKET_SECRET.
    INTERNAL_API_SECRET: z.string().min(32, "must be at least 32 characters"),

    STT_PROVIDER: z.enum(["elevenlabs", "mock"]).default("elevenlabs"),
    TRANSLATION_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
    // "elevenlabs" = text-to-speech stream (Flash v2.5). "elevenlabs-dialogue" = Text to Dialogue stream,
    // required for the Eleven v4 family (eleven_v4_turbo), which isn't served by the plain TTS endpoint.
    TTS_PROVIDER: z.enum(["elevenlabs", "elevenlabs-dialogue", "mock"]).default("elevenlabs"),
    VOICE_CLONE_PROVIDER: z.enum(["elevenlabs", "mock"]).default("elevenlabs"),

    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_STT_MODEL: z.string().default("scribe_v2_realtime"),
    ELEVENLABS_TTS_MODEL: z.string().default("eleven_flash_v2_5"),
    STT_SECONDARY_LANGUAGES: csv("en").pipe(z.array(z.enum(["ur", "en"]))),
    VAD_SILENCE_SECS: z.coerce.number().min(0.3).max(3).default(0.7),

    // ---- Incoming direction (Phase 3): the client's English → Urdu for you ----
    // English is SVO, so a shorter pause than Urdu usually works.
    INCOMING_VAD_SILENCE_SECS: z.coerce.number().min(0.3).max(3).default(0.6),
    // Optional Urdu voice in your headphones. Flash v2.5 has no Urdu; the Eleven v4 family does.
    INCOMING_TTS_PROVIDER: z.enum(["elevenlabs-dialogue", "mock"]).default("elevenlabs-dialogue"),
    INCOMING_TTS_MODEL: z.string().default("eleven_v4_turbo"),
    // A stock voice from your ElevenLabs library that sounds natural in Urdu. Leave empty to offer
    // subtitles only. Never a clone of the client: we have no consent for that.
    INCOMING_VOICE_ID: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),

    ANTHROPIC_API_KEY: z.string().optional(),
    TRANSLATION_MODEL: z.string().default("claude-haiku-5-5"),

    // Counts audio in BOTH directions: a 60-minute call with subtitles on uses up to 120 minutes.
    DAILY_MINUTES_QUOTA: z.coerce.number().int().positive().default(240),
    MAX_SESSION_MINUTES: z.coerce.number().int().positive().default(60),
  })
  .superRefine((env, ctx) => {
    const requireIf = (key: keyof typeof env, condition: boolean) => {
      if (condition && !env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: "is required for the selected provider" });
      }
    };
    requireIf(
      "ELEVENLABS_API_KEY",
      [env.STT_PROVIDER, env.TTS_PROVIDER, env.VOICE_CLONE_PROVIDER, env.INCOMING_TTS_PROVIDER].some((p) => p.startsWith("elevenlabs")),
    );
    if (env.INTERNAL_API_SECRET === env.TICKET_SECRET) {
      // One leaked key must not unlock both the call socket and voice management.
      ctx.addIssue({ code: "custom", path: ["INTERNAL_API_SECRET"], message: "must be different from TICKET_SECRET" });
    }
    requireIf("ANTHROPIC_API_KEY", env.TRANSLATION_PROVIDER === "anthropic");

    if (env.NODE_ENV === "production") {
      const providers = [env.STT_PROVIDER, env.TRANSLATION_PROVIDER, env.TTS_PROVIDER, env.VOICE_CLONE_PROVIDER, env.INCOMING_TTS_PROVIDER];
      if (providers.includes("mock")) {
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
