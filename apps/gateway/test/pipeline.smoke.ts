/* eslint-disable no-console -- this script reports its result on stdout */
/**
 * Smoke test (no API keys, no network): runs the real TranslationPipeline with the mock
 * providers in BOTH directions and validates every event against the shared protocol.
 *   pnpm --filter @lct/gateway smoke
 */
import pino from "pino";
import { INPUT_SAMPLE_RATE, ServerEvent, decodeAudioFrame, encodeAudioFrame, type Direction } from "@lct/protocol";
import { TranslationPipeline } from "../src/pipeline/translation-pipeline";
import { MockStt, MockTranslator, MockTts } from "../src/providers/mock";

/** 100 ms of 16 kHz PCM16: a tone (speech stand-in) or silence. */
function frame(amplitude: number): Buffer {
  const samples = INPUT_SAMPLE_RATE / 10;
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(amplitude * 32767 * Math.sin(i / 5)), i * 2);
  return buf;
}

async function run(dir: Direction, withSpeech: boolean) {
  const events: ServerEvent[] = [];
  let audioBytes = 0;
  const pipeline = new TranslationPipeline({
    direction: dir,
    source: dir === "out" ? "ur" : "en",
    target: dir === "out" ? "en" : "ur",
    providers: { stt: new MockStt(), translation: new MockTranslator() },
    speech: withSpeech ? { tts: new MockTts(), voiceId: "mock-voice" } : null,
    vadSilenceMs: 700,
    secondaryLanguages: [],
    glossary: [],
    log: pino({ level: "silent" }),
    emit: (event) => {
      if (!ServerEvent.safeParse(event).success) throw new Error(`Event doesn't match the protocol: ${event.type}`);
      if ("dir" in event && event.dir !== dir) throw new Error(`Event tagged with the wrong direction: ${event.type}`);
      events.push(event);
    },
    emitAudio: (pcm) => {
      if (pcm.length % 2 !== 0) throw new Error("TTS chunk split a PCM16 sample");
      // Round-trip through the wire format to check the channel byte.
      const decoded = decodeAudioFrame(encodeAudioFrame(dir, pcm));
      if (!decoded || decoded.dir !== dir || decoded.pcm.byteLength !== pcm.length) throw new Error("audio frame round-trip failed");
      audioBytes += pcm.length;
    },
    onFatal: (err) => {
      throw err;
    },
  });

  await pipeline.start();
  for (let i = 0; i < 12; i++) pipeline.pushAudio(frame(0.3)); // 1.2 s "speech"
  for (let i = 0; i < 10; i++) pipeline.pushAudio(frame(0)); // 1 s pause → sentence commits
  await new Promise((resolve) => setTimeout(resolve, 3_500));
  pipeline.stop();

  const order = events.map((e) => e.type).filter((t, i, all) => t !== all[i - 1]);
  const expected = withSpeech
    ? ["transcript.partial", "transcript.final", "translation", "tts.start", "tts.end", "latency"]
    : ["transcript.partial", "transcript.final", "translation", "latency"];
  if (JSON.stringify(order) !== JSON.stringify(expected)) throw new Error(`${dir}: unexpected order ${order.join(" → ")}`);
  if (withSpeech === (audioBytes === 0)) throw new Error(`${dir}: speech output ${withSpeech ? "missing" : "unexpected"}`);
  const latency = events.find((e) => e.type === "latency");
  console.log(`✓ ${dir}${withSpeech ? " + speech" : " (subtitles only)"}: ${order.join(" → ")}`);
  if (latency?.type === "latency") console.log("  stages:", JSON.stringify(latency.stages));
}

await run("out", true);
await run("in", false);
await run("in", true);
console.log("✓ pipeline smoke test passed");
