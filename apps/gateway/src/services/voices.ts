import { env } from "../config/env";

/**
 * Returns the TTS voice to speak with for this user.
 *
 * Phase 1: one shared voice from env.
 * Phase 2: look up the user's OWN clone, e.g.
 *   SELECT provider_voice_id FROM voices
 *   WHERE user_id = $1 AND consent_given_at IS NOT NULL AND deleted_at IS NULL
 *
 * Security: the voice ID is never accepted from the browser. That is what guarantees
 * one user can never speak with another person's cloned voice.
 */
export async function resolveVoiceId(_userId: string): Promise<string> {
  if (env.TTS_PROVIDER === "mock") return "mock-voice";
  if (!env.ELEVENLABS_DEFAULT_VOICE_ID) throw new Error("ELEVENLABS_DEFAULT_VOICE_ID is not configured");
  return env.ELEVENLABS_DEFAULT_VOICE_ID;
}
