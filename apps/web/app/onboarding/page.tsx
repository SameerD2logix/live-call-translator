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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-5 py-10">
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
            Next, connect the translator to Zoom or Google Meet with a virtual audio cable. That guided setup comes in the
            next update. Until then, try it on the call screen with headphones: you&apos;ll hear your English in your own
            voice.
          </p>
          <Link href="/" className="inline-flex rounded-full bg-cobalt px-5 py-3 font-bold text-cobalt-ink hover:brightness-110">
            Go to the call screen
          </Link>
        </section>
      ) : (
        <VoiceRecorder />
      )}
    </main>
  );
}
