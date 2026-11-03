/**
 * Records voice-cloning samples with MediaRecorder (compressed Opus/AAC, ~96 kbps).
 *
 * Unlike call capture, browser echo cancellation, noise suppression and auto-gain are OFF:
 * they reshape the voice, and the clone would copy those artefacts. Instead we measure level
 * and clipping ourselves and ask the user to re-record a bad take.
 */
export interface Clip {
  blob: Blob;
  /** Object URL for the preview player; revoke with URL.revokeObjectURL when done. */
  url: string;
  seconds: number;
  /** 0..1 */
  peak: number;
  /** Average loudness while recording, 0..1 */
  rms: number;
}

export type ClipProblem = "too_short" | "too_quiet" | "clipping";

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

export function checkClip(clip: Clip): ClipProblem | null {
  if (clip.seconds < 1.5) return "too_short";
  if (clip.rms < 0.012) return "too_quiet";
  if (clip.peak >= 0.99) return "clipping";
  return null;
}

export class SampleRecorder {
  private recorder: MediaRecorder | null = null;
  private frame = 0;
  private autoStop: number | undefined;

  private constructor(
    private readonly stream: MediaStream,
    private readonly ctx: AudioContext,
    private readonly analyser: AnalyserNode,
    readonly mimeType: string,
  ) {}

  static async open(): Promise<SampleRecorder> {
    const mimeType = PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) throw new Error("This browser can't record compressed audio. Use a current Chrome, Edge, Firefox or Safari.");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser); // analysis only; nothing is played back
    return new SampleRecorder(stream, ctx, analyser, mimeType);
  }

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  /** Starts a take. Resolves when stop() is called or maxSeconds is reached. */
  record(onLevel: (rms: number) => void, maxSeconds: number): Promise<Clip> {
    if (this.recording) throw new Error("Already recording");
    const recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType, audioBitsPerSecond: 96_000 });
    this.recorder = recorder;

    const chunks: Blob[] = [];
    const buffer = new Float32Array(this.analyser.fftSize);
    let peak = 0;
    let sumRms = 0;
    let frames = 0;
    const startedAt = performance.now();

    const measure = () => {
      this.analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) {
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / buffer.length);
      sumRms += rms;
      frames += 1;
      onLevel(rms);
      this.frame = requestAnimationFrame(measure);
    };

    return new Promise<Clip>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("Recording failed"));
      recorder.onstop = () => {
        cancelAnimationFrame(this.frame);
        window.clearTimeout(this.autoStop);
        onLevel(0);
        const blob = new Blob(chunks, { type: this.mimeType.split(";")[0] });
        resolve({
          blob,
          url: URL.createObjectURL(blob),
          seconds: (performance.now() - startedAt) / 1000,
          peak,
          rms: frames ? sumRms / frames : 0,
        });
      };
      recorder.start();
      this.frame = requestAnimationFrame(measure);
      this.autoStop = window.setTimeout(() => this.stop(), maxSeconds * 1000);
    });
  }

  stop(): void {
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  async close(): Promise<void> {
    this.stop();
    cancelAnimationFrame(this.frame);
    this.stream.getTracks().forEach((track) => track.stop()); // turns off the mic indicator
    await this.ctx.close().catch(() => undefined);
  }
}
