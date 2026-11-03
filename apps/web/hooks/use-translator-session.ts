"use client";

/**
 * Owns one call: mic → gateway → your voice into the call (via the virtual cable), and,
 * when shared, the call's sound → gateway → Urdu subtitles (+ optional Urdu voice for you).
 * Transcripts live only in this tab's memory and are gone when the tab closes.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Direction, PausePreset, ServerEvent } from "@lct/protocol";
import { NoSharedAudioError, startCallCapture, type CallSource } from "@/lib/audio/call-capture";
import { loadOutputChoice, saveOutputChoice, type SavedOutput } from "@/lib/audio/devices";
import { startMicCapture, type StreamCapture } from "@/lib/audio/mic-capture";
import { PcmPlayer } from "@/lib/audio/pcm-player";
import { DEFAULT_PREFS, loadPrefs, savePrefs } from "@/lib/prefs";
import { GatewayClient, GatewayError, errorForCloseCode, type GatewayErrorCode } from "@/lib/realtime/gateway-client";

export type SessionPhase = "idle" | "starting" | "live" | "error";
export type LiveStatus = "idle" | "connecting" | "listening" | "translating" | "speaking" | "muted";
export type IncomingPhase = "off" | "starting" | "on";
/** Error codes; the UI turns them into text in the chosen language. */
export type UiError = GatewayErrorCode | "mic_denied" | "mic_missing" | "mic_busy" | "share_no_audio" | "output_device";

export interface Segment {
  dir: Direction;
  /** Session number + direction + server segment id make a unique key across restarts. */
  session: number;
  id: number;
  original: string;
  translation: string | null;
  failed: "translation" | "tts" | null;
  delayMs: number | null;
  /** Entered with Fix rather than spoken. */
  typed: boolean;
  /** A later Fix replaced this sentence. */
  corrected: boolean;
}

interface State {
  phase: SessionPhase;
  session: number;
  segments: Segment[];
  partial: Record<Direction, string>;
  muted: boolean;
  playing: boolean;
  lastDelayMs: number | null;
  error: UiError | null;
  incoming: IncomingPhase;
  speakUrdu: boolean;
  urduVoiceAvailable: boolean;
  monitor: boolean;
  output: SavedOutput | null;
  pause: PausePreset;
  noiseGate: boolean;
}

type Action =
  | { type: "starting" }
  | { type: "live" }
  | { type: "stopped" }
  | { type: "failed"; error: UiError }
  | { type: "notice"; error: UiError | null }
  | { type: "ready"; urduVoiceAvailable: boolean }
  | { type: "partial"; dir: Direction; text: string }
  | { type: "final"; dir: Direction; id: number; text: string; typed: boolean; replaces?: number }
  | { type: "translated"; dir: Direction; id: number; text: string }
  | { type: "segmentFailed"; dir: Direction; id: number; stage: "translation" | "tts" }
  | { type: "audible"; id: number; delayMs: number }
  | { type: "playing"; playing: boolean }
  | { type: "muted"; muted: boolean }
  | { type: "incoming"; phase: IncomingPhase }
  | { type: "speakUrdu"; value: boolean }
  | { type: "monitor"; value: boolean }
  | { type: "output"; value: SavedOutput | null }
  | { type: "prefs"; pause: PausePreset; noiseGate: boolean }
  | { type: "clear" };

const MAX_SEGMENTS = 300;
const NO_PARTIAL: Record<Direction, string> = { out: "", in: "" };

const initialState: State = {
  phase: "idle",
  session: 0,
  segments: [],
  partial: NO_PARTIAL,
  muted: false,
  playing: false,
  lastDelayMs: null,
  error: null,
  incoming: "off",
  speakUrdu: false,
  urduVoiceAvailable: false,
  monitor: false,
  output: null,
  pause: DEFAULT_PREFS.pause,
  noiseGate: DEFAULT_PREFS.noiseGate,
};

