/**
 * POST /api/realtime/ticket
 * Mints a 60-second, single-use ticket the browser uses to open the gateway WebSocket.
 * The signing secret stays on the server; the browser only ever sees the signed ticket.
 */
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import type { TicketResponse } from "@lct/protocol";
import { getCurrentUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_TTL_SECONDS = 60;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const env = serverEnv();

  // CSRF defence: only pages on our own origin may mint tickets.
  if (request.headers.get("origin") !== env.APP_ORIGIN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const ticket = await new SignJWT({})
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
