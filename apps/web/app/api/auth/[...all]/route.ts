/** All Better Auth endpoints: sign-up, sign-in, verify email, reset password, 2FA, delete account. */
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const runtime = "nodejs"; // Argon2 and pg need Node, not the edge runtime

export const { GET, POST } = toNextJsHandler(auth);
