/**
 * Internal voice API, called only by the web app's server (never by browsers).
 *
 *   POST   /internal/v1/voices            multipart: samples[] (audio), removeBackgroundNoise
 *   DELETE /internal/v1/voices/:voiceId
 *
 * The web app has already checked the session, email verification, consent and its own
 * limits. We re-check everything that matters here (defence in depth): a scoped single-use
 * service token, file count and size, and the real file type from the bytes themselves.
 *
 * Phase 4 recording check: each sample arrives with the sentence it was meant to read
 * (`expected`, from the web app's script). We transcribe every sample and require most of them
 * to match, so someone else's speech (a podcast, a video) can't be cloned through this form.
 * Recordings and transcripts stay in memory; only counts and scores are logged.
 */
import { createHash } from "node:crypto";
import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import {
  AUDIO_FILE_EXTENSION,
  ProviderVoiceId,
  VOICE_SAMPLE_LIMITS,
  sniffAudioContainer,
  type VoiceCloneResult,
} from "@lct/protocol";
import { env } from "../config/env";
import { errorSummary } from "../lib/errors";
import { textSimilarity } from "../lib/text-similarity";
import type { Providers } from "../providers";
import type { VoiceSample } from "../providers/types";
import { verifyInternalToken } from "../security/internal-token";

const CLONE_TIMEOUT_MS = 90_000;
/** A sample "matches" its sentence at this similarity; this share of samples must match. */
const SAMPLE_MATCH = 0.6;
const REQUIRED_MATCH_SHARE = 0.8;
const TRANSCRIBE_CONCURRENCY = 4;

