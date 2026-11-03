/**
 * POST   /api/voice  Create the signed-in user's voice clone from recorded samples.
 * DELETE /api/voice  Delete it (at the provider first, then here).
 *
 * POST checks, in order: same-origin request, signed-in + verified user, upload size,
 * explicit consent to the current statement, sample count/size/real file type, plausible
 * durations, one voice per user, and a daily attempt limit. Recordings are held in memory,
 * forwarded once to the gateway, and never written to disk or the database.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AUDIO_FILE_EXTENSION, VOICE_SAMPLE_LIMITS as L, sniffAudioContainer } from "@lct/protocol";
import { getCurrentUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env.server";
import { CONSENT_VERSION, consentDocument } from "@/lib/voice/consent";
import { VOICE_SCRIPT } from "@/lib/voice/script";
import { cloneVoiceViaGateway, deleteVoiceViaGateway, GatewayAdminError } from "@/lib/voice/gateway-admin";
import { countRecentConsents, getVoiceProfile, recordConsent, saveVoiceProfile } from "@/lib/voice/repository";
import { deleteVoiceForUser } from "@/lib/voice/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // cloning can take a while

const MAX_ATTEMPTS_PER_DAY = 5;
const NO_STORE = { "Cache-Control": "no-store" };

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

const Fields = z.object({
  consent: z.literal("yes"), // the checkbox must be ticked
  consentVersion: z.literal(CONSENT_VERSION), // and it must be the statement we show today
  readingLanguage: z.enum(["en", "ur"]),
  removeBackgroundNoise: z.enum(["true", "false"]),
  durations: z.string().max(1_000),
  /** Which script sentence each sample reads, in sample order. */
  prompts: z.string().max(1_000),
});

const Durations = z.array(z.number().min(1).max(L.maxSampleSeconds)).min(L.minSamples).max(L.maxSamples);
const Prompts = z
  .array(z.number().int().min(0).max(VOICE_SCRIPT.length - 1))
  .min(L.minSamples)
  .max(L.maxSamples)
  .refine((list) => new Set(list).size === list.length, "each sentence once");

function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === serverEnv().APP_ORIGIN;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "forbidden"); // CSRF defence
  const user = await getCurrentUser();
  if (!user) return fail(401, "unauthorized");

  // Refuse oversized bodies BEFORE reading them into memory.
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) return fail(411, "length_required");
  if (length > L.maxTotalBytes + 64 * 1024) return fail(413, "too_large");

  // Cheap checks before reading up to 4 MB of audio into memory.
  if (await getVoiceProfile(user.id)) return fail(409, "voice_exists"); // delete the old one first
  if ((await countRecentConsents(user.id)) >= MAX_ATTEMPTS_PER_DAY) return fail(429, "too_many_attempts");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "invalid_form");
  }

  const fields = Fields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!fields.success) return fail(400, "consent_required_or_invalid_fields");

  let durations: number[];
  let prompts: number[];
  try {
    const parsedDurations = Durations.safeParse(JSON.parse(fields.data.durations));
    const parsedPrompts = Prompts.safeParse(JSON.parse(fields.data.prompts));
    if (!parsedDurations.success || !parsedPrompts.success) return fail(400, "invalid_durations");
    durations = parsedDurations.data;
    prompts = parsedPrompts.data;
  } catch {
    return fail(400, "invalid_durations");
  }
  if (prompts.length !== durations.length) return fail(400, "invalid_samples");

  const files = form.getAll("samples");
  if (files.length !== durations.length || files.some((f) => !(f instanceof File))) return fail(400, "invalid_samples");
  const samples = files as File[];

  const totalSeconds = durations.reduce((sum, d) => sum + d, 0);
  if (totalSeconds < L.minTotalSeconds || totalSeconds > L.maxTotalSeconds) return fail(400, "invalid_total_length");

  // Validate every file by its real bytes, not its name or declared type.
  const outgoing = new FormData();
  let totalBytes = 0;
  for (const [i, file] of samples.entries()) {
    if (file.size === 0 || file.size > L.maxSampleBytes) return fail(413, "sample_too_large");
    totalBytes += file.size;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffAudioContainer(bytes);
    if (!mime) return fail(415, "unsupported_audio");
    // Rough sanity check: compressed speech is ~1–40 KB per second.
    const bytesPerSecond = file.size / (durations[i] ?? 1);
    if (bytesPerSecond < 1_000 || bytesPerSecond > 40_000) return fail(400, "implausible_sample");
    outgoing.append("samples", new Blob([bytes], { type: mime }), `sample-${i + 1}.${AUDIO_FILE_EXTENSION[mime]}`);
  }
  if (totalBytes > L.maxTotalBytes) return fail(413, "too_large");
  outgoing.append("removeBackgroundNoise", fields.data.removeBackgroundNoise);
  // The sentences the samples should contain, from OUR script (never text sent by the browser).
  outgoing.append("language", fields.data.readingLanguage);
  for (const index of prompts) outgoing.append("expected", VOICE_SCRIPT[index]![fields.data.readingLanguage]);

  // Consent is stored at the moment it's given, with a hash of the exact wording shown.
  const digest = createHash("sha256").update(consentDocument()).digest("hex");
  const consentId = await recordConsent(user.id, CONSENT_VERSION, digest);

  let result;
  try {
    result = await cloneVoiceViaGateway(user.id, outgoing);
  } catch (err) {
    const status = err instanceof GatewayAdminError ? err.status : 0;
    console.error("voice cloning via gateway failed, HTTP", status); // status only, never audio or user data
    if (status === 422) return fail(422, "script_mismatch"); // samples don't read our sentences
    const badAudio = status === 400 || status === 413 || status === 415;
    return badAudio ? fail(400, "invalid_audio") : fail(502, "provider_unavailable");
  }

  try {
    await saveVoiceProfile({
      userId: user.id,
      consentId,
      provider: result.provider,
      providerVoiceId: result.providerVoiceId,
      readingLanguage: fields.data.readingLanguage,
      sampleSeconds: Math.round(totalSeconds),
    });
  } catch {
    // e.g. a second tab finished first (one voice per user). Don't leave an orphaned clone.
    await deleteVoiceViaGateway(user.id, result.providerVoiceId).catch(() => undefined);
    return fail(409, "voice_exists");
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return fail(403, "forbidden");
  const user = await getCurrentUser();
  if (!user) return fail(401, "unauthorized");
  try {
    await deleteVoiceForUser(user.id);
  } catch {
    return fail(502, "provider_unavailable"); // nothing was removed; safe to retry
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
