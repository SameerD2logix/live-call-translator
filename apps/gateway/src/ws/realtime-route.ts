/**
 * WebSocket endpoint: one connection = one call session.
 *
 * Security checks, in order:
 *  1. Origin allow-list before the HTTP upgrade (blocks cross-site WebSocket hijacking).
 *  2. Per-IP connection rate limit (registered globally in index.ts).
 *  3. First message must be a valid single-use ticket within 5 s, or we disconnect.
 *  4. Every text message is size-capped and Zod-validated; unknown fields are rejected.
 *  5. Audio frames: size/alignment checked, rate-limited to 1.5x real time.
 *  6. One live session per user, a maximum session length, and a daily minutes quota.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RawData, WebSocket } from "ws";
import {
  ClientMessage,
  CloseCode,
  INPUT_BYTES_PER_MS,
  MAX_AUDIO_FRAME_BYTES,
  MAX_CONTROL_MESSAGE_BYTES,
  TTS_SAMPLE_RATE,
  type ErrorCode,
  type ServerEvent,
} from "@lct/protocol";
import { env } from "../config/env";
import { errorSummary } from "../lib/errors";
import { logger } from "../lib/logger";
import { OutgoingPipeline } from "../pipeline/outgoing-pipeline";
import type { Providers } from "../providers";
import { ProviderError } from "../providers/types";
import { dailyUsage, sessionSlots, TokenBucket } from "../security/limits";
import { verifyTicket } from "../security/ticket";
import { resolveVoiceId } from "../services/voices";

const AUTH_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const AUDIO_RATE_BYTES_PER_SEC = INPUT_BYTES_PER_MS * 1000 * 1.5;
const AUDIO_BURST_BYTES = INPUT_BYTES_PER_MS * 1000 * 2;
const MAX_RATE_VIOLATIONS = 20;
const QUOTA_MESSAGE = "You've used today's translation minutes. They reset at 00:00 UTC (5:00 AM in Pakistan).";

export function registerRealtimeRoute(app: FastifyInstance, providers: Providers): void {
  app.get(
    "/v1/realtime",
    {
      websocket: true,
      // Runs before the upgrade. Replying here prevents the WebSocket from opening.
      preValidation: async (request, reply) => {
        const origin = request.headers.origin;
        if (!origin || !env.ALLOWED_ORIGINS.includes(origin)) {
          await reply.code(403).send({ error: "forbidden_origin" });
        }
      },
    },
    (socket) => {
      RealtimeConnection.attach(socket, providers);
    },
  );
}

class RealtimeConnection {
  private readonly id = randomUUID();
  private log = logger.child({ conn: this.id });
  private userId: string | null = null;
  private authInFlight = false;
  private pipeline: OutgoingPipeline | null = null;
  private audioBytes = 0;
  private readonly bucket = new TokenBucket(AUDIO_RATE_BYTES_PER_SEC, AUDIO_BURST_BYTES);
  private rateViolations = 0;
  private closed = false;
  private alive = true;
  private readonly authTimer: NodeJS.Timeout;
  private readonly heartbeatTimer: NodeJS.Timeout;
  private sessionTimer: NodeJS.Timeout | undefined;

  static attach(socket: WebSocket, providers: Providers): RealtimeConnection {
    return new RealtimeConnection(socket, providers);
  }

  private constructor(
    private readonly socket: WebSocket,
    private readonly providers: Providers,
  ) {
    this.authTimer = setTimeout(() => {
      if (!this.userId) this.fail("unauthorized", "Sign-in check timed out. Press Start again.", CloseCode.unauthorized);
    }, AUTH_TIMEOUT_MS);

    // Detect dead connections (e.g. laptop closed) so their session slot is freed.
    this.heartbeatTimer = setInterval(() => {
      if (!this.alive) {
        this.socket.terminate();
        return;
      }
      this.alive = false;
      this.socket.ping();
    }, HEARTBEAT_INTERVAL_MS);

    socket.on("pong", () => {
      this.alive = true;
    });
    socket.on("message", (data, isBinary) => this.onMessage(data, isBinary));
    socket.on("close", () => this.cleanup());
    socket.on("error", (err) => this.log.warn({ err: err.name }, "socket error"));
  }

  // ---- Incoming ------------------------------------------------------------
  private onMessage(data: RawData, isBinary: boolean): void {
    if (this.closed) return;
    const buffer = toBuffer(data);
    if (isBinary) return this.onAudio(buffer);

    if (buffer.length > MAX_CONTROL_MESSAGE_BYTES) {
      return this.fail("bad_request", "Message too large.", CloseCode.badRequest);
    }
    let json: unknown;
    try {
      json = JSON.parse(buffer.toString("utf8"));
    } catch {
      return this.fail("bad_request", "Malformed message.", CloseCode.badRequest);
    }
    const parsed = ClientMessage.safeParse(json);
    if (!parsed.success) return this.fail("bad_request", "Unrecognised message.", CloseCode.badRequest);

    this.onControl(parsed.data).catch((err: unknown) => {
      this.log.error({ err: errorSummary(err) }, "control handler failed");
      this.fail("internal", "Something went wrong on the server. Press Start again.", 1011);
    });
  }

  private async onControl(message: ClientMessage): Promise<void> {
    if (!this.userId) {
      if (message.type !== "auth" || this.authInFlight) {
        return this.fail("unauthorized", "Authenticate first.", CloseCode.unauthorized);
      }
      return this.authenticate(message.ticket);
    }

    switch (message.type) {
      case "auth":
        return this.fail("bad_request", "Already authenticated.", CloseCode.badRequest);
      case "session.start":
        return this.startSession(this.userId);
      case "session.stop":
        return this.stopSession();
      case "client.metrics":
        // Numbers only: the browser-measured delay until translated audio was audible.
        this.log.info({ segmentId: message.segmentId, playbackDelayMs: Math.round(message.playbackDelayMs) }, "client playback delay");
        return;
    }
  }

  private async authenticate(ticket: string): Promise<void> {
    this.authInFlight = true;
    let userId: string;
    try {
      ({ userId } = await verifyTicket(ticket));
    } catch {
      // Don't log the ticket or the exact reason; both help attackers more than us.
      return this.fail("unauthorized", "Your session ticket is invalid or expired. Press Start again.", CloseCode.unauthorized);
    } finally {
      this.authInFlight = false;
    }
    if (this.closed) return;

    if (!sessionSlots.acquire(userId)) {
      return this.fail("session_limit", "A session is already open in another tab or window. Close it and try again.", CloseCode.sessionLimit);
    }
    this.userId = userId;
    clearTimeout(this.authTimer);
    this.log = this.log.child({ user: userId });
    this.send({
      type: "ready",
      sessionId: this.id,
      vadSilenceMs: Math.round(env.VAD_SILENCE_SECS * 1000),
      ttsSampleRate: TTS_SAMPLE_RATE,
    });
  }

  private async startSession(userId: string): Promise<void> {
    if (this.pipeline) return;
    if (this.remainingQuotaMs(userId) <= 0) return this.fail("quota_exceeded", QUOTA_MESSAGE, CloseCode.quotaExceeded);

    const voiceId = await resolveVoiceId(userId); // server-side lookup, never from the client
    if (this.closed) return;

    const pipeline = new OutgoingPipeline({
      providers: this.providers,
      voiceId,
      vadSilenceMs: Math.round(env.VAD_SILENCE_SECS * 1000),
      secondaryLanguages: env.STT_SECONDARY_LANGUAGES,
      glossary: [], // Phase 4: load the user's glossary here (after an ownership check)
      log: this.log,
      emit: (event) => this.send(event),
      emitAudio: (pcm) => this.sendBinary(pcm),
      onFatal: (error) => this.onProviderFailure(error),
    });
    this.pipeline = pipeline;
    this.sessionTimer = setTimeout(
      () => this.fail("session_limit", `Sessions are limited to ${env.MAX_SESSION_MINUTES} minutes. Press Start to begin a new one.`, CloseCode.sessionTimeout),
      env.MAX_SESSION_MINUTES * 60_000,
    );

    try {
      await pipeline.start();
    } catch (err) {
      if (this.pipeline === pipeline) this.onProviderFailure(err);
      return;
    }
    if (this.pipeline === pipeline) {
      this.log.info("session started");
      this.send({ type: "session.started" });
    }
  }

  private stopSession(): void {
    this.pipeline?.stop();
    this.pipeline = null;
    clearTimeout(this.sessionTimer);
  }

  private onAudio(pcm: Buffer): void {
    if (!this.userId) return this.fail("unauthorized", "Authenticate first.", CloseCode.unauthorized);
    if (!this.pipeline) return; // audio before session.start or after stop is dropped

    if (pcm.length === 0 || pcm.length % 2 !== 0 || pcm.length > MAX_AUDIO_FRAME_BYTES) {
      return this.fail("bad_request", "Invalid audio frame.", CloseCode.badRequest);
    }
    if (!this.bucket.take(pcm.length)) {
      if (++this.rateViolations > MAX_RATE_VIOLATIONS) {
        this.fail("rate_limited", "Audio is arriving faster than real time.", CloseCode.rateLimited);
      }
      return;
    }

    this.audioBytes += pcm.length;
    if (this.remainingQuotaMs(this.userId) <= 0) {
      return this.fail("quota_exceeded", QUOTA_MESSAGE, CloseCode.quotaExceeded);
    }
    this.pipeline.pushAudio(pcm);
  }

  // ---- Helpers -------------------------------------------------------------
  private remainingQuotaMs(userId: string): number {
    return dailyUsage.remainingMs(userId) - this.audioBytes / INPUT_BYTES_PER_MS;
  }

  private onProviderFailure(err: unknown): void {
    this.log.error({ err: errorSummary(err) }, "session ended by provider failure");
    const code = err instanceof ProviderError ? err.code : "unknown";
    const message =
      code === "rate_limited"
        ? "The translation service is busy. Wait a moment, then press Start."
        : code === "auth" || code === "quota"
          ? "The translation service is unavailable right now. Try again later."
          : "The speech service disconnected. Press Start to continue.";
    this.fail("provider_unavailable", message, CloseCode.providerUnavailable);
  }

  private send(event: ServerEvent): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(event));
  }

  private sendBinary(pcm: Buffer): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(pcm, { binary: true });
  }

  /** Tell the browser why, close the socket, release everything. */
  private fail(code: ErrorCode, message: string, closeCode: number): void {
    if (this.closed) return;
    this.send({ type: "error", code, message });
    this.log.info({ code }, "closing connection");
    this.socket.close(closeCode, code);
    this.cleanup();
  }

  private cleanup(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.authTimer);
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.sessionTimer);
    this.pipeline?.stop();
    this.pipeline = null;
    if (this.userId) {
      dailyUsage.add(this.userId, this.audioBytes / INPUT_BYTES_PER_MS);
      sessionSlots.release(this.userId);
    }
    this.log.info({ audioSeconds: Math.round(this.audioBytes / INPUT_BYTES_PER_MS / 1000) }, "connection closed");
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
