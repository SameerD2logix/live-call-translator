import "server-only";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { INTERNAL_TOKEN_AUDIENCE, VoiceCloneResult } from "@lct/protocol";
import { serverEnv } from "@/lib/env.server";

/**
 * Server-to-server calls from the web app to the gateway's internal voice API.
 * Each call carries a fresh 60-second, single-use token scoped to one action; delete tokens
 * are also bound to one voice id. The provider API key stays on the gateway.
 */
export class GatewayAdminError extends Error {
  constructor(readonly status: number) {
    super(`Gateway voice API returned HTTP ${status}`);
  }
}

async function serviceToken(userId: string, scope: "voice:clone" | "voice:delete", voiceId?: string): Promise<string> {
  const env = serverEnv();
  return new SignJWT({ scope, ...(voiceId ? { voice: voiceId } : {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(env.TICKET_ISSUER)
    .setAudience(INTERNAL_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("60s")
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(env.INTERNAL_API_SECRET));
}

export async function cloneVoiceViaGateway(userId: string, form: FormData): Promise<VoiceCloneResult> {
  const res = await fetch(new URL("/internal/v1/voices", serverEnv().GATEWAY_INTERNAL_URL), {
    method: "POST",
    headers: { Authorization: `Bearer ${await serviceToken(userId, "voice:clone")}` },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new GatewayAdminError(res.status);
  }
  return VoiceCloneResult.parse(await res.json());
}

export async function deleteVoiceViaGateway(userId: string, providerVoiceId: string): Promise<void> {
  const url = new URL(`/internal/v1/voices/${encodeURIComponent(providerVoiceId)}`, serverEnv().GATEWAY_INTERNAL_URL);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${await serviceToken(userId, "voice:delete", providerVoiceId)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(100_000),
  });
  await res.body?.cancel().catch(() => undefined);
  if (res.status !== 204 && res.status !== 404) throw new GatewayAdminError(res.status);
}
