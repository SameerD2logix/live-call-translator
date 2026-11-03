/**
 * ElevenLabs Instant Voice Cloning.
 *   Create: POST /v1/voices/add  (multipart: name, files[], remove_background_noise)
 *   Delete: DELETE /v1/voices/{voice_id}
 *
 * Deleting the voice also removes the samples ElevenLabs stored with it. We never keep a
 * copy of the recordings ourselves.
 */
import { ProviderError, errorCodeForStatus, type VoiceCloneProvider, type VoiceCloneRequest } from "../types";

const API_BASE = "https://api.elevenlabs.io/v1/voices";
const REQUEST_TIMEOUT_MS = 90_000;

export class ElevenLabsVoiceCloner implements VoiceCloneProvider {
  readonly id = "elevenlabs";

  constructor(private readonly cfg: { apiKey: string }) {}

  async clone(request: VoiceCloneRequest, signal?: AbortSignal): Promise<{ providerVoiceId: string }> {
    const form = new FormData();
    form.append("name", request.name);
    form.append("remove_background_noise", String(request.removeBackgroundNoise));
    for (const sample of request.samples) {
      // Copy into a plain Uint8Array so the Blob owns its bytes.
      form.append("files", new Blob([new Uint8Array(sample.data)], { type: sample.mimeType }), sample.filename);
    }

    const response = await this.request(`${API_BASE}/add`, { method: "POST", body: form }, signal);
    if (!response.ok) {
      // Don't read or log error bodies; they can echo request details.
      await response.body?.cancel().catch(() => undefined);
      throw new ProviderError(this.id, errorCodeForStatus(response.status), `Voice cloning failed (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as { voice_id?: unknown; requires_verification?: unknown };
    if (typeof body.voice_id !== "string") {
      throw new ProviderError(this.id, "unknown", "Voice cloning returned no voice id.");
    }
    if (body.requires_verification === true) {
      // A voice we can't use immediately is useless for live calls. Clean it up.
      await this.delete(body.voice_id).catch(() => undefined);
      throw new ProviderError(this.id, "bad_input", "The provider asked for manual verification of this voice.");
    }
    return { providerVoiceId: body.voice_id };
  }

  async delete(providerVoiceId: string, signal?: AbortSignal): Promise<void> {
    const response = await this.request(`${API_BASE}/${encodeURIComponent(providerVoiceId)}`, { method: "DELETE" }, signal);
    await response.body?.cancel().catch(() => undefined);
    if (response.ok || response.status === 404) return; // already gone counts as deleted
    throw new ProviderError(this.id, errorCodeForStatus(response.status), `Voice deletion failed (HTTP ${response.status}).`);
  }

  private async request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...init,
        headers: { "xi-api-key": this.cfg.apiKey },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new ProviderError(this.id, "unavailable", "Couldn't reach the voice service.");
    }
  }
}
