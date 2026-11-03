/**
 * Internal voice API, called only by the web app's server (never by browsers).
 *
 *   POST   /internal/v1/voices            multipart: samples[] (audio), removeBackgroundNoise
 *   DELETE /internal/v1/voices/:voiceId
 *
 * The web app has already checked the session, email verification, consent and its own
 * limits. We re-check everything that matters here (defence in depth): a scoped single-use
 * service token, file count and size, and the real file type from the bytes themselves.
 * Recordings stay in memory and are dropped as soon as the provider call returns.
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
import { errorSummary } from "../lib/errors";
import type { Providers } from "../providers";
import type { VoiceSample } from "../providers/types";
import { verifyInternalToken } from "../security/internal-token";

const CLONE_TIMEOUT_MS = 90_000;

export async function registerVoiceRoutes(app: FastifyInstance, providers: Providers): Promise<void> {
  // Encapsulated: multipart parsing is enabled for these routes only.
  await app.register(async (scope) => {
    await scope.register(multipart, {
      limits: {
        files: VOICE_SAMPLE_LIMITS.maxSamples,
        fileSize: VOICE_SAMPLE_LIMITS.maxSampleBytes,
        fields: 4,
        fieldSize: 256,
        parts: VOICE_SAMPLE_LIMITS.maxSamples + 4,
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
        } catch {
          return reply.code(401).send({ error: "unauthorized" });
        }

        const samples: VoiceSample[] = [];
        let totalBytes = 0;
        let removeBackgroundNoise = false;
        try {
          for await (const part of request.parts()) {
            if (part.type === "field") {
              if (part.fieldname === "removeBackgroundNoise") removeBackgroundNoise = part.value === "true";
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
        } catch {
          return reply.code(401).send({ error: "unauthorized" });
        }
        // The token names the exact voice it may delete; the URL must match it.
        if (claims.voiceId !== voiceId.data) return reply.code(403).send({ error: "forbidden" });

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
