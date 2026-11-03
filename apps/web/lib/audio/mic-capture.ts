import { INPUT_FRAME_MS, INPUT_SAMPLE_RATE } from "@lct/protocol";
import { CABLE_PATTERN, isCable } from "./devices";

export interface StreamCapture {
  setMuted(muted: boolean): void;
  /** Noise gate: silence between words instead of room noise (see the worklet). */
  setGate(enabled: boolean): void;
  stop(): Promise<void>;
}

interface CaptureOptions {
  /** Called every ~100 ms with 16 kHz mono PCM16 audio. */
  onFrame: (pcm16: ArrayBuffer) => void;
  /** Loudness 0..1 for the level meter. */
  onLevel?: (rms: number) => void;
  /** Start with the noise gate on (default) or off. */
  gate?: boolean;
}

type WorkletMessage = { type: "frame"; pcm: ArrayBuffer; rms: number } | { type: "error"; message: string };

/**
 * Turns any audio MediaStream (microphone, shared tab, shared screen) into 16 kHz PCM frames.
 * The stream's tracks are stopped when the capture stops.
 */
export async function startStreamCapture(stream: MediaStream, { onFrame, onLevel, gate = true }: CaptureOptions): Promise<StreamCapture> {
  const ctx = new AudioContext({ latencyHint: "interactive" });
  try {
    await ctx.audioWorklet.addModule("/worklets/pcm-capture-worklet.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { targetSampleRate: INPUT_SAMPLE_RATE, frameMs: INPUT_FRAME_MS, gate },
    });
    // The worklet only runs if connected to the output; a zero gain keeps the audio out of the speakers.
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
        console.error("Audio capture:", message.message);
      }
    };
    if (ctx.state === "suspended") await ctx.resume();

    let stopped = false;
    return {
      setMuted: (muted) => node.port.postMessage({ type: "mute", muted }),
      setGate: (enabled) => node.port.postMessage({ type: "gate", enabled }),
      stop: async () => {
        if (stopped) return;
        stopped = true;
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        silent.disconnect();
        stream.getTracks().forEach((track) => track.stop()); // turns off the browser's capture indicator
        await ctx.close().catch(() => undefined);
      },
    };
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    await ctx.close().catch(() => undefined);
    throw err;
  }
}

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Opens the user's REAL microphone. If the system default input is the virtual cable (people
 * set that for WhatsApp desktop), we'd be listening to our own translated English and
 * translating it again, so we switch to the first input that isn't a cable.
 * The browser's echo cancellation and noise suppression are the first line of defence.
 */
export async function startMicCapture(options: CaptureOptions): Promise<StreamCapture> {
  let stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
  const label = stream.getAudioTracks()[0]?.label ?? "";
  if (CABLE_PATTERN.test(label)) {
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications" && !isCable(d),
    );
    stream.getTracks().forEach((t) => t.stop());
    const real = inputs[0];
    if (!real) throw new DOMException("Only a virtual cable is available as a microphone", "NotFoundError");
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...MIC_CONSTRAINTS, deviceId: { exact: real.deviceId } } });
  }
  return startStreamCapture(stream, options);
}
