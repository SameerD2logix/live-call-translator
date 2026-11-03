/**
 * ElevenLabs Scribe v2 Realtime over its WebSocket API.
 * Guide: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/server-side-streaming
 *
 * The gateway connects with the API key in a header, so the key never reaches the browser.
 * Audio is sent as base64 PCM in `input_audio_chunk` messages; Scribe replies with
 * `partial_transcript` (interim) and `committed_transcript` (final for that sentence).
 */
import WebSocket from "ws";
import {
  ProviderError,
  errorCodeForStatus,
  type ProviderErrorCode,
  type SttProvider,
  type SttStream,
  type SttStreamOptions,
} from "../types";

const ENDPOINT = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const CONNECT_TIMEOUT_MS = 10_000;
/** While the session is starting we buffer at most this much audio, dropping the oldest. */
const MAX_PENDING_MS = 3_000;

export interface ScribeConfig {
  apiKey: string;
  modelId: string;
  vadSilenceSecs: number;
}

interface ScribeMessage {
  message_type?: string;
  text?: unknown;
}

export class ElevenLabsScribeStt implements SttProvider {
  readonly id = "elevenlabs-scribe";

  constructor(private readonly cfg: ScribeConfig) {}

  open(options: SttStreamOptions): SttStream {
    const { handlers, sampleRate } = options;

    const url = new URL(ENDPOINT);
    url.searchParams.set("model_id", this.cfg.modelId);
    url.searchParams.set("audio_format", `pcm_${sampleRate}`);
    // VAD ends a sentence after a pause. Urdu is verb-final, so we only translate COMMITTED
    // sentences; partials are shown on screen but never translated mid-sentence.
    url.searchParams.set("commit_strategy", "vad");
    url.searchParams.set("vad_silence_threshold_secs", String(options.vadSilenceSecs ?? this.cfg.vadSilenceSecs));
    url.searchParams.set("language_code", options.language);
    // List parameters are sent as repeated keys. If the handshake is rejected, check the
    // API reference for the expected encoding, or set STT_SECONDARY_LANGUAGES empty.
    for (const lang of options.secondaryLanguages ?? []) url.searchParams.append("secondary_languages", lang);
    // Keyterms bias recognition toward glossary words (max 50; ElevenLabs charges extra for this).
    for (const term of (options.keyterms ?? []).slice(0, 50)) url.searchParams.append("keyterms", term);

    const ws = new WebSocket(url, {
      headers: { "xi-api-key": this.cfg.apiKey },
      handshakeTimeout: CONNECT_TIMEOUT_MS,
    });

    const maxPendingBytes = sampleRate * 2 * (MAX_PENDING_MS / 1000);
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    let ready = false;
    let closedByUs = false;

    const sendChunk = (pcm: Buffer, commit: boolean) => {
      ws.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: pcm.toString("base64"),
          commit,
          sample_rate: sampleRate,
        }),
      );
    };

    const readyPromise = new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      const fail = (error: ProviderError) => {
        clearTimeout(timer);
        if (!ready) {
          reject(error);
          ws.terminate();
        } else if (!closedByUs) {
          handlers.onError(error);
        }
      };

      timer = setTimeout(
        () => fail(new ProviderError(this.id, "unavailable", "Timed out waiting for the transcription session.")),
        CONNECT_TIMEOUT_MS,
      );

      ws.on("message", (raw: WebSocket.RawData) => {
        let message: ScribeMessage;
        try {
          message = JSON.parse(raw.toString()) as ScribeMessage;
        } catch {
          return; // ignore anything that isn't JSON
        }

        switch (message.message_type) {
          case "session_started":
            if (ready || closedByUs) return;
            ready = true;
            clearTimeout(timer);
            for (const chunk of pending) sendChunk(chunk, false);
            pending = [];
            pendingBytes = 0;
            resolve();
            return;
          case "partial_transcript":
            handlers.onPartial(typeof message.text === "string" ? message.text : "");
            return;
          case "committed_transcript":
            if (typeof message.text === "string") handlers.onCommitted(message.text);
            return;
          default: {
            const code = scribeErrorCode(message.message_type);
            if (code) fail(new ProviderError(this.id, code, `Speech-to-text error event: ${message.message_type}`));
          }
        }
      });

      ws.on("error", (err) =>
        fail(new ProviderError(this.id, codeFromHandshakeError(err), "Speech-to-text connection error.")),
      );

      ws.on("close", () => {
        clearTimeout(timer);
        if (!ready) {
          reject(new ProviderError(this.id, "unavailable", "Speech-to-text closed before the session started."));
        } else if (!closedByUs) {
          handlers.onClose();
        }
      });
    });

    return {
      ready: readyPromise,

      sendAudio: (pcm) => {
        if (closedByUs) return;
        if (!ready) {
          pending.push(pcm);
          pendingBytes += pcm.length;
          while (pendingBytes > maxPendingBytes && pending.length > 0) {
            pendingBytes -= pending.shift()!.length;
          }
          return;
        }
        if (ws.readyState === WebSocket.OPEN) sendChunk(pcm, false);
      },

      commit: () => {
        if (ready && !closedByUs && ws.readyState === WebSocket.OPEN) sendChunk(Buffer.alloc(0), true);
      },

      close: () => {
        if (closedByUs) return;
        closedByUs = true;
        pending = [];
        if (ws.readyState === WebSocket.OPEN) ws.close(1000);
        else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
      },
    };
  }
}

/**
 * Maps Scribe error events to our codes. Names follow ElevenLabs' realtime event reference;
 * check it if you see "unknown" errors. Non-fatal notices return null and are ignored.
 */
function scribeErrorCode(type: string | undefined): ProviderErrorCode | null {
  switch (type) {
    case undefined:
      return null;
    case "auth_error":
    case "unaccepted_terms":
      return "auth";
    case "quota_exceeded":
      return "quota";
    case "rate_limited":
    case "queue_overflow":
    case "resource_exhausted":
      return "rate_limited";
    case "input_error":
    case "chunk_size_exceeded":
    case "invalid_request":
      return "bad_input";
    case "session_time_limit_exceeded":
    case "transcriber_error":
      return "unavailable";
    case "insufficient_audio_activity":
    case "commit_throttled":
      return null; // harmless: a commit with too little audio, or commits sent too quickly
    default:
      return type.includes("error") ? "unknown" : null;
  }
}

/** The ws library reports HTTP handshake failures as "Unexpected server response: 401". */
function codeFromHandshakeError(err: Error): ProviderErrorCode {
  const match = /Unexpected server response: (\d{3})/.exec(err.message);
  return match ? errorCodeForStatus(Number(match[1])) : "unavailable";
}
