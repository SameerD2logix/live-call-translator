/**
 * GET    /api/glossary         The signed-in user's words to keep.
 * POST   /api/glossary         { term }  Add one.
 * DELETE /api/glossary?id=…    Remove one (only your own).
 * Changes apply from the next time you press Start (the glossary travels in the signed call ticket).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { GlossaryTerm } from "@lct/protocol";
import { getCurrentUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env.server";
import { addGlossaryTerm, listGlossary, removeGlossaryTerm } from "@/lib/glossary/repository";
import { allow } from "@/lib/rate-limit";
import { securityEvent } from "@/lib/security-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

const AddBody = z.strictObject({ term: GlossaryTerm });

type Auth = { ok: true; userId: string } | { ok: false; response: NextResponse };

/** Signed-in user, plus a same-origin check (CSRF) for anything that changes data. */
async function authorize(request: Request, mutating: boolean): Promise<Auth> {
  if (mutating && request.headers.get("origin") !== serverEnv().APP_ORIGIN) {
    securityEvent("origin_rejected", { route: "glossary" });
    return { ok: false, response: fail(403, "forbidden") };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: fail(401, "unauthorized") };
  if (mutating && !(await allow(`glossary:${user.id}`, 30, 60, "glossary"))) {
    return { ok: false, response: fail(429, "rate_limited") };
  }
  return { ok: true, userId: user.id };
}

export async function GET(request: Request) {
  const auth = await authorize(request, false);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ terms: await listGlossary(auth.userId) }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const auth = await authorize(request, true);
  if (!auth.ok) return auth.response;
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return fail(413, "too_large");
  const parsed = AddBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_term");

  const result = await addGlossaryTerm(auth.userId, parsed.data.term);
  if (result === "full") return fail(409, "glossary_full");
  return NextResponse.json({ terms: await listGlossary(auth.userId), duplicate: result === "duplicate" }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const auth = await authorize(request, true);
  if (!auth.ok) return auth.response;
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return fail(400, "invalid_id");
  await removeGlossaryTerm(auth.userId, id.data);
  return NextResponse.json({ terms: await listGlossary(auth.userId) }, { headers: NO_STORE });
}
