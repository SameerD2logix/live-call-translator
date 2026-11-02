/**
 * @lct/protocol — the WebSocket contract shared by the browser (apps/web) and the gateway
 * (apps/gateway). Both sides import these Zod schemas, so a message shape can't drift.
 *
 *  - JSON text frames carry control messages and events. The gateway validates every
 *    incoming message (the browser is untrusted); the browser validates every event too.
 *  - Binary frames carry audio only, never base64-in-JSON:
 *      browser → gateway : mic audio, PCM16 little-endian, mono, INPUT_SAMPLE_RATE
 *      gateway → browser : translated speech, PCM16 LE mono, at the rate announced in "tts.start"
 */
import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

// ---- Audio --------------------------------------------------------------------
/** Mic audio sent upstream. 16 kHz mono is what speech-to-text is tuned for. */
export const INPUT_SAMPLE_RATE = 16_000;
/** One upstream frame = 100 ms (inside the 0.1–1 s chunk size Scribe recommends). */
export const INPUT_FRAME_MS = 100;
/** 16 000 samples/s × 2 bytes ÷ 1000 = 32 bytes per millisecond of audio. */
export const INPUT_BYTES_PER_MS = (INPUT_SAMPLE_RATE * 2) / 1000;
/** Translated speech sent downstream (ElevenLabs output_format pcm_24000). */
export const TTS_SAMPLE_RATE = 24_000;

// ---- Size limits (enforced by the gateway, mirrored here so both sides agree) ---
/** Largest accepted mic frame: 500 ms. Normal frames are 100 ms (3 200 bytes). */
export const MAX_AUDIO_FRAME_BYTES = INPUT_BYTES_PER_MS * 500;
/** Largest accepted JSON control message. */
export const MAX_CONTROL_MESSAGE_BYTES = 4 * 1024;
/** Hard cap the WebSocket library enforces on any single frame (it closes with 1009 above this). */
export const MAX_WS_MESSAGE_BYTES = 64 * 1024;
/** Transcript text per sentence is truncated to this many characters. */
export const MAX_SEGMENT_CHARS = 2_000;

// ---- Close codes (4000–4999 are reserved for applications) ---------------------
export const CloseCode = {
  badRequest: 4400,
  unauthorized: 4401,
  quotaExceeded: 4402,
  sessionTimeout: 4408,
  sessionLimit: 4409,
  rateLimited: 4429,
  providerUnavailable: 4503,
} as const;
export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];

export const ErrorCode = z.enum([
  "unauthorized", // missing, expired or replayed ticket
  "bad_request", // malformed, oversized or out-of-order message
  "session_limit", // another live session for this user, or max session length reached
  "quota_exceeded", // daily minutes used up
  "rate_limited", // audio arriving faster than real time
  "provider_unavailable", // speech-to-text, translation or TTS failing
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

// ---- Browser → gateway --------------------------------------------------------
// strictObject: unknown fields are rejected, so clients can't smuggle extra data in.
export const ClientMessage = z.discriminatedUnion("type", [
  /** Must be the FIRST message. The ticket is a 60 s single-use JWT from /api/realtime/ticket. */
  z.strictObject({
    type: z.literal("auth"),
    protocol: z.literal(PROTOCOL_VERSION),
    ticket: z.string().min(20).max(4_096),
  }),
  /** Phase 1 supports one direction: Urdu speech → English speech. */
  z.strictObject({ type: z.literal("session.start"), source: z.literal("ur"), target: z.literal("en") }),
  z.strictObject({ type: z.literal("session.stop") }),
  /** Browser-measured delay until the translated audio became audible. Numbers only. */
  z.strictObject({
    type: z.literal("client.metrics"),
    segmentId: z.number().int().positive(),
    playbackDelayMs: z.number().nonnegative().max(120_000),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ---- Gateway → browser --------------------------------------------------------
const segmentId = z.number().int().positive();
const transcript = z.string().max(MAX_SEGMENT_CHARS);
/** Translations can run longer than the source sentence. */
const translation = z.string().max(MAX_SEGMENT_CHARS * 4);

export const ServerEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    sessionId: z.string(),
    /** Pause length that ends a sentence; the browser adds it to its delay estimate. */
    vadSilenceMs: z.number().int().nonnegative(),
    ttsSampleRate: z.number().int().positive(),
  }),
  z.object({ type: z.literal("session.started") }),
  /** Interim Urdu text for the sentence being spoken. Replaces the previous partial. */
  z.object({ type: z.literal("transcript.partial"), text: transcript }),
  /** Final Urdu text for one sentence. */
  z.object({ type: z.literal("transcript.final"), segmentId, text: transcript }),
  z.object({ type: z.literal("translation"), segmentId, text: translation }),
  /** One sentence failed; the session continues. */
  z.object({
    type: z.literal("segment.error"),
    segmentId,
    stage: z.enum(["translation", "tts"]),
    message: z.string().max(300),
  }),
  /** Binary audio frames that follow, until tts.end, belong to this sentence. */
  z.object({ type: z.literal("tts.start"), segmentId, sampleRate: z.number().int().positive() }),
  z.object({ type: z.literal("tts.end"), segmentId }),
  /** Per-stage timings in milliseconds for one sentence. */
  z.object({ type: z.literal("latency"), segmentId, stages: z.record(z.string(), z.number()) }),
  /** Sent right before the gateway closes the socket. `message` is user-facing and written by us. */
  z.object({ type: z.literal("error"), code: ErrorCode, message: z.string().max(300) }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;

// ---- HTTP: POST /api/realtime/ticket ------------------------------------------
export const TicketResponse = z.object({
  ticket: z.string().min(20),
  gatewayUrl: z.url(),
});
export type TicketResponse = z.infer<typeof TicketResponse>;
