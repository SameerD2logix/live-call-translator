/**
 * Provider contracts. The pipeline only talks to these interfaces, so cloud providers
 * (ElevenLabs, Claude) can later be swapped for self-hosted Whisper / NLLB / XTTS
 * services without touching the pipeline, the WebSocket layer or the browser.
 */
export type LanguageCode = "ur" | "en";

export type ProviderErrorCode = "auth" | "quota" | "rate_limited" | "unavailable" | "bad_input" | "unknown";

/** Errors from providers. Messages are written by us and are safe to log. */
export class ProviderError extends Error {
  override readonly name = "ProviderError";
  constructor(
    readonly provider: string,
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function errorCodeForStatus(status: number | undefined): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "bad_input";
  if (status !== undefined && status >= 500) return "unavailable";
  return "unknown";
}

// ---- Speech-to-text (streaming) -------------------------------------------
export interface SttHandlers {
  /** Interim text for the sentence in progress. Replaces the previous partial. */
  onPartial(text: string): void;
  /** Final text for a finished sentence (the provider decided the speaker paused). */
  onCommitted(text: string): void;
  /** A fatal provider error after the stream was ready. */
  onError(error: ProviderError): void;
  /** The provider closed the stream without us asking. */
  onClose(): void;
}

export interface SttStreamOptions {
  language: LanguageCode;
  /** Other languages that may be mixed in (e.g. English words inside Urdu speech). */
  secondaryLanguages?: LanguageCode[];
  /** Input is mono PCM16 little-endian at this rate. */
  sampleRate: number;
  /** Words to bias recognition toward (glossary). */
  keyterms?: string[];
  /** Pause that ends a sentence, overriding the provider default (per direction). */
  vadSilenceSecs?: number;
  handlers: SttHandlers;
}

export interface SttStream {
  /** Resolves when the provider is ready; rejects if it can't start. Audio sent earlier is buffered briefly. */
  readonly ready: Promise<void>;
  sendAudio(pcm16: Buffer): void;
  /** Force the current sentence to finish now (e.g. on mute). */
  commit(): void;
  close(): void;
}

export interface SttProvider {
  readonly id: string;
  open(options: SttStreamOptions): SttStream;
}

// ---- Translation ----------------------------------------------------------
export interface TranslationRequest {
  text: string;
  source: LanguageCode;
  target: LanguageCode;
  /** Recent sentence pairs, oldest first, for consistent pronouns and terms. */
  context?: Array<{ source: string; target: string }>;
  /** Terms that must be kept exactly as written. */
  glossary?: string[];
}

export interface TranslationProvider {
  readonly id: string;
  translate(request: TranslationRequest, signal?: AbortSignal): Promise<string>;
}

// ---- Text-to-speech (streaming) -------------------------------------------
export interface TtsRequest {
  text: string;
  voiceId: string;
  language: LanguageCode;
  /** Output is mono PCM16 little-endian at this rate, yielded in even-length chunks. */
  sampleRate: number;
}

export interface TtsProvider {
  readonly id: string;
  stream(request: TtsRequest, signal?: AbortSignal): AsyncIterable<Buffer>;
}

// ---- Voice cloning (Phase 2) ------------------------------------------------
export interface VoiceSample {
  data: Buffer;
  /** Verified by sniffing the bytes, not taken from the client's Content-Type. */
  mimeType: string;
  filename: string;
}

export interface VoiceCloneRequest {
  /** Pseudonymous label stored at the provider. Never an email or real name. */
  name: string;
  samples: VoiceSample[];
  /** Ask the provider to strip background noise (can hurt clean recordings). */
  removeBackgroundNoise: boolean;
}

/**
 * Creates and deletes a user's voice. A self-hosted XTTS/OpenVoice version would store a
 * speaker embedding (encrypted) and return its id instead of calling a cloud API.
 */
export interface VoiceCloneProvider {
  readonly id: string;
  clone(request: VoiceCloneRequest, signal?: AbortSignal): Promise<{ providerVoiceId: string }>;
  /** Must succeed (not throw) if the voice is already gone, so retries are safe. */
  delete(providerVoiceId: string, signal?: AbortSignal): Promise<void>;
}
