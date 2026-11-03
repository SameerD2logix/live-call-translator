/**
 * One direction of live translation. A call runs up to two of these on the same socket:
 *
 *   "out": your mic (Urdu)       → STT → translate → TTS in YOUR cloned voice → the call (virtual cable)
 *   "in":  the call audio (English) → STT → translate → Urdu subtitles (+ optional Urdu voice for you)
 *
 *   audio → STT (partials + committed pieces)
 *         → sentence assembler (joins a piece cut before its verb with what follows; Phase 4)
 *         → translate each sentence (starts as soon as the sentence is final)
 *         → TTS, strictly in sentence order (audio never plays out of order)
 *
 * Phase 4 also adds Fix (speak a typed sentence instead) and Repeat (speak one again).
 *
 * Nothing is stored. Transcripts live in memory for the current call only (the last few
 * sentences are kept as translation context) and are never logged.
 */
import { INPUT_SAMPLE_RATE, MAX_SEGMENT_CHARS, TTS_SAMPLE_RATE, type Direction, type ServerEvent } from "@lct/protocol";
import type { Logger } from "pino";
import { errorSummary } from "../lib/errors";
import { LatencyTracker } from "../lib/latency";
import type { Providers } from "../providers";
import { ProviderError, type LanguageCode, type SttStream, type TtsProvider } from "../providers/types";
import { SentenceAssembler } from "./sentence-assembler";

const CONTEXT_SENTENCES = 3;
/** Recent translations kept (in memory, this call only) so Repeat can speak them again. */
const REPEATABLE_SENTENCES = 30;

export interface TranslationPipelineOptions {
  direction: Direction;
  source: LanguageCode;
  target: LanguageCode;
  providers: Pick<Providers, "stt" | "translation">;
  /** Speech output. Null = subtitles only. */
  speech: { tts: TtsProvider; voiceId: string } | null;
  vadSilenceMs: number;
  secondaryLanguages: LanguageCode[];
  glossary: string[];
  /** Also send the glossary to speech recognition as keyterms. */
  useKeyterms: boolean;
  /** Hold a sentence that ends mid-clause this long for its ending (0 = off). */
  mergeIncompleteMs: number;
  log: Logger;
  emit: (event: ServerEvent) => void;
  emitAudio: (pcm: Buffer) => void;
  /** Called once when a provider fails in a way this direction can't recover from. */
  onFatal: (error: ProviderError) => void;
}

export class TranslationPipeline {
  private stt: SttStream | null = null;
  private sequence = 0;
  private speechStartedAt: number | null = null;
  private readonly history: Array<{ source: string; target: string }> = [];
  private speakQueue: Promise<void> = Promise.resolve();
  private readonly abort = new AbortController();
  private stopped = false;
  private readonly assembler: SentenceAssembler;
  /** segmentId → translation, for Repeat. */
  private readonly spoken = new Map<number, string>();

  constructor(private readonly o: TranslationPipelineOptions) {
    this.assembler = new SentenceAssembler({
      language: o.source,
      maxHoldMs: o.mergeIncompleteMs,
      onSentence: (text) => this.processSentence(text, {}),
    });
  }

  get direction(): Direction {
    return this.o.direction;
  }

  /** Opens the STT stream. Resolves when it's ready; on failure the pipeline stops itself. */
  async start(): Promise<void> {
    const sttId = this.o.providers.stt.id;
    this.stt = this.o.providers.stt.open({
      language: this.o.source,
      secondaryLanguages: this.o.secondaryLanguages,
      sampleRate: INPUT_SAMPLE_RATE,
      vadSilenceSecs: this.o.vadSilenceMs / 1000,
      keyterms: this.o.useKeyterms ? this.o.glossary : [],
      handlers: {
        onPartial: (text) => this.onPartial(text),
        onCommitted: (text) => this.onCommitted(text),
        onError: (error) => this.fatal(error),
        onClose: () => this.fatal(new ProviderError(sttId, "unavailable", "Speech-to-text closed the stream.")),
      },
    });
    try {
      await this.stt.ready;
    } catch (err) {
      this.stop();
      throw err;
    }
  }

  pushAudio(pcm: Buffer): void {
    if (!this.stopped) this.stt?.sendAudio(pcm);
  }

  /** Stops immediately: closes STT and cancels any translation or speech in flight. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.assembler.dispose();
    this.abort.abort();
    this.stt?.close();
    this.stt = null;
  }

  /** Fix: speak a typed sentence. Urdu (the source) is translated first; English is spoken as typed. */
  sayText(text: string, lang: LanguageCode, replaces?: number): void {
    if (this.stopped) return;
    const clean = text.trim().slice(0, MAX_SEGMENT_CHARS);
    if (!clean || (lang !== this.o.source && lang !== this.o.target)) return;
    this.processSentence(clean, { typed: true, replaces, alreadyTranslated: lang === this.o.target });
  }

  /** Repeat: speak a recent sentence again. Returns false if it's no longer available. */
  repeat(segmentId: number): boolean {
    const text = this.spoken.get(segmentId);
    if (this.stopped || !text || !this.o.speech) return false;
    const latency = new LatencyTracker();
    latency.mark("committed");
    latency.mark("translated");
    this.speakQueue = this.speakQueue.then(() => this.speak(segmentId, text, latency));
    return true;
  }

