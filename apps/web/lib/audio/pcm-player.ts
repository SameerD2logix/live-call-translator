import { TTS_SAMPLE_RATE } from "@lct/protocol";

interface PcmPlayerEvents {
  /** Fires when the first audio of a sentence actually becomes audible. */
  onSegmentAudible?: (segmentId: number) => void;
  onPlayingChange?: (playing: boolean) => void;
}

/**
 * Gapless playback of streamed PCM16 chunks.
 * Each chunk is scheduled to start exactly when the previous one ends.
 * Phase 3 routes this to the virtual audio cable with AudioContext.setSinkId().
 */
export class PcmPlayer {
  private readonly ctx = new AudioContext({ latencyHint: "interactive" });
  private nextStartTime = 0;
  private sampleRate = TTS_SAMPLE_RATE;
  private segmentId: number | null = null;
  private segmentAnnounced = false;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly timers = new Set<number>();

  constructor(private readonly events: PcmPlayerEvents = {}) {}

  resume(): Promise<void> {
    return this.ctx.resume();
  }

  beginSegment(segmentId: number, sampleRate: number): void {
    this.segmentId = segmentId;
    this.sampleRate = sampleRate;
    this.segmentAnnounced = false;
  }

  enqueue(chunk: ArrayBuffer): void {
    if (chunk.byteLength < 2 || this.ctx.state === "closed") return;

    const samples = new Int16Array(chunk, 0, chunk.byteLength >> 1);
    const floats = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;

    const buffer = this.ctx.createBuffer(1, floats.length, this.sampleRate);
    buffer.copyToChannel(floats, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    // A 40 ms cushion absorbs network jitter without adding noticeable delay.
    const startAt = Math.max(this.nextStartTime, now + 0.04);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    if (this.sources.size === 0) this.events.onPlayingChange?.(true);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.events.onPlayingChange?.(false);
    };

    if (!this.segmentAnnounced && this.segmentId !== null) {
      this.segmentAnnounced = true;
      const id = this.segmentId;
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        this.events.onSegmentAudible?.(id);
      }, Math.max(0, (startAt - now) * 1000));
      this.timers.add(timer);
    }
  }

  stop(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.nextStartTime = 0;
    this.events.onPlayingChange?.(false);
  }

  close(): void {
    this.stop();
    void this.ctx.close().catch(() => undefined);
  }
}
