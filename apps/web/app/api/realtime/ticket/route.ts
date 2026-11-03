/**
 * POST /api/realtime/ticket
 * Mints a 60-second, single-use ticket the browser uses to open the gateway WebSocket.
 * The signing secret stays on the server; the browser only ever sees the signed ticket.
 *
 * Phase 2: requires a real, verified session, and puts the user's OWN voice id (looked up
 * in our database) into the signed ticket. The browser can't alter it, so nobody can call
 * with another person's voice.
 * Phase 4: the user's glossary travels the same way, read from the database by user id.
 */
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import type { TicketResponse } from "@lct/protocol";
import { getCurrentUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env.server";
import { listGlossary } from "@/lib/glossary/repository";
import { allow } from "@/lib/rate-limit";
import { securityEvent } from "@/lib/security-log";
import { getVoiceProfile } from "@/lib/voice/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_TTL_SECONDS = 60;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const env = serverEnv();

  // CSRF defence: only pages on our own origin may mint tickets.
  if (request.headers.get("origin") !== env.APP_ORIGIN) {
    securityEvent("origin_rejected", { route: "ticket" });
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  // A real user presses Start a few times a minute at most.
  if (!(await allow(`ticket:${user.id}`, 20, 60, "ticket"))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }

  const voice = await getVoiceProfile(user.id);
  if (!voice) {
    return NextResponse.json({ error: "voice_required" }, { status: 409, headers: NO_STORE });
  }

  const glossary = (await listGlossary(user.id)).map((entry) => entry.term);
  const ticket = await new SignJWT({ voice: voice.providerVoiceId, glossary })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(env.TICKET_ISSUER)
    .setAudience(env.TICKET_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .setJti(randomUUID()) // unique id: the gateway rejects any ticket it has seen before
    .sign(new TextEncoder().encode(env.GATEWAY_TICKET_SECRET));

  const body: TicketResponse = { ticket, gatewayUrl: env.GATEWAY_PUBLIC_URL };
  return NextResponse.json(body, { headers: NO_STORE });
}
