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
import type { SttProvider, SttStreamOptions } from "../src/providers/types";

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
    useKeyterms: false,
    mergeIncompleteMs: 2500,
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

/**
 * Phase 4: a sentence cut before its verb is joined with the rest; Fix speaks a typed
 * replacement; Repeat speaks a sentence again. Driven by a scripted speech recognizer.
 */
async function runAccuracy() {
  let handlers: SttStreamOptions["handlers"] | null = null;
  let keyterms: string[] = [];
  const scripted: SttProvider = {
    id: "scripted-stt",
    open(options) {
      handlers = options.handlers;
      keyterms = options.keyterms ?? [];
      return { ready: Promise.resolve(), sendAudio() {}, commit() {}, close() {} };
    },
  };
  const events: ServerEvent[] = [];
  const pipeline = new TranslationPipeline({
    direction: "out",
    source: "ur",
    target: "en",
    providers: { stt: scripted, translation: new MockTranslator() },
    speech: { tts: new MockTts(), voiceId: "mock-voice" },
    vadSilenceMs: 700,
    secondaryLanguages: [],
    glossary: ["WordPress", "API"],
    useKeyterms: true,
    mergeIncompleteMs: 300,
    log: pino({ level: "silent" }),
    emit: (event) => {
      if (!ServerEvent.safeParse(event).success) throw new Error(`Event doesn't match the protocol: ${event.type}`);
      events.push(event);
    },
    emitAudio: () => undefined,
    onFatal: (err) => {
      throw err;
    },
  });
  await pipeline.start();
  const h = handlers as SttStreamOptions["handlers"] | null;
  if (!h) throw new Error("scripted STT not opened");
  if (keyterms.join() !== "WordPress,API") throw new Error("glossary wasn't sent as keyterms");

  // The speaker pauses before the verb: two committed pieces, one sentence.
  h.onPartial("میں یہ کام کل تک");
  h.onCommitted("میں یہ کام کل تک");
  h.onPartial("مکمل");
  h.onCommitted("مکمل کر دوں گا");
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const finals = events.filter((e) => e.type === "transcript.final");
  if (finals.length !== 1 || finals[0]?.type !== "transcript.final" || finals[0].text !== "میں یہ کام کل تک مکمل کر دوں گا") {
    throw new Error(`sentence merge failed: ${JSON.stringify(finals)}`);
  }
  const heldShown = events.some((e) => e.type === "transcript.partial" && e.text.startsWith("میں یہ کام کل تک مکمل"));
  if (!heldShown) throw new Error("the held fragment wasn't shown while waiting");

  // Fix: typed English replaces sentence 1 and is spoken as typed.
  pipeline.sayText("Sorry, I meant Friday, not tomorrow.", "en", 1);
  // Repeat: sentence 1 again.
  const repeated = pipeline.repeat(1);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  pipeline.stop();

  const typed = events.find((e) => e.type === "transcript.final" && e.typed);
  if (!typed || typed.type !== "transcript.final" || typed.replaces !== 1) throw new Error("Fix didn't create a typed replacement");
  const typedTranslation = events.find((e) => e.type === "translation" && e.segmentId === typed.segmentId);
  if (typedTranslation?.type !== "translation" || typedTranslation.text !== "Sorry, I meant Friday, not tomorrow.") {
    throw new Error("typed English should be spoken exactly as typed");
  }
  const ttsForOne = events.filter((e) => e.type === "tts.start" && e.segmentId === 1).length;
  if (!repeated || ttsForOne !== 2) throw new Error(`Repeat should speak sentence 1 twice (got ${ttsForOne})`);
  console.log("✓ accuracy: glossary → keyterms, verb-final pieces merged, Fix (typed English), Repeat");
}

await run("out", true);
await run("in", false);
await run("in", true);
await runAccuracy();
console.log("✓ pipeline smoke test passed");
