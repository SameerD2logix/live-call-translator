/**
 * Service tokens for the internal voice API (web app server → gateway).
 *
 * The web app signs a 60-second, single-use JWT with INTERNAL_API_SECRET for each call,
 * scoped to one action. A delete token is also bound to one specific voice id, so a leaked
 * or replayed token can't be pointed at a different voice.
 */
import { jwtVerify } from "jose";
import { INTERNAL_TOKEN_AUDIENCE, ProviderVoiceId } from "@lct/protocol";
import { env } from "../config/env";
import { ReplayGuard } from "./replay-guard";

export type InternalScope = "voice:clone" | "voice:delete";

const secret = new TextEncoder().encode(env.INTERNAL_API_SECRET);
const replay = new ReplayGuard();

export interface InternalClaims {
  userId: string;
  voiceId: string | null;
}

export async function verifyInternalToken(
  authorization: string | undefined,
  scope: InternalScope,
): Promise<InternalClaims> {
  if (!authorization?.startsWith("Bearer ")) throw new Error("missing bearer token");

  const { payload } = await jwtVerify(authorization.slice("Bearer ".length), secret, {
    algorithms: ["HS256"],
    issuer: env.TICKET_ISSUER,
    audience: INTERNAL_TOKEN_AUDIENCE,
    maxTokenAge: "60s",
    clockTolerance: 5,
  });

  const { sub, jti, exp } = payload;
  if (!sub || !jti || !exp) throw new Error("token is missing required claims");
  if (payload.scope !== scope) throw new Error("token scope mismatch");

  let voiceId: string | null = null;
  if (payload.voice !== undefined) {
    const parsed = ProviderVoiceId.safeParse(payload.voice);
    if (!parsed.success) throw new Error("token has an invalid voice claim");
    voiceId = parsed.data;
  }

  if (!replay.claim(jti, exp * 1000)) throw new Error("token already used");
  return { userId: sub, voiceId };
}
