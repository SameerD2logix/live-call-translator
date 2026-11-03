import { findCable, requestDeviceLabels, supportsOutputSelection } from "./devices";

export type CableTestResult = "ok" | "no_cable" | "silent" | "unsupported" | "denied";

/**
 * End-to-end check: play a quiet tone INTO the cable's output side and listen on its input
 * side (exactly what Zoom will hear). Nothing plays through the user's speakers.
 */
export async function testCable(): Promise<CableTestResult> {
  if (!supportsOutputSelection()) return "unsupported";
  try {
    await requestDeviceLabels();
  } catch {
    return "denied";
  }
  const cable = await findCable();
  if (!cable.output || !cable.input) return "no_cable";

  const listen = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: cable.input.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const listenCtx = new AudioContext();
  const playCtx = new AudioContext() as AudioContext & { setSinkId: (id: string) => Promise<void> };
  try {
    const analyser = listenCtx.createAnalyser();
    analyser.fftSize = 2048;
    listenCtx.createMediaStreamSource(listen).connect(analyser);

    await playCtx.setSinkId(cable.output.deviceId);
    const tone = playCtx.createOscillator();
    const gain = playCtx.createGain();
    tone.frequency.value = 440;
    gain.gain.value = 0.2;
    tone.connect(gain).connect(playCtx.destination);
    tone.start();

    // Listen for 1.5 s and keep the loudest moment.
    const buffer = new Float32Array(analyser.fftSize);
    let loudest = 0;
    const until = performance.now() + 1_500;
    while (performance.now() < until) {
      await new Promise((r) => setTimeout(r, 50));
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const v of buffer) sum += v * v;
      loudest = Math.max(loudest, Math.sqrt(sum / buffer.length));
    }
    tone.stop();
    return loudest > 0.01 ? "ok" : "silent";
  } finally {
    listen.getTracks().forEach((t) => t.stop());
    await Promise.allSettled([listenCtx.close(), playCtx.close()]);
  }
}
