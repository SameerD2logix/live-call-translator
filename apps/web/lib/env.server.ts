import "server-only";
import { z } from "zod";

const ServerEnv = z
  .object({
    APP_ORIGIN: z.url(),
    GATEWAY_PUBLIC_URL: z.url(),
    GATEWAY_TICKET_SECRET: z.string().min(32),
    TICKET_ISSUER: z.string().default("lct-web"),
    TICKET_AUDIENCE: z.string().default("lct-gateway"),
    DEV_AUTH_BYPASS: z.enum(["true", "false"]).default("false"),
  })
  .superRefine((env, ctx) => {
    if (process.env.NODE_ENV === "production" && !env.GATEWAY_PUBLIC_URL.startsWith("wss://")) {
      ctx.addIssue({ code: "custom", path: ["GATEWAY_PUBLIC_URL"], message: "must use wss:// in production" });
    }
  });

let cached: z.infer<typeof ServerEnv> | null = null;

/** Validated server-only settings. Throws with variable NAMES (never values) if misconfigured. */
export function serverEnv(): z.infer<typeof ServerEnv> {
  if (!cached) {
    const parsed = ServerEnv.safeParse(process.env);
    if (!parsed.success) {
      const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(`Invalid server environment: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}
