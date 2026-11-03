/**
 * WebSocket tickets.
 *
 * Browsers can't set headers on WebSocket requests, and putting tokens in the URL leaks them
 * into proxy logs. So: the web app (which knows who is signed in) mints a short-lived,
 * single-use JWT; the browser sends it as the FIRST WebSocket message; we verify it here.
 *
 * Phase 2: the ticket also carries `voice`, the user's own cloned voice id, which the web app
 * looked up in its database. The browser can read this claim but can't change it without
 * breaking the signature, so a user can never speak with someone else's voice.
 */
import { jwtVerify } from "jose";
import { ProviderVoiceId } from "@lct/protocol";
import { env } from "../config/env";
import { ReplayGuard } from "./replay-guard";

const secret = new TextEncoder().encode(env.TICKET_SECRET);
const replay = new ReplayGuard();

export interface TicketClaims {
  userId: string;
  /** null until the user has recorded their voice. */
  voiceId: string | null;
}

export async function verifyTicket(token: string): Promise<TicketClaims> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"], // pin the algorithm; never let the token header choose it
    issuer: env.TICKET_ISSUER,
    audience: env.TICKET_AUDIENCE,
    maxTokenAge: "120s",
    clockTolerance: 5,
  });

  const { sub, jti, exp } = payload;
  if (!sub || !jti || !exp) throw new Error("ticket is missing required claims");

  let voiceId: string | null = null;
  if (payload.voice !== undefined && payload.voice !== null) {
    const parsed = ProviderVoiceId.safeParse(payload.voice);
    if (!parsed.success) throw new Error("ticket has an invalid voice claim");
    voiceId = parsed.data;
  }

  if (!replay.claim(jti, exp * 1000)) throw new Error("ticket already used");
  return { userId: sub, voiceId };
}
