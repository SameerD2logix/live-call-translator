/**
 * Mock providers: run the whole pipeline with no API keys and no cost.
 * Speak (any language) for a moment, then pause: you get a fixed Urdu sentence,
 * its English translation, and a short tone instead of speech.
 * The env validator refuses to start with mocks in production.
 */
import { randomUUID } from "node:crypto";
import type {
  SttProvider,
  SttStream,
  SttStreamOptions,
  TranslationProvider,
  TranslationRequest,
  TtsProvider,
  TtsRequest,
  VoiceCloneProvider,
  VoiceCloneRequest,
} from "../types";

const MOCK_URDU = "میں یہ کام کل تک مکمل کر دوں گا";
const MOCK_ENGLISH = "I'll have this work finished by tomorrow.";
const VOICE_RMS_THRESHOLD = 0.02;
const SILENCE_TO_COMMIT_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function rms(pcm: Buffer): number {
  const samples = pcm.length / 2;
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const s = pcm.readInt16LE(i) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

export class MockStt implements SttProvider {
  readonly id = "mock-stt";

  open({ handlers, sampleRate }: SttStreamOptions): SttStream {
    const words = MOCK_URDU.split(" ");
    const msPerByte = 1000 / (sampleRate * 2);
    let speaking = false;
    let voicedMs = 0;
    let silentMs = 0;
    let closed = false;

    const finish = () => {
      speaking = false;
      voicedMs = 0;
      silentMs = 0;
      handlers.onCommitted(MOCK_URDU);
    };

    return {
      ready: Promise.resolve(),
      sendAudio(pcm) {
        if (closed) return;
        const ms = pcm.length * msPerByte;
        if (rms(pcm) > VOICE_RMS_THRESHOLD) {
          speaking = true;
          silentMs = 0;
          voicedMs += ms;
          handlers.onPartial(words.slice(0, Math.min(words.length, Math.ceil(voicedMs / 300))).join(" "));
        } else if (speaking) {
          silentMs += ms;
          if (silentMs >= SILENCE_TO_COMMIT_MS) finish();
        }
      },
      commit() {
        if (speaking && !closed) finish();
      },
      close() {
        closed = true;
      },
    };
  }
}

export class MockTranslator implements TranslationProvider {
  readonly id = "mock-translator";

  async translate({ text }: TranslationRequest, signal?: AbortSignal): Promise<string> {
    await sleep(250);
    if (signal?.aborted) throw new Error("aborted");
    return text === MOCK_URDU ? MOCK_ENGLISH : `(mock translation, ${text.split(/\s+/).length} words)`;
  }
}

export class MockTts implements TtsProvider {
  readonly id = "mock-tts";

  async *stream({ text, sampleRate }: TtsRequest, signal?: AbortSignal): AsyncIterable<Buffer> {
    const seconds = Math.min(6, 0.3 * text.split(/\s+/).length);
    const total = Math.floor(seconds * sampleRate);
    const chunk = Math.floor(sampleRate / 10); // 100 ms
    await sleep(150); // pretend time-to-first-byte

    for (let offset = 0; offset < total; offset += chunk) {
      if (signal?.aborted) return;
      const n = Math.min(chunk, total - offset);
      const buf = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) {
        const t = (offset + i) / sampleRate;
        const fade = Math.min(1, t * 20, (total - offset - i) / (sampleRate * 0.05));
        buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * t) * 0.15 * fade * 32767), i * 2);
      }
      yield buf;
      await sleep(20);
    }
  }
}

/** Pretends to clone: returns a fake voice id after a short delay. Works with MockTts. */
export class MockVoiceCloner implements VoiceCloneProvider {
  readonly id = "mock";

  async clone(_request: VoiceCloneRequest, signal?: AbortSignal): Promise<{ providerVoiceId: string }> {
    await sleep(800);
    if (signal?.aborted) throw new Error("aborted");
    return { providerVoiceId: `mock-${randomUUID().slice(0, 8)}` };
  }

  async delete(): Promise<void> {
    await sleep(100);
  }
}
