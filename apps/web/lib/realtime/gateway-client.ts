import {
  CloseCode,
  PROTOCOL_VERSION,
  ServerEvent,
  TicketResponse,
  type ClientMessage,
} from "@lct/protocol";

export type ReadyEvent = Extract<ServerEvent, { type: "ready" }>;

export interface GatewayHandlers {
  onEvent: (event: ServerEvent) => void;
  onAudio: (pcm: ArrayBuffer) => void;
  onClose: (info: { code: number }) => void;
}

export class GatewayError extends Error {
  constructor(
    readonly code: "unauthorized" | "ticket_failed" | "connect_failed" | "insecure" | "rejected",
    message: string,
  ) {
    super(message);
  }
}

/** Above this much unsent data we drop mic frames rather than let the delay grow. */
const MAX_BUFFERED_BYTES = 128 * 1024;

/**
 * Browser side of the gateway WebSocket.
 * Holds no secrets: it gets a short-lived ticket from our own server, sends it as the first
 * message (never in the URL), and validates every event it receives.
 */
export class GatewayClient {
  private ws: WebSocket | null = null;
  private streaming = false;

  constructor(private readonly handlers: GatewayHandlers) {}

  async connect(): Promise<ReadyEvent> {
    const res = await fetch("/api/realtime/ticket", { method: "POST", cache: "no-store" });
    if (res.status === 401) throw new GatewayError("unauthorized", "Sign in to start translating.");
    if (!res.ok) throw new GatewayError("ticket_failed", "Couldn't start a session. Press Start to try again.");
    const { ticket, gatewayUrl } = TicketResponse.parse(await res.json());

    const url = new URL("/v1/realtime", gatewayUrl);
    if (window.location.protocol === "https:" && url.protocol !== "wss:") {
      throw new GatewayError("insecure", "The translation server address isn't secure (wss://). Check the configuration.");
    }

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
          this.handlers.onAudio(message.data);
          return;
        }
        const parsed = ServerEvent.safeParse(parseJson(message.data));
        if (!parsed.success) return; // ignore anything we don't understand
        const event = parsed.data;

        if (!settled && event.type === "ready") return settle(() => resolve(event));
        if (!settled && event.type === "error") return settle(() => reject(new GatewayError("rejected", event.message)));
        this.handlers.onEvent(event);
      };

      ws.onerror = () => settle(() => reject(new GatewayError("connect_failed", "Couldn't reach the translation server.")));

      ws.onclose = (event) => {
        this.ws = null;
        this.streaming = false;
        if (!settled) {
          const message =
            event.code === CloseCode.unauthorized
              ? "Your session expired. Press Start again."
              : "Couldn't reach the translation server.";
          return settle(() => reject(new GatewayError("connect_failed", message)));
        }
        this.handlers.onClose({ code: event.code });
      };
    });
  }

  /** Tell the gateway to open the speech pipeline, then start forwarding mic audio. */
  startSession(): void {
    this.send({ type: "session.start", source: "ur", target: "en" });
    this.streaming = true;
  }

  sendAudio(pcm: ArrayBuffer): void {
    const ws = this.ws;
    if (!this.streaming || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return; // slow network: drop, don't fall behind
    ws.send(pcm);
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.streaming = false;
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
