import { startStreamCapture, type StreamCapture } from "./mic-capture";

export type CallSource = "tab" | "screen";

export class NoSharedAudioError extends Error {
  constructor() {
    super("The shared surface has no audio");
  }
}

/**
 * Captures the call's sound so the client's English can be translated for you.
 *
 *  - "tab": a browser tab running Meet, Zoom web or Teams web. Works in Chrome/Edge on every
 *    desktop OS; the user must tick "Also share tab audio".
 *  - "screen": the whole screen with system audio, for desktop apps (Zoom, Teams, WhatsApp).
 *    Chrome/Edge on Windows; on macOS Chrome 141+ with macOS 14.2+.
 *
 * restrictOwnAudio keeps THIS page's own playback (the Urdu voice, the monitor) out of a
 * system-audio capture, so we never translate ourselves. Processing is off: we want the
 * client's voice as it is. A tiny, slow video track is requested because browsers require
 * one; we never look at it.
 */
export async function startCallCapture(
  source: CallSource,
  options: { onFrame: (pcm16: ArrayBuffer) => void; onEnded: () => void },
): Promise<StreamCapture> {
  const constraints = {
    video: { frameRate: 1, width: 320, height: 180 },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false, // you still hear the call normally
      restrictOwnAudio: true,
    },
    systemAudio: "include",
    selfBrowserSurface: "exclude", // don't offer this translator tab itself
    surfaceSwitching: "include",
    preferCurrentTab: false,
    monitorTypeSurfaces: source === "tab" ? "exclude" : "include",
  } as DisplayMediaStreamOptions;

  const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
  const audio = stream.getAudioTracks()[0];
  if (!audio) {
    stream.getTracks().forEach((t) => t.stop());
    throw new NoSharedAudioError();
  }
  // Clicking the browser's "Stop sharing" bar ends the tracks; tell the session.
  audio.addEventListener("ended", options.onEnded, { once: true });
  // Keep only the audio for processing; the video track stays alive (stopping it can end the share).
  return startStreamCapture(stream, { onFrame: options.onFrame });
}
