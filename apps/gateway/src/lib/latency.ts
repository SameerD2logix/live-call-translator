/**
 * Per-segment stopwatch. Each pipeline stage calls mark(); report() turns marks into
 * stage durations (milliseconds) that are logged and sent to the browser.
 */
export class LatencyTracker {
  private readonly marks = new Map<string, number>();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  markAt(name: string, at: number): void {
    this.marks.set(name, at);
  }

  private between(from: string, to: string): number | undefined {
    const a = this.marks.get(from);
    const b = this.marks.get(to);
    return a !== undefined && b !== undefined ? Math.round(b - a) : undefined;
  }

  /**
   * Stage names:
   *  vad_silence_ms      pause the STT waits for before it ends a sentence (configured)
   *  speech_ms           first partial -> committed (how long the person spoke; informational)
   *  translate_ms        committed -> translation ready
   *  tts_queue_ms        translation ready -> TTS started (waiting for the previous sentence)
   *  tts_first_audio_ms  TTS started -> first audio byte
   *  tts_total_ms        TTS started -> last audio byte
   *  server_ms           committed -> first audio byte (everything the gateway adds)
   *  est_delay_ms        vad_silence_ms + server_ms (gateway-side estimate of delay after you stop talking)
   */
  report(vadSilenceMs: number): Record<string, number> {
    const out: Record<string, number> = { vad_silence_ms: vadSilenceMs };
    const add = (name: string, value: number | undefined) => {
      if (value !== undefined) out[name] = value;
    };
    add("speech_ms", this.between("speech_start", "committed"));
    add("translate_ms", this.between("committed", "translated"));
    add("tts_queue_ms", this.between("translated", "tts_requested"));
    add("tts_first_audio_ms", this.between("tts_requested", "tts_first_audio"));
    add("tts_total_ms", this.between("tts_requested", "tts_done"));
    const server = this.between("committed", "tts_first_audio");
    add("server_ms", server);
    if (server !== undefined) out.est_delay_ms = vadSilenceMs + server;
    return out;
  }
}
