"use client";

/**
 * Voice onboarding: read short sentences aloud, review the takes, give explicit consent,
 * then create the clone. Recordings exist only in this tab's memory until upload, and the
 * servers drop them as soon as the clone is created.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VOICE_SAMPLE_LIMITS as L } from "@lct/protocol";
import { Button, Notice } from "@/components/ui/form";
import { checkClip, SampleRecorder, type Clip, type ClipProblem } from "@/lib/audio/sample-recorder";
import { CONSENT_STATEMENT, CONSENT_VERSION } from "@/lib/voice/consent";
import { VOICE_SCRIPT } from "@/lib/voice/script";

type Stage = "intro" | "record" | "review" | "uploading";
type Lang = "en" | "ur";

const PROBLEM_TEXT: Record<ClipProblem, string> = {
  too_short: "That take was very short. Read the whole sentence, then press Stop.",
  too_quiet: "That was too quiet. Move a little closer to the microphone and record again.",
  clipping: "That was loud enough to crackle. Move back a little and record again, or keep it if it sounds fine.",
};

const UPLOAD_ERRORS: Record<string, string> = {
  voice_exists: "You already have a voice. Delete it in Settings before recording a new one.",
  too_many_attempts: "You've tried several times today. Try again tomorrow.",
  invalid_audio: "The voice service couldn't use these recordings. Try recording somewhere quieter.",
  provider_unavailable: "The voice service isn't responding. Your recordings are still here, so try again in a minute.",
  unauthorized: "Your sign-in expired. Sign in again, then record again.",
  script_mismatch:
    "Some recordings don't match their sentences. Listen back, re-record the ones that sound off, and read each sentence as shown.",
};

const usable = (clip: Clip | null, problem: ClipProblem | null): clip is Clip =>
  clip !== null && problem !== "too_short" && problem !== "too_quiet";

export function VoiceRecorder() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("intro");
  const [lang, setLang] = useState<Lang>("en");
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
  const other: Lang = lang === "en" ? "ur" : "en";

  async function begin() {
    setError(null);
    try {
      recorderRef.current = await SampleRecorder.open();
      setStage("record");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it from the icon in the address bar, then try again."
          : err instanceof Error
            ? err.message
            : "Couldn't open the microphone.",
      );
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
      setError("Recording stopped unexpectedly. Check your microphone and try again.");
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
    setError(UPLOAD_ERRORS[body?.error ?? ""] ?? "Couldn't create your voice. Try again.");
    setStage("review");
  }

  // ---- Intro ------------------------------------------------------------------
  if (stage === "intro") {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-2xl font-bold">Record your voice</h2>
          <p>
            Read {L.minSamples}–{VOICE_SCRIPT.length} short sentences out loud, about 1–2 minutes in total. Your client
            will hear your translated English in this voice.
          </p>
          <ul className="list-disc space-y-1 ps-5 text-muted">
            <li>Choose a quiet room. Curtains, a bed or a sofa nearby reduce echo.</li>
            <li>Keep the microphone about a hand&apos;s width from your mouth.</li>
            <li>Speak the way you do on calls: relaxed and steady.</li>
          </ul>
        </div>

        <fieldset className="space-y-3">
          <legend className="font-bold">Which language do you want to read?</legend>
          {(
            [
              ["en", "English", "Recommended: your clone will speak English."],
              ["ur", "اردو", "Fine too. The clone learns your voice, not the words."],
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

        <p className="text-sm text-muted">
          Your recordings are sent once to our voice provider to create the voice, then deleted. We keep only an id
          for the voice, and you can delete it at any time.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        <Button onClick={() => void begin()}>Turn on microphone and start</Button>
      </section>
    );
  }

  // ---- Review + consent -----------------------------------------------------------
  if (stage === "review" || stage === "uploading") {
    const uploading = stage === "uploading";
    return (
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Check and confirm</h2>
          <p className="text-muted">
            {good.length} recordings, {Math.round(totalSeconds)} seconds in total.
          </p>
        </div>

        {!enough && (
          <Notice tone="error">
            Record at least {L.minSamples} sentences and {L.minTotalSeconds} seconds in total before creating your voice.
          </Notice>
        )}

        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-bold">Listen back or save copies</summary>
          <p className="mt-2 text-sm text-muted">We don&apos;t keep your recordings. Save any you want to keep now.</p>
          <ol className="mt-3 space-y-3">
            {clips.map((clip, i) =>
              usable(clip, problems[i] ?? null) ? (
                <li key={i} className="flex flex-wrap items-center gap-3">
                  <span className="w-6 text-sm text-muted">{i + 1}</span>
                  <audio controls src={clip.url} className="h-9 max-w-full" />
                  <a href={clip.url} download={`my-voice-${i + 1}`} className="text-sm underline underline-offset-4">
                    Save
                  </a>
                </li>
              ) : null,
            )}
          </ol>
        </details>

        <fieldset className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <legend className="px-1 font-bold">Your permission</legend>
          <p>{CONSENT_STATEMENT.en}</p>
          <p lang="ur" dir="rtl" className="font-urdu text-lg leading-[2.3]">
            {CONSENT_STATEMENT.ur}
          </p>
          <label className="flex items-start gap-3 font-bold">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5" />
            This is my own voice and I allow it to be cloned.
          </label>
        </fieldset>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={noisyRoom} onChange={(e) => setNoisyRoom(e.target.checked)} className="mt-1 size-5" />
          <span>
            My room was noisy
            <span className="block text-sm text-muted">Removes background noise. Leave off for clean recordings: it can make them sound worse.</span>
          </span>
        </label>

        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void createVoice()} disabled={!consent || !enough || uploading}>
            {uploading ? "Creating your voice…" : "Create my voice"}
          </Button>
          <Button variant="secondary" onClick={() => setStage("record")} disabled={uploading}>
            Back to recording
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
        <p>
          Sentence {index + 1} of {VOICE_SCRIPT.length}
        </p>
        <p className="tabular-nums">
          Recorded: {Math.round(totalSeconds)} s (aim for 60–120 s)
        </p>
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
          {recording ? "Stop" : clip ? "Record again" : "Record"}
        </Button>
        <div aria-hidden className="h-2 w-40 overflow-hidden rounded-full bg-line">
          <div ref={meterRef} className="h-full origin-left scale-x-0 bg-turquoise" />
        </div>
        {recording && <span role="status">Recording… read the sentence, then press Stop.</span>}
      </div>

      {clip && !recording && (
        <div className="space-y-3">
          <audio controls src={clip.url} className="w-full max-w-md" />
          {problem && <Notice tone={problem === "clipping" ? "info" : "error"}>{PROBLEM_TEXT[problem]}</Notice>}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <Button variant="secondary" onClick={() => goTo(index - 1)} disabled={recording || index === 0}>
          Previous
        </Button>
        <Button onClick={() => goTo(index + 1)} disabled={recording || !usable(clip, problem)}>
          {index === VOICE_SCRIPT.length - 1 ? "Review recordings" : "Next sentence"}
        </Button>
        <Button variant="secondary" onClick={() => goTo(index + 1)} disabled={recording || usable(clip, problem)}>
          Skip this one
        </Button>
        {enough && index < VOICE_SCRIPT.length - 1 && (
          <Button variant="secondary" onClick={() => setStage("review")} disabled={recording}>
            I have enough, review
          </Button>
        )}
      </div>
    </section>
  );
}
