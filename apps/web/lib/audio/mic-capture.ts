import { INPUT_FRAME_MS, INPUT_SAMPLE_RATE } from "@lct/protocol";

export interface MicCapture {
  setMuted(muted: boolean): void;
  stop(): Promise<void>;
}

interface MicCaptureOptions {
  /** Called every ~100 ms with 16 kHz mono PCM16 audio. */
  onFrame: (pcm16: ArrayBuffer) => void;
  /** Loudness 0..1 for the level meter. */
  onLevel?: (rms: number) => void;
  deviceId?: string;
}

type WorkletMessage = { type: "frame"; pcm: ArrayBuffer; rms: number } | { type: "error"; message: string };

/**
 * Opens the microphone and streams 16 kHz PCM frames.
 * The browser's built-in echo cancellation and noise suppression are the first line of
 * defence against background noise (Phase 4 adds stronger suppression and VAD tuning).
 */
export async function startMicCapture({ onFrame, onLevel, deviceId }: MicCaptureOptions): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const ctx = new AudioContext({ latencyHint: "interactive" });
  try {
    await ctx.audioWorklet.addModule("/worklets/pcm-capture-worklet.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { targetSampleRate: INPUT_SAMPLE_RATE, frameMs: INPUT_FRAME_MS },
    });
    // The worklet only runs if connected to the output; a zero gain keeps your own voice out of the speakers.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(node);
    node.connect(silent);
    silent.connect(ctx.destination);

    node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const message = event.data;
      if (message.type === "frame") {
        onFrame(message.pcm);
        onLevel?.(message.rms);
      } else {
        console.error("Microphone capture:", message.message);
      }
    };
    if (ctx.state === "suspended") await ctx.resume();

    let stopped = false;
    return {
      setMuted: (muted) => node.port.postMessage({ type: "mute", muted }),
      stop: async () => {
        if (stopped) return;
        stopped = true;
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        silent.disconnect();
        stream.getTracks().forEach((track) => track.stop()); // turns off the browser's mic indicator
        await ctx.close().catch(() => undefined);
      },
    };
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    await ctx.close().catch(() => undefined);
    throw err;
  }
}
