/**
 * The ONLY place that knows which concrete providers exist.
 *
 * To self-host later (Option B), add classes such as WhisperStt, NllbTranslator and XttsTts
 * that implement the interfaces in ./types (typically calling a Python inference service on
 * a rented GPU), add their names to the env enums, and wire them up here. Nothing else changes.
 */
import { env } from "../config/env";
import { AnthropicTranslator } from "./anthropic/translator";
import { ElevenLabsScribeStt } from "./elevenlabs/scribe-stt";
import { ElevenLabsTts } from "./elevenlabs/tts";
import { MockStt, MockTranslator, MockTts } from "./mock";
import type { SttProvider, TranslationProvider, TtsProvider } from "./types";

export interface Providers {
  stt: SttProvider;
  translation: TranslationProvider;
  tts: TtsProvider;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function createStt(): SttProvider {
  switch (env.STT_PROVIDER) {
    case "mock":
      return new MockStt();
    case "elevenlabs":
      return new ElevenLabsScribeStt({
        apiKey: required(env.ELEVENLABS_API_KEY, "ELEVENLABS_API_KEY"),
        modelId: env.ELEVENLABS_STT_MODEL,
        vadSilenceSecs: env.VAD_SILENCE_SECS,
      });
  }
}

function createTranslation(): TranslationProvider {
  switch (env.TRANSLATION_PROVIDER) {
    case "mock":
      return new MockTranslator();
    case "anthropic":
      return new AnthropicTranslator({
        apiKey: required(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
        model: env.TRANSLATION_MODEL,
      });
  }
}

function createTts(): TtsProvider {
  switch (env.TTS_PROVIDER) {
    case "mock":
      return new MockTts();
    case "elevenlabs":
      return new ElevenLabsTts({
        apiKey: required(env.ELEVENLABS_API_KEY, "ELEVENLABS_API_KEY"),
        modelId: env.ELEVENLABS_TTS_MODEL,
      });
  }
}

export function createProviders(): Providers {
  return { stt: createStt(), translation: createTranslation(), tts: createTts() };
}
