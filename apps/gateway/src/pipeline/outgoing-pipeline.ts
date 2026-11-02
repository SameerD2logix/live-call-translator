/**
 * Outgoing direction: user's Urdu speech -> English speech in the user's voice.
 *
 *   mic PCM -> STT (partials + committed sentences)
 *           -> translate each committed sentence  (runs as soon as the sentence is final)
 *           -> TTS, strictly in sentence order     (so audio never plays out of order)
 *
 * Nothing here is stored. Transcripts live in memory for the current call only
 * (the last few sentences are kept as translation context) and are never logged.
 */
import {
  INPUT_SAMPLE_RATE,
  MAX_SEGMENT_CHARS,
  TTS_SAMPLE_RATE,
  type ServerEvent,
} from "@lct/protocol";
import type { Logger } from "pino";
import { errorSummary } from "../lib/errors";
import { LatencyTracker } from "../lib/latency";
import type { Providers } from "../providers";
import { ProviderError, type LanguageCode, type SttStream } from "../providers/types";

const CONTEXT_SENTENCES = 3;

export interface OutgoingPipelineOptions {
  providers: Providers;
  voiceId: string;
  vadSilenceMs: number;
  secondaryLanguages: LanguageCode[];
  glossary: string[];
  log: Logger;
  emit: (event: ServerEvent) => void;
  emitAudio: (pcm: Buffer) => void;
  /** Called once when a provider fails in a way the session can't recover from. */
  onFatal: (error: ProviderError) => void;
}

export class OutgoingPipeline {
  private stt: SttStream | null = null;
  private sequence = 0;
  private speechStartedAt: number | null = null;
  private readonly history: Array<{ source: string; target: string }> = [];
  private speakQueue: Promise<void> = Promise.resolve();
  private readonly abort = new AbortController();
  private stopped = false;

  constructor(private readonly o: OutgoingPipelineOptions) {}

  /** Opens the STT stream. Resolves when it's ready; on failure the pipeline stops itself. */
  async start(): Promise<void> {
    const sttId = this.o.providers.stt.id;
    this.stt = this.o.providers.stt.open({
      language: "ur",
      secondaryLanguages: this.o.secondaryLanguages,
      sampleRate: INPUT_SAMPLE_RATE,
      keyterms: [], // Phase 4: glossary terms
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
    this.abort.abort();
    this.stt?.close();
    this.stt = null;
  }

  private onPartial(text: string): void {
    if (this.stopped || !text) return;
    this.speechStartedAt ??= performance.now();
    this.o.emit({ type: "transcript.partial", text: text.slice(0, MAX_SEGMENT_CHARS) });
  }

  private onCommitted(raw: string): void {
    const startedAt = this.speechStartedAt;
    this.speechStartedAt = null;
    const text = raw.trim().slice(0, MAX_SEGMENT_CHARS);
    if (this.stopped || !text) return;

    const segmentId = ++this.sequence;
    const latency = new LatencyTracker();
    if (startedAt !== null) latency.markAt("speech_start", startedAt);
    latency.mark("committed");
    this.o.emit({ type: "transcript.final", segmentId, text });

    // Translate right away (in parallel with any sentence still being spoken)...
    const translation = this.translate(segmentId, text, latency);
    // ...but speak strictly in order. translate() and speak() never reject, so the chain can't break.
    this.speakQueue = this.speakQueue.then(async () => {
      const english = await translation;
      if (english && !this.stopped) await this.speak(segmentId, english, latency);
    });
  }

  private async translate(segmentId: number, text: string, latency: LatencyTracker): Promise<string | null> {
    try {
      const english = await this.o.providers.translation.translate(
        {
          text,
          source: "ur",
          target: "en",
          context: this.history.slice(-CONTEXT_SENTENCES),
          glossary: this.o.glossary,
        },
        this.abort.signal,
      );
      latency.mark("translated");
      if (this.stopped) return null;

      this.history.push({ source: text, target: english });
      if (this.history.length > CONTEXT_SENTENCES) this.history.shift();
      this.o.emit({ type: "translation", segmentId, text: english });
      return english;
    } catch (err) {
      if (this.stopped) return null;
      this.o.log.warn({ segmentId, err: errorSummary(err) }, "translation failed");
      this.o.emit({ type: "segment.error", segmentId, stage: "translation", message: "Couldn't translate this sentence." });
      return null;
    }
  }

  private async speak(segmentId: number, text: string, latency: LatencyTracker): Promise<void> {
    latency.mark("tts_requested");
    this.o.emit({ type: "tts.start", segmentId, sampleRate: TTS_SAMPLE_RATE });
    try {
      let first = true;
      const audio = this.o.providers.tts.stream(
        { text, voiceId: this.o.voiceId, language: "en", sampleRate: TTS_SAMPLE_RATE },
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
      this.o.log.warn({ segmentId, err: errorSummary(err) }, "speech synthesis failed");
      this.o.emit({ type: "segment.error", segmentId, stage: "tts", message: "Couldn't play this sentence." });
    } finally {
      if (!this.stopped) {
        this.o.emit({ type: "tts.end", segmentId });
        const stages = latency.report(this.o.vadSilenceMs);
        this.o.emit({ type: "latency", segmentId, stages });
        this.o.log.info({ segmentId, ...stages }, "segment latency");
      }
    }
  }

  private fatal(error: ProviderError): void {
    if (this.stopped) return;
    this.o.log.error({ err: errorSummary(error) }, "provider failure, stopping pipeline");
    this.stop();
    this.o.onFatal(error);
  }
}
