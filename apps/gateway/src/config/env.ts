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
    // How many reverse proxies sit in front of the gateway (1 on Render/Railway/Fly). The client IP
    // is taken from that hop, so a client can't fake it with its own X-Forwarded-For. 0 = no proxy.
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    ALLOWED_ORIGINS: csv("http://localhost:3000"),
    TICKET_SECRET: z.string().min(32, "must be at least 32 characters"),
    TICKET_ISSUER: z.string().default("lct-web"),
    TICKET_AUDIENCE: z.string().default("lct-gateway"),
    // Signs the web app's server-to-server calls (create/delete voice). Must differ from TICKET_SECRET.
    INTERNAL_API_SECRET: z.string().min(32, "must be at least 32 characters"),
    // Secret rotation: during a change, put the old value here so tokens already issued keep working.
    TICKET_SECRET_PREVIOUS: z.string().min(32).optional(),
    INTERNAL_API_SECRET_PREVIOUS: z.string().min(32).optional(),

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

    // ---- Accuracy (Phase 4) ----
    // Send the user's glossary to speech recognition as keyterms (ElevenLabs charges ~20% more for that audio).
    STT_USE_KEYTERMS: bool.default(true),
    // Hold a sentence that ends mid-clause (Urdu verb still to come) this long for its ending. 0 = off.
    MERGE_INCOMPLETE_MS: z.coerce.number().int().min(0).max(5000).default(2500),
    // Transcribe each voice-cloning sample and require it to match the sentence it was meant to read.
    VOICE_SCRIPT_CHECK: bool.default(true),

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

    // Staging only: lets a production build run with mock providers until real provider keys exist.
    // Never set this on a live deployment that real users rely on.
    STAGING_MODE: bool.default(false),
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
      if (providers.includes("mock") && !env.STAGING_MODE) {
        ctx.addIssue({ code: "custom", path: ["STT_PROVIDER"], message: "mock providers are not allowed in production" });
      }
      if (env.ALLOWED_ORIGINS.some((origin) => !origin.startsWith("https://"))) {
        ctx.addIssue({ code: "custom", path: ["ALLOWED_ORIGINS"], message: "must contain only https:// origins in production" });
      }
    }
  });

// "NAME=" (empty) in a .env file means "not set", so optional settings fall back to their defaults.
const definedEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));
const parsed = EnvSchema.safeParse(definedEnv);
if (!parsed.success) {
  console.error("Invalid gateway configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
