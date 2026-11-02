/**
 * WebSocket tickets.
 *
 * Browsers can't set headers on WebSocket requests, and putting tokens in the URL leaks them
 * into proxy logs. So: the web app (which knows who is signed in) mints a short-lived,
 * single-use JWT; the browser sends it as the FIRST WebSocket message; we verify it here.
 *
 * Replay protection is in memory, which is correct for ONE gateway instance.
 * Before running several instances, move `usedTicketIds` to Redis (SET jti NX EX 120).
 */
import { jwtVerify } from "jose";
import { env } from "../config/env";

const secret = new TextEncoder().encode(env.TICKET_SECRET);
const usedTicketIds = new Map<string, number>(); // jti -> expiry (epoch ms)

function purgeExpired(now: number): void {
  for (const [jti, expiresAt] of usedTicketIds) {
    if (expiresAt < now) usedTicketIds.delete(jti);
  }
}

export async function verifyTicket(token: string): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"], // pin the algorithm; never let the token header choose it
    issuer: env.TICKET_ISSUER,
    audience: env.TICKET_AUDIENCE,
    maxTokenAge: "120s",
    clockTolerance: 5,
  });

  const { sub, jti, exp } = payload;
  if (!sub || !jti || !exp) throw new Error("ticket is missing required claims");

  const now = Date.now();
  purgeExpired(now);
  if (usedTicketIds.has(jti)) throw new Error("ticket already used");
  usedTicketIds.set(jti, exp * 1000);

  return { userId: sub };
}
