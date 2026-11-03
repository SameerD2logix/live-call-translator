"use client";

/**
 * Voice onboarding: read short sentences aloud, review the takes, give explicit consent,
 * then create the clone. Recordings exist only in this tab's memory until upload, and the
 * servers drop them as soon as the clone is created. Each take is sent with the number of
 * the sentence it reads, so the server can check the recordings match our script.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VOICE_SAMPLE_LIMITS as L } from "@lct/protocol";
import { Button, Notice } from "@/components/ui/form";
import { checkClip, SampleRecorder, type Clip, type ClipProblem } from "@/lib/audio/sample-recorder";
import { accountText, type AccountDict } from "@/lib/i18n/account";
import type { Lang } from "@/lib/i18n/dictionary";
import { CONSENT_STATEMENT, CONSENT_VERSION } from "@/lib/voice/consent";
import { VOICE_SCRIPT } from "@/lib/voice/script";

type Stage = "intro" | "record" | "review" | "uploading";
type ReadLang = "en" | "ur";

const problemText = (a: AccountDict, problem: ClipProblem) =>
  problem === "too_short" ? a.rec_tooShort : problem === "too_quiet" ? a.rec_tooQuiet : a.rec_clipping;

function uploadError(a: AccountDict, code: string | undefined): string {
  switch (code) {
    case "voice_exists":
      return a.up_voice_exists;
    case "too_many_attempts":
      return a.up_too_many_attempts;
    case "invalid_audio":
      return a.up_invalid_audio;
    case "provider_unavailable":
      return a.up_provider_unavailable;
    case "unauthorized":
      return a.up_unauthorized;
    case "script_mismatch":
      return a.up_script_mismatch;
    default:
      return a.up_generic;
  }
}

const usable = (clip: Clip | null, problem: ClipProblem | null): clip is Clip =>
  clip !== null && problem !== "too_short" && problem !== "too_quiet";

export function VoiceRecorder({ lang: uiLang }: { lang: Lang }) {
  const a = accountText[uiLang];
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("intro");
  const [lang, setLang] = useState<ReadLang>("en");
  const [index, setIndex] = useState(0);
  const [clips, setClips] = useState<(Clip | null)[]>(() => VOICE_SCRIPT.map(() => null));
  const [problems, setProblems] = useState<(ClipProblem | null)[]>(() => VOICE_SCRIPT.map(() => null));
  const [recording, setRecording] = useState(false);
  const [consent, setConsent] = useState(false);
  const [noisyRoom, setNoisyRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<SampleRecorder | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  // Release the microphone and the in-memory recordings if the user leaves the page.
  useEffect(
    () => () => {
      void recorderRef.current?.close();
      clipsRef.current.forEach((clip) => clip && URL.revokeObjectURL(clip.url));
    },
    [],
  );

  // Usable takes with the script sentence each one reads (the server checks they match).
  const takes = clips.flatMap((clip, i) => (usable(clip, problems[i] ?? null) ? [{ clip, prompt: i }] : []));
  const good = takes.map((take) => take.clip);
  const totalSeconds = good.reduce((sum, clip) => sum + Math.min(clip.seconds, L.maxSampleSeconds), 0);
  const enough = good.length >= L.minSamples && totalSeconds >= L.minTotalSeconds;
  const line = VOICE_SCRIPT[index]!;
  const other: ReadLang = lang === "en" ? "ur" : "en";

  async function begin() {
    setError(null);
    try {
      recorderRef.current = await SampleRecorder.open();
      setStage("record");
    } catch (err) {
      setError(err instanceof DOMException && err.name === "NotAllowedError" ? a.micBlocked : a.micFailed);
    }
  }

  async function toggleRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    const at = index;
    const previous = clips[at];
    if (previous) URL.revokeObjectURL(previous.url);
    setError(null);
    setRecording(true);
    try {
      const clip = await recorder.record((rms) => {
        if (meterRef.current) meterRef.current.style.transform = `scaleX(${Math.min(1, rms * 6)})`;
      }, L.maxSampleSeconds - 0.5);
      setClips((prev) => prev.map((c, i) => (i === at ? clip : c)));
      setProblems((prev) => prev.map((p, i) => (i === at ? checkClip(clip) : p)));
    } catch {
      setError(a.recordingFailed);
    } finally {
      setRecording(false);
    }
  }

  function goTo(next: number) {
    if (next >= VOICE_SCRIPT.length) setStage("review");
    else setIndex(Math.max(0, next));
  }

  async function createVoice() {
    setStage("uploading");
    setError(null);
    const form = new FormData();
    form.append("consent", consent ? "yes" : "no");
    form.append("consentVersion", CONSENT_VERSION);
    form.append("readingLanguage", lang);
    form.append("removeBackgroundNoise", String(noisyRoom));
    form.append("durations", JSON.stringify(good.map((c) => Math.round(Math.min(c.seconds, L.maxSampleSeconds) * 10) / 10)));
    form.append("prompts", JSON.stringify(takes.map((take) => take.prompt)));
    good.forEach((clip, i) => form.append("samples", clip.blob, `sample-${i + 1}`));

    const res = await fetch("/api/voice", { method: "POST", body: form }).catch(() => null);
    if (res?.ok) {
      await recorderRef.current?.close();
      recorderRef.current = null;
      clips.forEach((clip) => clip && URL.revokeObjectURL(clip.url));
      setClips(VOICE_SCRIPT.map(() => null)); // drop the recordings from memory
      router.refresh(); // the server page now sees the voice and shows the next step
      return;
    }
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setError(uploadError(a, body?.error));
    setStage("review");
  }

  // ---- Intro ------------------------------------------------------------------
  if (stage === "intro") {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-2xl font-bold">{a.recordTitle}</h2>
          <p>{a.recordIntro(L.minSamples, VOICE_SCRIPT.length)}</p>
          <ul className="list-disc space-y-1 ps-5 text-muted">
            {a.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>

        <fieldset className="space-y-3">
          <legend className="font-bold">{a.readingQuestion}</legend>
          {(
            [
              ["en", "English", a.readEnglishHint],
              ["ur", "اردو", a.readUrduHint],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
              <input type="radio" name="lang" value={value} checked={lang === value} onChange={() => setLang(value)} className="mt-1 size-5" />
              <span>
                <span lang={value} className={`block font-bold ${value === "ur" ? "font-urdu text-lg" : ""}`}>
                  {label}
                </span>
                <span className="text-sm text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="text-sm text-muted">{a.recordingPrivacy}</p>
        {error && <Notice tone="error">{error}</Notice>}
        <Button onClick={() => void begin()}>{a.startMic}</Button>
      </section>
    );
  }

  // ---- Review + consent -----------------------------------------------------------
  if (stage === "review" || stage === "uploading") {
    const uploading = stage === "uploading";
    return (
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">{a.reviewTitle}</h2>
          <p className="text-muted">{a.reviewSummary(good.length, Math.round(totalSeconds))}</p>
        </div>

        {!enough && <Notice tone="error">{a.notEnough(L.minSamples, L.minTotalSeconds)}</Notice>}

        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-bold">{a.listenBack}</summary>
          <p className="mt-2 text-sm text-muted">{a.notKept}</p>
          <ol className="mt-3 space-y-3">
            {clips.map((clip, i) =>
              usable(clip, problems[i] ?? null) ? (
                <li key={i} className="flex flex-wrap items-center gap-3">
                  <span className="w-6 text-sm text-muted">{i + 1}</span>
                  <audio controls src={clip.url} className="h-9 max-w-full" />
                  <a href={clip.url} download={`my-voice-${i + 1}`} className="text-sm underline underline-offset-4">
                    {a.saveCopy}
                  </a>
                </li>
              ) : null,
            )}
          </ol>
        </details>

        {/* Both language versions of the statement are always shown and both are hashed into the consent record. */}
        <fieldset className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <legend className="px-1 font-bold">{a.permissionTitle}</legend>
          <p lang="en" dir="ltr">
            {CONSENT_STATEMENT.en}
          </p>
          <p lang="ur" dir="rtl" className="font-urdu text-lg leading-[2.3]">
            {CONSENT_STATEMENT.ur}
          </p>
          <label className="flex items-start gap-3 font-bold">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5" />
            {a.consentCheckbox}
          </label>
        </fieldset>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={noisyRoom} onChange={(e) => setNoisyRoom(e.target.checked)} className="mt-1 size-5" />
          <span>
            {a.noisyRoom}
            <span className="block text-sm text-muted">{a.noisyRoomHint}</span>
          </span>
        </label>

        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void createVoice()} disabled={!consent || !enough || uploading}>
            {uploading ? a.creatingVoice : a.createVoice}
          </Button>
          <Button variant="secondary" onClick={() => setStage("record")} disabled={uploading}>
            {a.backToRecording}
          </Button>
        </div>
      </section>
    );
  }

  // ---- Recording ------------------------------------------------------------------
  const clip = clips[index] ?? null;
  const problem = problems[index] ?? null;
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted">
        <p>{a.sentenceOf(index + 1, VOICE_SCRIPT.length)}</p>
        <p className="tabular-nums">{a.recordedSoFar(Math.round(totalSeconds))}</p>
      </div>

      <figure className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        <p
          lang={lang}
          dir={lang === "ur" ? "rtl" : "ltr"}
          className={lang === "ur" ? "font-urdu text-3xl leading-[2.3]" : "text-3xl font-bold leading-snug"}
        >
          {line[lang]}
        </p>
        <figcaption lang={other} dir={other === "ur" ? "rtl" : "ltr"} className={`text-muted ${other === "ur" ? "font-urdu text-lg leading-[2.2]" : ""}`}>
          {line[other]}
        </figcaption>
      </figure>

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => void toggleRecording()} variant={recording ? "danger" : "primary"} aria-pressed={recording}>
          {recording ? a.stop : clip ? a.recordAgain : a.record}
        </Button>
        <div aria-hidden className="h-2 w-40 overflow-hidden rounded-full bg-line">
          <div ref={meterRef} className="h-full origin-left scale-x-0 bg-turquoise rtl:origin-right" />
        </div>
        {recording && <span role="status">{a.recordingNow}</span>}
      </div>

      {clip && !recording && (
        <div className="space-y-3">
          <audio controls src={clip.url} className="w-full max-w-md" />
          {problem && <Notice tone={problem === "clipping" ? "info" : "error"}>{problemText(a, problem)}</Notice>}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <Button variant="secondary" onClick={() => goTo(index - 1)} disabled={recording || index === 0}>
          {a.previous}
        </Button>
        <Button onClick={() => goTo(index + 1)} disabled={recording || !usable(clip, problem)}>
          {index === VOICE_SCRIPT.length - 1 ? a.reviewRecordings : a.nextSentence}
        </Button>
        <Button variant="secondary" onClick={() => goTo(index + 1)} disabled={recording || usable(clip, problem)}>
          {a.skipSentence}
        </Button>
        {enough && index < VOICE_SCRIPT.length - 1 && (
          <Button variant="secondary" onClick={() => setStage("review")} disabled={recording}>
            {a.haveEnough}
          </Button>
        )}
      </div>
    </section>
  );
}
