/* eslint-disable no-console -- this script reports its result on stdout */
/**
 * Smoke test (no API keys, no network): runs the real OutgoingPipeline with the mock
 * providers and validates every event it emits against the shared protocol schema.
 *   pnpm --filter @lct/gateway smoke
 */
import pino from "pino";
import { INPUT_SAMPLE_RATE, ServerEvent } from "@lct/protocol";
import { OutgoingPipeline } from "../src/pipeline/outgoing-pipeline";
import { MockStt, MockTranslator, MockTts, MockVoiceCloner } from "../src/providers/mock";

const events: ServerEvent[] = [];
let audioBytes = 0;

const pipeline = new OutgoingPipeline({
  providers: { stt: new MockStt(), translation: new MockTranslator(), tts: new MockTts(), voices: new MockVoiceCloner() },
  voiceId: "mock-voice",
  vadSilenceMs: 700,
  secondaryLanguages: [],
  glossary: [],
  log: pino({ level: "silent" }),
  emit: (event) => {
    const parsed = ServerEvent.safeParse(event);
    if (!parsed.success) throw new Error(`Event doesn't match the protocol: ${event.type}`);
    events.push(event);
  },
  emitAudio: (pcm) => {
    if (pcm.length % 2 !== 0) throw new Error("TTS chunk split a PCM16 sample");
    audioBytes += pcm.length;
  },
  onFatal: (err) => {
    throw err;
  },
});

/** 100 ms of 16 kHz PCM16: a tone (speech stand-in) or silence. */
function frame(amplitude: number): Buffer {
  const samples = INPUT_SAMPLE_RATE / 10;
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(amplitude * 32767 * Math.sin(i / 5)), i * 2);
  return buf;
}

await pipeline.start();
for (let i = 0; i < 12; i++) pipeline.pushAudio(frame(0.3)); // 1.2 s "speech"
for (let i = 0; i < 10; i++) pipeline.pushAudio(frame(0)); // 1 s pause → sentence commits
await new Promise((resolve) => setTimeout(resolve, 3_500));
pipeline.stop();

const order = events.map((e) => e.type).filter((t, i, all) => t !== all[i - 1]);
const expected = ["transcript.partial", "transcript.final", "translation", "tts.start", "tts.end", "latency"];
if (JSON.stringify(order) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected event order: ${order.join(" → ")}`);
}
if (audioBytes === 0) throw new Error("No TTS audio was produced");
const latency = events.find((e) => e.type === "latency");
console.log("✓ pipeline smoke test passed:", order.join(" → "));
if (latency?.type === "latency") console.log("  stages:", latency.stages);
