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
import { Glossary, ProviderVoiceId } from "@lct/protocol";
import { env } from "../config/env";
import { keysFrom, verifyWithKeys } from "./jwt";
import { ReplayGuard } from "./replay-guard";

const keys = keysFrom(env.TICKET_SECRET, env.TICKET_SECRET_PREVIOUS);
const replay = new ReplayGuard();

export interface TicketClaims {
  userId: string;
  /** null until the user has recorded their voice. */
  voiceId: string | null;
  /** The user's words-to-keep, read from their account by the web app (Phase 4). */
  glossary: string[];
}

export async function verifyTicket(token: string): Promise<TicketClaims> {
  const payload = await verifyWithKeys(token, keys, {
    // HS256 is pinned inside verifyWithKeys; the token header never chooses the algorithm.
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

  const glossary = Glossary.safeParse(payload.glossary ?? []);
  if (!glossary.success) throw new Error("ticket has an invalid glossary claim");

  if (!replay.claim(jti, exp * 1000)) throw new Error("ticket already used");
  return { userId: sub, voiceId, glossary: glossary.data };
}
