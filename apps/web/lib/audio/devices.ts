/**
 * Audio device helpers: finding the virtual cable, remembering the chosen output,
 * and checking browser support for sending sound to a specific device.
 */

/** Windows: "CABLE Input/Output (VB-Audio Virtual Cable)". macOS: "BlackHole 2ch". */
export const CABLE_PATTERN = /\b(CABLE|VB-Audio|BlackHole)\b/i;

const OUTPUT_KEY = "lct.outputDevice";
const SETUP_KEY = "lct.setupDone";

/** Chrome and Edge 110+ can route an AudioContext to any output (AudioContext.setSinkId). */
export function supportsOutputSelection(): boolean {
  return typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
}

/** Windows lists "default" and "communications" aliases; skip them to avoid duplicates. */
const isAlias = (d: MediaDeviceInfo) => d.deviceId === "default" || d.deviceId === "communications";

export async function listDevices(kind: "audioinput" | "audiooutput"): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === kind && !isAlias(d));
}

/** Labels are hidden until the site has microphone permission. */
export async function hasDeviceLabels(): Promise<boolean> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.some((d) => d.label !== "");
}

export function isCable(device: MediaDeviceInfo): boolean {
  return CABLE_PATTERN.test(device.label);
}

export async function findCable(): Promise<{ output: MediaDeviceInfo | null; input: MediaDeviceInfo | null }> {
  const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => !isAlias(d));
  return {
    output: all.find((d) => d.kind === "audiooutput" && isCable(d)) ?? null,
    input: all.find((d) => d.kind === "audioinput" && isCable(d)) ?? null,
  };
}

/** Briefly opens the mic so the browser reveals device names, then releases it. */
export async function requestDeviceLabels(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}

// Device ids are per-site random values (not fingerprintable across sites), so localStorage is fine.
export interface SavedOutput {
  id: string;
  label: string;
}

export function loadOutputChoice(): SavedOutput | null {
  try {
    const raw = window.localStorage.getItem(OUTPUT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SavedOutput>) : null;
    return parsed && typeof parsed.id === "string" && typeof parsed.label === "string" ? { id: parsed.id, label: parsed.label } : null;
  } catch {
    return null;
  }
}

export function saveOutputChoice(choice: SavedOutput | null): void {
  try {
    if (choice) window.localStorage.setItem(OUTPUT_KEY, JSON.stringify(choice));
    else window.localStorage.removeItem(OUTPUT_KEY);
  } catch {
    // storage disabled: the choice just isn't remembered
  }
}

/** Device ids can change (e.g. after reinstalling the cable); fall back to matching the label. */
export function resolveOutput(saved: SavedOutput | null, outputs: MediaDeviceInfo[]): MediaDeviceInfo | null {
  if (!saved) return null;
  return outputs.find((d) => d.deviceId === saved.id) ?? outputs.find((d) => d.label === saved.label) ?? null;
}

export function isSetupDone(): boolean {
  try {
    return window.localStorage.getItem(SETUP_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSetupDone(): void {
  try {
    window.localStorage.setItem(SETUP_KEY, "1");
  } catch {
    // ignore
  }
}