function patchSegment(state: State, dir: Direction, id: number, patch: Partial<Segment>): Segment[] {
  return state.segments.map((seg) =>
    seg.session === state.session && seg.dir === dir && seg.id === id ? { ...seg, ...patch } : seg,
  );
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "starting":
      return { ...state, phase: "starting", session: state.session + 1, error: null, partial: NO_PARTIAL, playing: false };
    case "live":
      return { ...state, phase: "live" };
    case "stopped":
      return { ...state, phase: "idle", partial: NO_PARTIAL, playing: false, incoming: "off" };
    case "failed":
      return { ...state, phase: "error", partial: NO_PARTIAL, playing: false, incoming: "off", error: action.error };
    case "notice":
      return { ...state, error: action.error };
    case "ready":
      return { ...state, urduVoiceAvailable: action.urduVoiceAvailable };
    case "partial":
      return { ...state, partial: { ...state.partial, [action.dir]: action.text } };
    case "final": {
      const segment: Segment = {
        dir: action.dir,
        session: state.session,
        id: action.id,
        original: action.text,
        translation: null,
        failed: null,
        delayMs: null,
        typed: action.typed,
        corrected: false,
      };
      const segments = action.replaces
        ? patchSegment(state, action.dir, action.replaces, { corrected: true })
        : state.segments;
      return {
        ...state,
        // A typed sentence doesn't end what you're currently saying.
        partial: action.typed ? state.partial : { ...state.partial, [action.dir]: "" },
        segments: [...segments, segment].slice(-MAX_SEGMENTS),
      };
    }
    case "translated":
      return { ...state, segments: patchSegment(state, action.dir, action.id, { translation: action.text }) };
    case "segmentFailed":
      return { ...state, segments: patchSegment(state, action.dir, action.id, { failed: action.stage }) };
    case "audible":
      return { ...state, lastDelayMs: action.delayMs, segments: patchSegment(state, "out", action.id, { delayMs: action.delayMs }) };
    case "playing":
      return { ...state, playing: action.playing };
    case "muted":
      return { ...state, muted: action.muted };
    case "incoming":
      return { ...state, incoming: action.phase, partial: action.phase === "off" ? { ...state.partial, in: "" } : state.partial };
    case "speakUrdu":
      return { ...state, speakUrdu: action.value };
    case "monitor":
      return { ...state, monitor: action.value };
    case "output":
      return { ...state, output: action.value };
    case "prefs":
      return { ...state, pause: action.pause, noiseGate: action.noiseGate };
    case "clear":
      return { ...state, segments: [], partial: NO_PARTIAL, lastDelayMs: null };
  }
}

function deriveStatus(state: State): LiveStatus {
  if (state.phase === "starting") return "connecting";
  if (state.phase !== "live") return "idle";
  if (state.playing) return "speaking";
  if (state.segments.some((s) => s.session === state.session && s.dir === "out" && s.translation === null && !s.failed)) {
    return "translating";
  }
  if (state.muted) return "muted";
  return "listening";
}

function startError(err: unknown): UiError {
  if (err instanceof GatewayError) return err.code;
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") return "mic_denied";
    if (err.name === "NotFoundError" || err.name === "OverconstrainedError") return "mic_missing";
    if (err.name === "NotReadableError") return "mic_busy";
  }
  return "connection";
}

interface Runtime {
  client: GatewayClient | null;
  mic: StreamCapture | null;
  callCapture: StreamCapture | null;
  /** Your translated English → the chosen output (normally the virtual cable). */
  outPlayer: PcmPlayer | null;
  /** Optional copy of your English in your own headphones. */
  monitorPlayer: PcmPlayer | null;
  /** The client's words in Urdu → your default output (headphones). */
  inPlayer: PcmPlayer | null;
  /** When each final transcript reached the browser, for the delay measurement. */
  finalAt: Map<number, number>;
  vadSilenceMs: number;
  muted: boolean;
  speakUrdu: boolean;
  monitor: boolean;
  output: SavedOutput | null;
  pause: PausePreset;
  noiseGate: boolean;
  lastServerError: GatewayErrorCode | null;
  /** Bumped on every teardown so late callbacks from an old session are ignored. */
  generation: number;
}

