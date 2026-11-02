"use client";

/**
 * Owns one translation session: mic -> gateway -> player, plus all UI state.
 * Transcripts live only in this tab's memory and are gone when the tab closes.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { CloseCode, type ServerEvent } from "@lct/protocol";
import { startMicCapture, type MicCapture } from "@/lib/audio/mic-capture";
import { PcmPlayer } from "@/lib/audio/pcm-player";
import { GatewayClient, GatewayError } from "@/lib/realtime/gateway-client";

export type SessionPhase = "idle" | "starting" | "live" | "error";
export type LiveStatus = "idle" | "connecting" | "listening" | "translating" | "speaking" | "muted";

export interface Segment {
  /** Session number + server segment id make a unique key across restarts. */
  session: number;
  id: number;
  urdu: string;
  english: string | null;
  failed: "translation" | "tts" | null;
  delayMs: number | null;
}

interface State {
  phase: SessionPhase;
  session: number;
  segments: Segment[];
  partial: string;
  muted: boolean;
  playing: boolean;
  lastDelayMs: number | null;
  error: string | null;
}

type Action =
  | { type: "starting" }
  | { type: "live" }
  | { type: "stopped" }
  | { type: "failed"; message: string }
  | { type: "partial"; text: string }
  | { type: "final"; id: number; text: string }
  | { type: "translated"; id: number; text: string }
  | { type: "segmentFailed"; id: number; stage: "translation" | "tts" }
  | { type: "audible"; id: number; delayMs: number }
  | { type: "playing"; playing: boolean }
  | { type: "muted"; muted: boolean }
  | { type: "clear" };

const MAX_SEGMENTS = 200;

const initialState: State = {
  phase: "idle",
  session: 0,
  segments: [],
  partial: "",
  muted: false,
  playing: false,
  lastDelayMs: null,
  error: null,
};

function patchSegment(state: State, id: number, patch: Partial<Segment>): Segment[] {
  return state.segments.map((seg) => (seg.session === state.session && seg.id === id ? { ...seg, ...patch } : seg));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "starting":
      return { ...state, phase: "starting", session: state.session + 1, error: null, partial: "", playing: false };
    case "live":
      return { ...state, phase: "live" };
    case "stopped":
      return { ...state, phase: "idle", partial: "", playing: false };
    case "failed":
      return { ...state, phase: "error", partial: "", playing: false, error: action.message };
    case "partial":
      return { ...state, partial: action.text };
    case "final": {
      const segment: Segment = { session: state.session, id: action.id, urdu: action.text, english: null, failed: null, delayMs: null };
      return { ...state, partial: "", segments: [...state.segments, segment].slice(-MAX_SEGMENTS) };
    }
    case "translated":
      return { ...state, segments: patchSegment(state, action.id, { english: action.text }) };
    case "segmentFailed":
      return { ...state, segments: patchSegment(state, action.id, { failed: action.stage }) };
    case "audible":
      return { ...state, lastDelayMs: action.delayMs, segments: patchSegment(state, action.id, { delayMs: action.delayMs }) };
    case "playing":
      return { ...state, playing: action.playing };
    case "muted":
      return { ...state, muted: action.muted };
    case "clear":
      return { ...state, segments: [], partial: "", lastDelayMs: null };
  }
}

function deriveStatus(state: State): LiveStatus {
  if (state.phase === "starting") return "connecting";
  if (state.phase !== "live") return "idle";
  if (state.playing) return "speaking";
  if (state.segments.some((s) => s.session === state.session && s.english === null && !s.failed)) return "translating";
  if (state.muted) return "muted";
  return "listening";
}

function closeMessage(code: number): string {
  switch (code) {
    case CloseCode.unauthorized:
      return "Your session expired. Press Start to reconnect.";
    case CloseCode.sessionLimit:
      return "A session is already open in another tab or window.";
    case CloseCode.quotaExceeded:
      return "You've used today's translation minutes.";
    default:
      return "The connection to the translation server dropped. Press Start to reconnect.";
  }
}

function startErrorMessage(err: unknown): string {
  if (err instanceof GatewayError) return err.message;
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") return "Microphone access is blocked. Allow it from the icon in the address bar, then press Start.";
    if (err.name === "NotFoundError") return "No microphone found. Connect one, then press Start.";
    if (err.name === "NotReadableError") return "Another app is using your microphone. Close it, then press Start.";
  }
  return "Couldn't start translating. Press Start to try again.";
}

