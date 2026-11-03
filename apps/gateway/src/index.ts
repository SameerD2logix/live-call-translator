/**
 * Gateway entry point. Holds every API key; the browser only ever talks to this server.
 */
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyError } from "fastify";
import { MAX_WS_MESSAGE_BYTES } from "@lct/protocol";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { registerVoiceRoutes } from "./http/voice-routes";
import { createProviders } from "./providers";
import { registerRealtimeRoute } from "./ws/realtime-route";

async function main(): Promise<void> {
  const app = Fastify({
    loggerInstance: logger,
    // Trust exactly N proxy hops (not "any"), so X-Forwarded-For can't be spoofed by clients.
    trustProxy: env.TRUSTED_PROXY_HOPS > 0 ? env.TRUSTED_PROXY_HOPS : false,
    bodyLimit: 16 * 1024,
  });

  // Security headers. This server serves no HTML, so the CSP can be fully locked down.
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: { maxAge: 63_072_000, includeSubDomains: true },
  });
  await app.register(cors, { origin: env.ALLOWED_ORIGINS, methods: ["GET"] });
  // Per-IP limit on requests, including WebSocket upgrade attempts.
  await app.register(rateLimit, { max: 30, timeWindow: "1 minute" });
  await app.register(websocket, { options: { maxPayload: MAX_WS_MESSAGE_BYTES } });

  // In production, refuse anything that didn't arrive over TLS (the platform terminates TLS
  // and sets X-Forwarded-Proto). The health check is exempt for platform probes.
  if (env.NODE_ENV === "production") {
    app.addHook("onRequest", async (request, reply) => {
      if (request.url !== "/healthz" && request.protocol !== "https") {
        await reply.code(403).send({ error: "https_required" });
      }
    });
  }

  // Never send internal error messages or stack traces to clients; log a short summary instead.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error.name, code: error.code }, "request failed");
    else request.log.info({ status, code: error.code }, "request rejected");
    void reply.code(status).send({ error: status >= 500 ? "internal_error" : status === 429 ? "rate_limited" : "bad_request" });
  });
  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: "not_found" });
  });

  app.get("/healthz", { config: { rateLimit: false } }, async () => ({ ok: true }));

  const providers = createProviders();
  registerRealtimeRoute(app, providers);
  await registerVoiceRoutes(app, providers); // server-to-server only (service token required)

  await app.listen({ port: env.PORT, host: env.HOST });

  const shutdown = (signal: string) => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Log and exit on anything unexpected; the platform restarts the process in a clean state.
process.on("unhandledRejection", (reason: unknown) => {
  logger.fatal({ err: reason instanceof Error ? reason.name : "unknown" }, "unhandled promise rejection");
  process.exit(1);
});

main().catch((err: unknown) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "gateway failed to start");
  process.exit(1);
});
