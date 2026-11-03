/** Accuracy preferences, remembered on this device (no personal data). */
import { PausePreset } from "@lct/protocol";

export interface Prefs {
  pause: PausePreset;
  noiseGate: boolean;
}

const KEY = "lct.prefs";
export const DEFAULT_PREFS: Prefs = { pause: "normal", noiseGate: true };

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Record<keyof Prefs, unknown>>;
    const pause = PausePreset.safeParse(raw.pause);
    return {
      pause: pause.success ? pause.data : DEFAULT_PREFS.pause,
      noiseGate: typeof raw.noiseGate === "boolean" ? raw.noiseGate : DEFAULT_PREFS.noiseGate,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // storage disabled: preferences just aren't remembered
  }
}