interface Runtime {
  client: GatewayClient | null;
  mic: MicCapture | null;
  player: PcmPlayer | null;
  /** When each final transcript reached the browser, for the delay measurement. */
  finalAt: Map<number, number>;
  vadSilenceMs: number;
  muted: boolean;
  lastServerError: string | null;
  /** Bumped on every teardown so late callbacks from an old session are ignored. */
  generation: number;
}

export function useTranslatorSession() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const runtime = useRef<Runtime>({
    client: null,
    mic: null,
    player: null,
    finalAt: new Map(),
    vadSilenceMs: 0,
    muted: false,
    lastServerError: null,
    generation: 0,
  });
  const levelListeners = useRef(new Set<(level: number) => void>());

  const teardown = useCallback(() => {
    const r = runtime.current;
    r.generation += 1;
    const { client, mic, player } = r;
    r.client = null;
    r.mic = null;
    r.player = null;
    r.finalAt.clear();
    client?.close();
    player?.close();
    void mic?.stop();
  }, []);

  const handleEvent = useCallback((event: ServerEvent) => {
    const r = runtime.current;
    switch (event.type) {
      case "session.started":
        dispatch({ type: "live" });
        break;
      case "transcript.partial":
        dispatch({ type: "partial", text: event.text });
        break;
      case "transcript.final":
        r.finalAt.set(event.segmentId, performance.now());
        dispatch({ type: "final", id: event.segmentId, text: event.text });
        break;
      case "translation":
        dispatch({ type: "translated", id: event.segmentId, text: event.text });
        break;
      case "segment.error":
        dispatch({ type: "segmentFailed", id: event.segmentId, stage: event.stage });
        break;
      case "tts.start":
        r.player?.beginSegment(event.segmentId, event.sampleRate);
        break;
      case "latency":
        if (process.env.NODE_ENV !== "production") console.debug(`[latency] sentence ${event.segmentId}`, event.stages);
        break;
      case "error":
        r.lastServerError = event.message;
        break;
      case "ready":
      case "tts.end":
        break;
    }
  }, []);

  const start = useCallback(async () => {
    const r = runtime.current;
    if (r.client || r.mic || r.player) return;
    const generation = ++r.generation;
    const stale = () => runtime.current.generation !== generation;
    r.lastServerError = null;
    dispatch({ type: "starting" });

    try {
      // Audio contexts are created inside the click so browsers allow playback.
      const player = new PcmPlayer({
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
      r.player = player;
      await player.resume();

      // Ask for the microphone before opening a (paid) speech-to-text session.
      const mic = await startMicCapture({
        onFrame: (pcm) => runtime.current.client?.sendAudio(pcm),
        onLevel: (level) => levelListeners.current.forEach((listener) => listener(level)),
      });
      if (stale()) {
        void mic.stop();
        return;
      }
      r.mic = mic;
      mic.setMuted(r.muted);

      const client = new GatewayClient({
        onEvent: handleEvent,
        onAudio: (pcm) => runtime.current.player?.enqueue(pcm),
        onClose: ({ code }) => {
          if (stale()) return; // we closed it ourselves
          const message = runtime.current.lastServerError ?? closeMessage(code);
          teardown();
          dispatch({ type: "failed", message });
        },
      });
      r.client = client;
      const ready = await client.connect();
      if (stale()) return;
      r.vadSilenceMs = ready.vadSilenceMs;
      client.startSession();
    } catch (err) {
      if (stale()) return;
      teardown();
      dispatch({ type: "failed", message: startErrorMessage(err) });
    }
  }, [handleEvent, teardown]);

  const stop = useCallback(() => {
    runtime.current.client?.send({ type: "session.stop" });
    teardown();
    dispatch({ type: "stopped" });
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const r = runtime.current;
    r.muted = !r.muted;
    r.mic?.setMuted(r.muted);
    dispatch({ type: "muted", muted: r.muted });
  }, []);

  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  /** The level meter subscribes directly, so 10 updates a second don't re-render the transcript. */
  const subscribeLevel = useCallback((listener: (level: number) => void) => {
    levelListeners.current.add(listener);
    return () => {
      levelListeners.current.delete(listener);
    };
  }, []);

  // Release the mic and socket if the component unmounts mid-call.
  useEffect(() => teardown, [teardown]);

  return { ...state, status: deriveStatus(state), start, stop, toggleMute, clear, subscribeLevel };
}
