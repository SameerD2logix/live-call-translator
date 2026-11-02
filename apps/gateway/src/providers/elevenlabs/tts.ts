/**
 * ElevenLabs streaming text-to-speech over HTTP.
 * Endpoint: POST /v1/text-to-speech/{voice_id}/stream?output_format=pcm_24000
 *
 * Why HTTP streaming instead of the stream-input WebSocket: we synthesize one finished
 * sentence at a time, so a single request per sentence is simpler and still starts
 * playing as soon as the first bytes arrive. eleven_flash_v2_5 is the low-latency model.
 */
import { ProviderError, errorCodeForStatus, type TtsProvider, type TtsRequest } from "../types";

const API_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const REQUEST_TIMEOUT_MS = 15_000;

export interface ElevenLabsTtsConfig {
  apiKey: string;
  modelId: string;
}

export class ElevenLabsTts implements TtsProvider {
  readonly id = "elevenlabs-tts";

  constructor(private readonly cfg: ElevenLabsTtsConfig) {}

  async *stream(request: TtsRequest, signal?: AbortSignal): AsyncIterable<Buffer> {
    const url = new URL(`${API_BASE}/${encodeURIComponent(request.voiceId)}/stream`);
    url.searchParams.set("output_format", `pcm_${request.sampleRate}`);

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": this.cfg.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: request.text,
          model_id: this.cfg.modelId,
          // Forces English pronunciation. Supported by the Flash/Turbo v2.5 models.
          language_code: request.language,
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new ProviderError(this.id, "unavailable", "Couldn't reach the text-to-speech service.");
    }

    if (!response.ok || !response.body) {
      // Don't read or log the body: error bodies can echo the text we sent.
      await response.body?.cancel().catch(() => undefined);
      throw new ProviderError(this.id, errorCodeForStatus(response.status), `TTS request failed (HTTP ${response.status}).`);
    }

    const reader = response.body.getReader();
    let carry: number | null = null; // odd byte left over from the previous network chunk

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;

        let bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        if (carry !== null) {
          bytes = Buffer.concat([Buffer.from([carry]), bytes]);
          carry = null;
        }
        // PCM16 samples are 2 bytes; never split a sample across chunks.
        if (bytes.length % 2 === 1) {
          carry = bytes[bytes.length - 1];
          bytes = bytes.subarray(0, bytes.length - 1);
        }
        if (bytes.length > 0) yield bytes;
      }
    } finally {
      // Stops the download if the consumer stopped early (e.g. the user pressed Stop).
      await reader.cancel().catch(() => undefined);
    }
  }
}
