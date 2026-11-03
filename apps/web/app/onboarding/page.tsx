import Link from "next/link";
import { ProgressSteps } from "@/components/onboarding/ProgressSteps";
import { VoiceRecorder } from "@/components/onboarding/VoiceRecorder";
import { requireUser } from "@/lib/auth/session";
import { getVoiceProfile } from "@/lib/voice/repository";

export const metadata = { title: "Set up – Live Call Translator" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const voice = await getVoiceProfile(user.id);

  return (
    <main lang="en" dir="ltr" className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-5 py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="font-bold">
          Live Call Translator
        </Link>
        <Link href="/settings" className="text-sm underline underline-offset-4">
          Settings
        </Link>
      </header>
      <ProgressSteps current={voice ? 2 : 1} />

      {voice ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Your voice is ready</h2>
          <p>
            Last step: connect the translator to Zoom, Google Meet or Teams with a free virtual audio cable. It takes about
            five minutes, once per computer.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/setup" className="inline-flex rounded-full bg-cobalt px-5 py-3 font-bold text-cobalt-ink hover:brightness-110">
              Connect to my call app
            </Link>
            <Link href="/" className="inline-flex rounded-full border border-line px-5 py-3 font-bold">
              Go to the call screen
            </Link>
          </div>
        </section>
      ) : (
        <VoiceRecorder />
      )}
    </main>
  );
}