  private onPartial(text: string): void {
    if (this.stopped || !text) return;
    this.speechStartedAt ??= performance.now();
    this.assembler.touch(); // still talking: keep waiting for a held sentence's ending
    const held = this.assembler.pending;
    const shown = held ? `${held} ${text}` : text;
    this.o.emit({ type: "transcript.partial", dir: this.o.direction, text: shown.slice(0, MAX_SEGMENT_CHARS) });
  }

  private onCommitted(raw: string): void {
    const text = raw.trim();
    if (this.stopped || !text) return;
    this.assembler.push(text);
    // If the piece is being held for its ending, keep showing it as in progress.
    const held = this.assembler.pending;
    if (held) this.o.emit({ type: "transcript.partial", dir: this.o.direction, text: held.slice(0, MAX_SEGMENT_CHARS) });
  }

  private processSentence(
    raw: string,
    opts: { typed?: boolean; replaces?: number; alreadyTranslated?: boolean },
  ): void {
    const startedAt = opts.typed ? null : this.speechStartedAt;
    if (!opts.typed) this.speechStartedAt = null;
    const text = raw.trim().slice(0, MAX_SEGMENT_CHARS);
    if (this.stopped || !text) return;

    const segmentId = ++this.sequence;
    const latency = new LatencyTracker();
    if (startedAt !== null) latency.markAt("speech_start", startedAt);
    latency.mark("committed");
    this.o.emit({
      type: "transcript.final",
      dir: this.o.direction,
      segmentId,
      text,
      ...(opts.typed ? { typed: true } : {}),
      ...(opts.replaces ? { replaces: opts.replaces } : {}),
    });

    // Translate right away (in parallel with any sentence still being spoken)...
    const translation = opts.alreadyTranslated
      ? Promise.resolve(this.accept(segmentId, text, text, latency))
      : this.translate(segmentId, text, latency);
    // ...but speak strictly in order. translate() and speak() never reject, so the chain can't break.
    this.speakQueue = this.speakQueue.then(async () => {
      const result = await translation;
      if (!result || this.stopped) return;
      if (this.o.speech) await this.speak(segmentId, result, latency);
      else this.reportLatency(segmentId, latency); // subtitles only: done once translated
    });
  }

  /** Records a finished translation and shows it. */
  private accept(segmentId: number, source: string, translated: string, latency: LatencyTracker): string {
    latency.mark("translated");
    this.history.push({ source, target: translated });
    if (this.history.length > CONTEXT_SENTENCES) this.history.shift();
    this.spoken.set(segmentId, translated);
    if (this.spoken.size > REPEATABLE_SENTENCES) this.spoken.delete(this.spoken.keys().next().value!);
    this.o.emit({ type: "translation", dir: this.o.direction, segmentId, text: translated });
    return translated;
  }

  private async translate(segmentId: number, text: string, latency: LatencyTracker): Promise<string | null> {
    try {
      const translated = await this.o.providers.translation.translate(
        {
          text,
          source: this.o.source,
          target: this.o.target,
          context: this.history.slice(-CONTEXT_SENTENCES),
          glossary: this.o.glossary,
        },
        this.abort.signal,
      );
      if (this.stopped) return null;
      return this.accept(segmentId, text, translated, latency);
    } catch (err) {
      if (this.stopped) return null;
      this.o.log.warn({ dir: this.o.direction, segmentId, err: errorSummary(err) }, "translation failed");
      this.o.emit({
        type: "segment.error",
        dir: this.o.direction,
        segmentId,
        stage: "translation",
        message: "Couldn't translate this sentence.",
      });
      return null;
    }
  }

  private async speak(segmentId: number, text: string, latency: LatencyTracker): Promise<void> {
    const speech = this.o.speech;
    if (!speech) return;
    const dir = this.o.direction;
    latency.mark("tts_requested");
    this.o.emit({ type: "tts.start", dir, segmentId, sampleRate: TTS_SAMPLE_RATE });
    try {
      let first = true;
      const audio = speech.tts.stream(
        { text, voiceId: speech.voiceId, language: this.o.target, sampleRate: TTS_SAMPLE_RATE },
        this.abort.signal,
      );
      for await (const chunk of audio) {
        if (this.stopped) return;
        if (first) {
          latency.mark("tts_first_audio");
          first = false;
        }
        this.o.emitAudio(chunk);
      }
      latency.mark("tts_done");
    } catch (err) {
      if (this.stopped) return;
      this.o.log.warn({ dir, segmentId, err: errorSummary(err) }, "speech synthesis failed");
      this.o.emit({ type: "segment.error", dir, segmentId, stage: "tts", message: "Couldn't play this sentence." });
    } finally {
      if (!this.stopped) {
        this.o.emit({ type: "tts.end", dir, segmentId });
        this.reportLatency(segmentId, latency);
      }
    }
  }

  private reportLatency(segmentId: number, latency: LatencyTracker): void {
    const stages = latency.report(this.o.vadSilenceMs);
    this.o.emit({ type: "latency", dir: this.o.direction, segmentId, stages });
    this.o.log.info({ dir: this.o.direction, segmentId, ...stages }, "segment latency");
  }

  private fatal(error: ProviderError): void {
    if (this.stopped) return;
    this.o.log.error({ dir: this.o.direction, err: errorSummary(error) }, "provider failure, stopping pipeline");
    this.stop();
    this.o.onFatal(error);
  }
}
