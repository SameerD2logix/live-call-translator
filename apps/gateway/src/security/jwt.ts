/**
 * HS256 verification with key rotation: tries the current secret, then the previous one (if set),
 * so rotating a secret doesn't break tokens issued a moment earlier. Only a wrong signature moves
 * on to the next key; any other problem (expired, wrong audience...) fails immediately.
 */
import { errors, jwtVerify, type JWTPayload, type JWTVerifyOptions } from "jose";

export function keysFrom(current: string, previous?: string): Uint8Array[] {
  const encoder = new TextEncoder();
  return [current, previous].filter((key): key is string => Boolean(key)).map((key) => encoder.encode(key));
}

export async function verifyWithKeys(token: string, keys: Uint8Array[], options: JWTVerifyOptions): Promise<JWTPayload> {
  let lastError: unknown = new Error("no verification keys");
  for (const key of keys) {
    try {
      return (await jwtVerify(token, key, { ...options, algorithms: ["HS256"] })).payload;
    } catch (err) {
      if (!(err instanceof errors.JWSSignatureVerificationFailed)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
