/**
 * @lct/protocol — the WebSocket contract shared by the browser (apps/web) and the gateway
 * (apps/gateway). Both sides import these Zod schemas, so a message shape can't drift.
 *
 *  - JSON text frames carry control messages and events. The gateway validates every
 *    incoming message (the browser is untrusted); the browser validates every event too.
 *  - Binary frames carry audio only, never base64-in-JSON. Since v2 (Phase 3) one socket carries
 *    BOTH directions, so every binary frame starts with one channel byte (see AudioChannel):
 *      browser → gateway : [1] your mic        | [2] the call's audio (the client speaking)
 *      gateway → browser : [1] English for the call (→ virtual cable) | [2] Urdu for your headphones
 *    The rest of the frame is PCM16 little-endian mono: INPUT_SAMPLE_RATE upstream, and the rate
 *    announced in "tts.start" downstream.
 */
import { z } from "zod";

export const PROTOCOL_VERSION = 2 as const;

// ---- Directions -----------------------------------------------------------------
/** "out": you speak Urdu → the client hears English. "in": the client speaks English → you get Urdu. */
export const Direction = z.enum(["out", "in"]);
export type Direction = z.infer<typeof Direction>;

/** First byte of every binary WebSocket frame. */
export const AudioChannel = { out: 1, in: 2 } as const satisfies Record<Direction, number>;

/** Prefix PCM with its channel byte. */
export function encodeAudioFrame(dir: Direction, pcm: Uint8Array): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(pcm.byteLength + 1);
  frame[0] = AudioChannel[dir];
  frame.set(pcm, 1);
  return frame;
}

/** Split a binary frame into its direction and PCM payload (a view, not a copy). Null if malformed. */
export function decodeAudioFrame(frame: Uint8Array): { dir: Direction; pcm: Uint8Array } | null {
  if (frame.byteLength < 3) return null;
  const dir = frame[0] === AudioChannel.out ? "out" : frame[0] === AudioChannel.in ? "in" : null;
  return dir ? { dir, pcm: frame.subarray(1) } : null;
}

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
  voiceRequired: 4412,
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
  "voice_required", // the user hasn't created their voice yet (Phase 2 onboarding)
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
  /** Start translating the call's audio (sent as channel 2) into Urdu. Requires an active connection. */
  z.strictObject({ type: z.literal("incoming.start"), speakUrdu: z.boolean() }),
  z.strictObject({ type: z.literal("incoming.stop") }),
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
    /** Whether the gateway can speak the client's words to you in Urdu (a voice is configured). */
    urduVoiceAvailable: z.boolean(),
  }),
  z.object({ type: z.literal("session.started") }),
  z.object({ type: z.literal("incoming.started"), speakUrdu: z.boolean() }),
  z.object({ type: z.literal("incoming.stopped") }),
  // Segment events carry `dir`; segment ids are counted separately per direction.
  /** Interim source-language text for the sentence being spoken. Replaces the previous partial. */
  z.object({ type: z.literal("transcript.partial"), dir: Direction, text: transcript }),
  /** Final source-language text for one sentence. */
  z.object({ type: z.literal("transcript.final"), dir: Direction, segmentId, text: transcript }),
  z.object({ type: z.literal("translation"), dir: Direction, segmentId, text: translation }),
  /** One sentence failed; the session continues. */
  z.object({
    type: z.literal("segment.error"),
    dir: Direction,
    segmentId,
    stage: z.enum(["translation", "tts"]),
    message: z.string().max(300),
  }),
  /** Binary frames on this direction's channel, until tts.end, belong to this sentence. */
  z.object({ type: z.literal("tts.start"), dir: Direction, segmentId, sampleRate: z.number().int().positive() }),
  z.object({ type: z.literal("tts.end"), dir: Direction, segmentId }),
  /** Per-stage timings in milliseconds for one sentence. */
  z.object({ type: z.literal("latency"), dir: Direction, segmentId, stages: z.record(z.string(), z.number()) }),
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

// ---- Voice cloning (Phase 2) ----------------------------------------------------
// Flow: browser → web app (POST /api/voice, session + consent checks, DB) → gateway
// (POST /internal/v1/voices, service token) → voice provider. Recordings are held in
// memory only and are never written to disk on either server.

/** Audience of the short-lived service tokens the web app signs for the gateway's internal API. */
export const INTERNAL_TOKEN_AUDIENCE = "lct-gateway-internal";

export const VOICE_SAMPLE_LIMITS = {
  minSamples: 10,
  maxSamples: 20,
  /** 20 s of Opus at 96 kbps is ~240 KB; 512 KB leaves headroom for other codecs. */
  maxSampleBytes: 512 * 1024,
  /** Stays under the 4.5 MB request-body limit of serverless hosts such as Vercel. */
  maxTotalBytes: 4 * 1024 * 1024,
  /** ElevenLabs recommends 1–2 minutes of clean audio for an instant clone. */
  minTotalSeconds: 45,
  maxTotalSeconds: 240,
  maxSampleSeconds: 20,
} as const;

export const VOICE_SAMPLE_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"] as const;
export type VoiceSampleMimeType = (typeof VOICE_SAMPLE_MIME_TYPES)[number];

/** Provider voice ids (ElevenLabs uses 20 alphanumerics; mocks use "mock-…"). */
export const ProviderVoiceId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const VoiceCloneResult = z.object({
  provider: z.string().min(1).max(40),
  providerVoiceId: ProviderVoiceId,
});
export type VoiceCloneResult = z.infer<typeof VoiceCloneResult>;

/**
 * Identify an audio container from its first bytes. Both servers use this instead of
 * trusting the declared Content-Type, so a renamed executable or HTML file is rejected.
 */
export function sniffAudioContainer(bytes: Uint8Array): VoiceSampleMimeType | null {
  if (bytes.length < 12) return null;
  // WebM / Matroska: EBML header 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  // Ogg: "OggS"
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "audio/ogg";
  // MP4 / M4A (Safari's MediaRecorder): "ftyp" at offset 4
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "audio/mp4";
  return null;
}

export const AUDIO_FILE_EXTENSION: Record<VoiceSampleMimeType, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
};