export function useTranslatorSession() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const runtime = useRef<Runtime>({
    client: null,
    mic: null,
    callCapture: null,
    outPlayer: null,
    monitorPlayer: null,
    inPlayer: null,
    finalAt: new Map(),
    vadSilenceMs: 0,
    muted: false,
    speakUrdu: false,
    monitor: false,
    output: null,
    pause: DEFAULT_PREFS.pause,
    noiseGate: DEFAULT_PREFS.noiseGate,
    lastServerError: null,
    generation: 0,
  });
  const levelListeners = useRef(new Set<(level: number) => void>());

  // The output device chosen in the setup wizard (or earlier) on this computer.
  useEffect(() => {
    const saved = loadOutputChoice();
    runtime.current.output = saved;
    dispatch({ type: "output", value: saved });
    const prefs = loadPrefs();
    runtime.current.pause = prefs.pause;
    runtime.current.noiseGate = prefs.noiseGate;
    dispatch({ type: "prefs", ...prefs });
  }, []);

  const teardown = useCallback(() => {
    const r = runtime.current;
    r.generation += 1;
    const { client, mic, callCapture, outPlayer, monitorPlayer, inPlayer } = r;
    r.client = null;
    r.mic = null;
    r.callCapture = null;
    r.outPlayer = null;
    r.monitorPlayer = null;
    r.inPlayer = null;
    r.finalAt.clear();
    client?.close();
    outPlayer?.close();
    monitorPlayer?.close();
    inPlayer?.close();
    void mic?.stop();
    void callCapture?.stop();
  }, []);

  const handleEvent = useCallback((event: ServerEvent) => {
    const r = runtime.current;
    switch (event.type) {
      case "session.started":
        if (event.vadSilenceMs !== undefined) r.vadSilenceMs = event.vadSilenceMs; // the pause preset actually used
        dispatch({ type: "live" });
        break;
      case "incoming.started":
        dispatch({ type: "incoming", phase: "on" });
        break;
      case "transcript.partial":
        dispatch({ type: "partial", dir: event.dir, text: event.text });
        break;
      case "transcript.final":
        // Typed sentences have no "you stopped talking" moment, so no delay is measured for them.
        if (event.dir === "out" && !event.typed) r.finalAt.set(event.segmentId, performance.now());
        dispatch({
          type: "final",
          dir: event.dir,
          id: event.segmentId,
          text: event.text,
          typed: Boolean(event.typed),
          replaces: event.replaces,
        });
        break;
      case "translation":
        dispatch({ type: "translated", dir: event.dir, id: event.segmentId, text: event.text });
        break;
      case "segment.error":
        dispatch({ type: "segmentFailed", dir: event.dir, id: event.segmentId, stage: event.stage });
        break;
      case "tts.start":
        if (event.dir === "out") {
          r.outPlayer?.beginSegment(event.segmentId, event.sampleRate);
          r.monitorPlayer?.beginSegment(event.segmentId, event.sampleRate);
        } else {
          r.inPlayer?.beginSegment(event.segmentId, event.sampleRate);
        }
        break;
      case "latency":
        if (process.env.NODE_ENV !== "production") console.debug(`[latency] ${event.dir} sentence ${event.segmentId}`, event.stages);
        break;
      case "error":
        r.lastServerError = event.code;
        break;
      case "ready":
      case "incoming.stopped":
      case "tts.end":
        break;
    }
  }, []);

  const start = useCallback(async () => {
    const r = runtime.current;
    if (r.client || r.mic || r.outPlayer) return;
    const generation = ++r.generation;
    const stale = () => runtime.current.generation !== generation;
    r.lastServerError = null;
    dispatch({ type: "starting" });

    try {
      // Audio contexts are created inside the click so browsers allow playback.
      const outPlayer = new PcmPlayer({
        onPlayingChange: (playing) => dispatch({ type: "playing", playing }),
        onSegmentAudible: (segmentId) => {
          const receivedAt = r.finalAt.get(segmentId);
          r.finalAt.delete(segmentId);
          if (receivedAt === undefined) return;
          // Delay the client experiences after you stop talking = pause detection + everything after it.
          const delayMs = Math.round(performance.now() - receivedAt + r.vadSilenceMs);
          dispatch({ type: "audible", id: segmentId, delayMs });
          r.client?.send({ type: "client.metrics", segmentId, playbackDelayMs: Math.min(delayMs, 120_000) });
        },
      });
      r.outPlayer = outPlayer;
      await outPlayer.resume();
      if (r.output) {
        await outPlayer.setOutputDevice(r.output.id).catch(() => dispatch({ type: "notice", error: "output_device" }));
      }
      r.inPlayer = new PcmPlayer();
      await r.inPlayer.resume();
      if (r.monitor) {
        r.monitorPlayer = new PcmPlayer();
        await r.monitorPlayer.resume();
      }

      // Ask for the microphone before opening a (paid) speech-to-text session.
      const mic = await startMicCapture({
        onFrame: (pcm) => runtime.current.client?.sendAudio("out", pcm),
        onLevel: (level) => levelListeners.current.forEach((listener) => listener(level)),
        gate: r.noiseGate,
      });
      if (stale()) {
        void mic.stop();
        return;
      }
      r.mic = mic;
      mic.setMuted(r.muted);

      const client = new GatewayClient({
        onEvent: handleEvent,
        onAudio: (dir, pcm) => {
          const now = runtime.current;
          if (dir === "out") {
            now.outPlayer?.enqueue(pcm);
            now.monitorPlayer?.enqueue(pcm);
          } else {
            now.inPlayer?.enqueue(pcm);
          }
        },
        onClose: ({ code }) => {
          if (stale()) return; // we closed it ourselves
          const error = runtime.current.lastServerError ?? errorForCloseCode(code);
          teardown();
          dispatch({ type: "failed", error });
        },
      });
      r.client = client;
      const ready = await client.connect();
      if (stale()) return;
      r.vadSilenceMs = ready.vadSilenceMs;
      dispatch({ type: "ready", urduVoiceAvailable: ready.urduVoiceAvailable });
      client.startSession(r.pause);
    } catch (err) {
      if (stale()) return;
      teardown();
      dispatch({ type: "failed", error: startError(err) });
    }
  }, [handleEvent, teardown]);

  const stop = useCallback(() => {
    runtime.current.client?.send({ type: "session.stop" });
    teardown();
    dispatch({ type: "stopped" });
  }, [teardown]);

  const stopIncoming = useCallback(() => {
    const r = runtime.current;
    const capture = r.callCapture;
    r.callCapture = null;
    void capture?.stop();
    r.client?.stopIncoming();
    r.inPlayer?.stop();
    dispatch({ type: "incoming", phase: "off" });
  }, []);

  /** Ask the browser to share a tab or the screen, then translate that audio into Urdu. */
  const startIncoming = useCallback(
    async (source: CallSource) => {
      const r = runtime.current;
      if (!r.client || r.callCapture) return;
      const generation = r.generation;
      dispatch({ type: "incoming", phase: "starting" });
      dispatch({ type: "notice", error: null });
      try {
        const capture = await startCallCapture(source, {
          onFrame: (pcm) => runtime.current.client?.sendAudio("in", pcm),
          onEnded: () => stopIncoming(), // the browser's "Stop sharing" button
        });
        if (runtime.current.generation !== generation || !runtime.current.client) {
          void capture.stop();
          return;
        }
        r.callCapture = capture;
        r.client.startIncoming(r.speakUrdu);
      } catch (err) {
        dispatch({ type: "incoming", phase: "off" });
        // Closing the share picker isn't an error worth showing.
        if (err instanceof NoSharedAudioError) dispatch({ type: "notice", error: "share_no_audio" });
      }
    },
    [stopIncoming],
  );

  const setSpeakUrdu = useCallback((value: boolean) => {
    const r = runtime.current;
    r.speakUrdu = value;
    dispatch({ type: "speakUrdu", value });
    if (r.callCapture && r.client) {
      // Restart the client direction with the new setting (the gateway handles stop → start in order).
      r.inPlayer?.stop();
      r.client.stopIncoming();
      r.client.startIncoming(value);
    }
  }, []);

  const setMonitor = useCallback(async (value: boolean) => {
    const r = runtime.current;
    r.monitor = value;
    dispatch({ type: "monitor", value });
    if (value && r.outPlayer && !r.monitorPlayer) {
      const player = new PcmPlayer();
      await player.resume();
      r.monitorPlayer = player;
    } else if (!value && r.monitorPlayer) {
      r.monitorPlayer.close();
      r.monitorPlayer = null;
    }
  }, []);

  const setOutput = useCallback(async (choice: SavedOutput | null) => {
    const r = runtime.current;
    r.output = choice;
    saveOutputChoice(choice);
    dispatch({ type: "output", value: choice });
    dispatch({ type: "notice", error: null });
    if (r.outPlayer) {
      await r.outPlayer.setOutputDevice(choice?.id ?? "").catch(() => dispatch({ type: "notice", error: "output_device" }));
    }
  }, []);

  /** Pause length applies from the next Start; the noise gate switches immediately. */
  const setPrefs = useCallback((prefs: { pause?: PausePreset; noiseGate?: boolean }) => {
    const r = runtime.current;
    if (prefs.pause) r.pause = prefs.pause;
    if (prefs.noiseGate !== undefined) {
      r.noiseGate = prefs.noiseGate;
      r.mic?.setGate(prefs.noiseGate);
    }
    savePrefs({ pause: r.pause, noiseGate: r.noiseGate });
    dispatch({ type: "prefs", pause: r.pause, noiseGate: r.noiseGate });
  }, []);

  /** Fix: speak a typed sentence instead (replacing a mistranslated one). */
  const say = useCallback((text: string, lang: "ur" | "en", replaces?: number) => {
    runtime.current.client?.send({ type: "segment.say", text, lang, ...(replaces ? { replaces } : {}) });
  }, []);

  /** Repeat: speak one of your sentences again. */
  const repeat = useCallback((segmentId: number) => {
    runtime.current.client?.send({ type: "segment.repeat", segmentId });
  }, []);

  const toggleMute = useCallback(() => {
    const r = runtime.current;
    r.muted = !r.muted;
    r.mic?.setMuted(r.muted);
    dispatch({ type: "muted", muted: r.muted });
  }, []);

  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const dismissError = useCallback(() => dispatch({ type: "notice", error: null }), []);

  /** The level meter subscribes directly, so 10 updates a second don't re-render the transcript. */
  const subscribeLevel = useCallback((listener: (level: number) => void) => {
    levelListeners.current.add(listener);
    return () => {
      levelListeners.current.delete(listener);
    };
  }, []);

  // Release the mic, the share and the socket if the component unmounts mid-call.
  useEffect(() => teardown, [teardown]);

  return {
    ...state,
    status: deriveStatus(state),
    start,
    stop,
    toggleMute,
    clear,
    dismissError,
    subscribeLevel,
    startIncoming,
    stopIncoming,
    setSpeakUrdu,
    setMonitor,
    setOutput,
    setPrefs,
    say,
    repeat,
  };
}