export async function registerVoiceRoutes(app: FastifyInstance, providers: Providers): Promise<void> {
  // Encapsulated: multipart parsing is enabled for these routes only.
  await app.register(async (scope) => {
    await scope.register(multipart, {
      limits: {
        files: VOICE_SAMPLE_LIMITS.maxSamples,
        fileSize: VOICE_SAMPLE_LIMITS.maxSampleBytes,
        fields: VOICE_SAMPLE_LIMITS.maxSamples + 4, // one "expected" sentence per sample + options
        fieldSize: 1024,
        parts: VOICE_SAMPLE_LIMITS.maxSamples * 2 + 4,
        headerPairs: 50,
      },
    });

    scope.post(
      "/internal/v1/voices",
      { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
      async (request, reply) => {
        let userId: string;
        try {
          ({ userId } = await verifyInternalToken(request.headers.authorization, "voice:clone"));
        } catch (err) {
          // A security event worth alerting on if it repeats: someone calling the internal API without a valid token.
          request.log.warn({ err: errorSummary(err), route: "voice:clone" }, "internal token rejected");
          return reply.code(401).send({ error: "unauthorized" });
        }

        const samples: VoiceSample[] = [];
        let totalBytes = 0;
        let removeBackgroundNoise = false;
        let language: "en" | "ur" | null = null;
        const expected: string[] = [];
        try {
          for await (const part of request.parts()) {
            if (part.type === "field") {
              const value = typeof part.value === "string" ? part.value : "";
              if (part.fieldname === "removeBackgroundNoise") removeBackgroundNoise = value === "true";
              else if (part.fieldname === "language" && (value === "en" || value === "ur")) language = value;
              else if (part.fieldname === "expected") expected.push(value.slice(0, 1024));
              continue;
            }
            if (part.fieldname !== "samples") {
              return reply.code(400).send({ error: "unexpected_file" });
            }
            const data = await part.toBuffer(); // throws if the file exceeds the size limit
            const mimeType = sniffAudioContainer(data);
            if (!mimeType) return reply.code(415).send({ error: "unsupported_audio" });
            totalBytes += data.length;
            if (totalBytes > VOICE_SAMPLE_LIMITS.maxTotalBytes) return reply.code(413).send({ error: "too_large" });
            samples.push({ data, mimeType, filename: `sample-${samples.length + 1}.${AUDIO_FILE_EXTENSION[mimeType]}` });
          }
        } catch {
          // Size limits, malformed multipart bodies, client aborts.
          return reply.code(413).send({ error: "invalid_upload" });
        }

        if (samples.length < VOICE_SAMPLE_LIMITS.minSamples) {
          return reply.code(400).send({ error: "not_enough_samples" });
        }

        // ---- Recording check: do the samples read our sentences? ----
        const transcribe = providers.stt.transcribeFile?.bind(providers.stt);
        if (env.VOICE_SCRIPT_CHECK && transcribe) {
          if (!language || expected.length !== samples.length) {
            return reply.code(400).send({ error: "missing_expected_sentences" });
          }
          const lang = language;
          let scores: number[];
          try {
            scores = await mapLimit(samples, TRANSCRIBE_CONCURRENCY, async (sample, i) =>
              textSimilarity(await transcribe(sample, lang, AbortSignal.timeout(CLONE_TIMEOUT_MS)), expected[i] ?? ""),
            );
          } catch (err) {
            request.log.warn({ err: errorSummary(err) }, "sample transcription failed");
            return reply.code(502).send({ error: "provider_unavailable" });
          }
          const matched = scores.filter((score) => score >= SAMPLE_MATCH).length;
          const sorted = [...scores].sort((a, b) => a - b);
          request.log.info(
            { samples: samples.length, matched, median: Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2)) },
            "voice sample check",
          );
          if (matched / samples.length < REQUIRED_MATCH_SHARE) {
            return reply.code(422).send({ error: "script_mismatch" });
          }
        } else if (env.VOICE_SCRIPT_CHECK) {
          request.log.warn({ stt: providers.stt.id }, "voice sample check skipped: provider can't transcribe files");
        }

        try {
          const { providerVoiceId } = await providers.voices.clone(
            { name: providerVoiceName(userId), samples, removeBackgroundNoise },
            AbortSignal.timeout(CLONE_TIMEOUT_MS),
          );
          request.log.info({ samples: samples.length, kib: Math.round(totalBytes / 1024) }, "voice cloned");
          const body: VoiceCloneResult = { provider: providers.voices.id, providerVoiceId };
          return reply.code(201).send(body);
        } catch (err) {
          request.log.warn({ err: errorSummary(err) }, "voice cloning failed");
          return reply.code(502).send({ error: "provider_unavailable" });
        } finally {
          samples.length = 0; // drop references to the recordings right away
        }
      },
    );

    scope.delete<{ Params: { voiceId: string } }>(
      "/internal/v1/voices/:voiceId",
      { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
      async (request, reply) => {
        const voiceId = ProviderVoiceId.safeParse(request.params.voiceId);
        if (!voiceId.success) return reply.code(400).send({ error: "bad_voice_id" });

        let claims: { voiceId: string | null };
        try {
          claims = await verifyInternalToken(request.headers.authorization, "voice:delete");
        } catch (err) {
          request.log.warn({ err: errorSummary(err), route: "voice:delete" }, "internal token rejected");
          return reply.code(401).send({ error: "unauthorized" });
        }
        // The token names the exact voice it may delete; the URL must match it.
        if (claims.voiceId !== voiceId.data) {
          request.log.warn({ route: "voice:delete" }, "service token used for a different voice");
          return reply.code(403).send({ error: "forbidden" });
        }

        try {
          await providers.voices.delete(voiceId.data, AbortSignal.timeout(CLONE_TIMEOUT_MS));
          request.log.info("voice deleted");
          return reply.code(204).send();
        } catch (err) {
          request.log.warn({ err: errorSummary(err) }, "voice deletion failed");
          return reply.code(502).send({ error: "provider_unavailable" });
        }
      },
    );
  });
}

/** A pseudonymous name for the provider's voice list: no email, no real name. */
function providerVoiceName(userId: string): string {
  return `lct-${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep the input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
