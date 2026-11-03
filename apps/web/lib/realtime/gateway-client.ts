import {
  CloseCode,
  PROTOCOL_VERSION,
  ServerEvent,
  TicketResponse,
  decodeAudioFrame,
  encodeAudioFrame,
  type ClientMessage,
  type Direction,
  type ErrorCode,
  type PausePreset,
} from "@lct/protocol";

export type ReadyEvent = Extract<ServerEvent, { type: "ready" }>;

export interface GatewayHandlers {
  onEvent: (event: ServerEvent) => void;
  /** PCM16 for one direction, copied into its own (2-byte aligned) buffer. */
  onAudio: (dir: Direction, pcm: ArrayBuffer) => void;
  onClose: (info: { code: number }) => void;
}

/** Everything the UI can explain, as a code (the UI shows text in the user's language). */
export type GatewayErrorCode = ErrorCode | "connection" | "insecure";

export class GatewayError extends Error {
  constructor(readonly code: GatewayErrorCode) {
    super(code);
  }
}

/** Maps a WebSocket close code from the gateway to an explainable error. */
export function errorForCloseCode(code: number): GatewayErrorCode {
  switch (code) {
    case CloseCode.unauthorized:
      return "unauthorized";
    case CloseCode.sessionLimit:
    case CloseCode.sessionTimeout:
      return "session_limit";
    case CloseCode.quotaExceeded:
      return "quota_exceeded";
    case CloseCode.voiceRequired:
      return "voice_required";
    case CloseCode.rateLimited:
      return "rate_limited";
    case CloseCode.providerUnavailable:
      return "provider_unavailable";
    default:
      return "connection";
  }
}

/** Above this much unsent data we drop audio frames rather than let the delay grow. */
const MAX_BUFFERED_BYTES = 128 * 1024;

/**
 * Browser side of the gateway WebSocket (protocol v2: both directions on one socket).
 * Holds no secrets: it gets a short-lived ticket from our own server, sends it as the first
 * message (never in the URL), and validates every event it receives.
 */
export class GatewayClient {
  private ws: WebSocket | null = null;
  private readonly streaming: Record<Direction, boolean> = { out: false, in: false };

  constructor(private readonly handlers: GatewayHandlers) {}

  async connect(): Promise<ReadyEvent> {
    const res = await fetch("/api/realtime/ticket", { method: "POST", cache: "no-store" }).catch(() => null);
    if (!res) throw new GatewayError("connection");
    if (res.status === 401) throw new GatewayError("unauthorized");
    if (res.status === 409) throw new GatewayError("voice_required");
    if (!res.ok) throw new GatewayError("connection");
    const { ticket, gatewayUrl } = TicketResponse.parse(await res.json());

    const url = new URL("/v1/realtime", gatewayUrl);
    if (window.location.protocol === "https:" && url.protocol !== "wss:") throw new GatewayError("insecure");

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    return new Promise<ReadyEvent>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      ws.onopen = () => {
        const auth: ClientMessage = { type: "auth", protocol: PROTOCOL_VERSION, ticket };
        ws.send(JSON.stringify(auth));
      };

      ws.onmessage = (message: MessageEvent) => {
        if (message.data instanceof ArrayBuffer) {
          const frame = decodeAudioFrame(new Uint8Array(message.data));
          // slice() copies into a fresh buffer, so Int16Array alignment is guaranteed.
          if (frame) this.handlers.onAudio(frame.dir, frame.pcm.slice().buffer as ArrayBuffer);
          return;
        }
        const parsed = ServerEvent.safeParse(parseJson(message.data));
        if (!parsed.success) return; // ignore anything we don't understand
        const event = parsed.data;

        if (!settled && event.type === "ready") return settle(() => resolve(event));
        if (!settled && event.type === "error") return settle(() => reject(new GatewayError(event.code)));
        this.handlers.onEvent(event);
      };

      ws.onerror = () => settle(() => reject(new GatewayError("connection")));

      ws.onclose = (event) => {
        this.ws = null;
        this.streaming.out = false;
        this.streaming.in = false;
        if (!settled) return settle(() => reject(new GatewayError(errorForCloseCode(event.code))));
        this.handlers.onClose({ code: event.code });
      };
    });
  }

  /** You → client: open the speech pipeline, then start forwarding mic audio. */
  startSession(pause: PausePreset): void {
    this.send({ type: "session.start", source: "ur", target: "en", pause });
    this.streaming.out = true;
  }

  /** Client → you: translate the shared call audio into Urdu. */
  startIncoming(speakUrdu: boolean): void {
    this.send({ type: "incoming.start", speakUrdu });
    this.streaming.in = true;
  }

  stopIncoming(): void {
    this.streaming.in = false;
    this.send({ type: "incoming.stop" });
  }

  sendAudio(dir: Direction, pcm: ArrayBuffer): void {
    const ws = this.ws;
    if (!this.streaming[dir] || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return; // slow network: drop, don't fall behind
    ws.send(encodeAudioFrame(dir, new Uint8Array(pcm)));
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.streaming.out = false;
    this.streaming.in = false;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000, "client_stop");
  }
}

function parseJson(data: unknown): unknown {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
