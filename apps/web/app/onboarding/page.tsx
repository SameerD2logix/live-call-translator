import Link from "next/link";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { ProgressSteps } from "@/components/onboarding/ProgressSteps";
import { VoiceRecorder } from "@/components/onboarding/VoiceRecorder";
import { requireUser } from "@/lib/auth/session";
import { accountText } from "@/lib/i18n/account";
import { dictionaries } from "@/lib/i18n/dictionary";
import { getLang } from "@/lib/i18n/server";
import { getVoiceProfile } from "@/lib/voice/repository";

export const metadata = { title: "Set up – Live Call Translator" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const voice = await getVoiceProfile(user.id);
  const lang = await getLang();
  const a = accountText[lang];
  const t = dictionaries[lang];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-5 py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="font-bold">
          {t.appName}
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle lang={lang} />
          <Link href="/settings" className="text-sm underline underline-offset-4">
            {a.settings}
          </Link>
        </div>
      </header>
      <ProgressSteps
        current={voice ? 2 : 1}
        text={{ steps: t.progress, done: t.progressDone, current: t.progressCurrent, next: t.progressNext }}
      />

      {voice ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{a.voiceReadyTitle}</h2>
          <p>{a.voiceReadyBody}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/setup" className="inline-flex rounded-full bg-cobalt px-5 py-3 font-bold text-cobalt-ink hover:brightness-110">
              {a.connectCallApp}
            </Link>
            <Link href="/" className="inline-flex rounded-full border border-line px-5 py-3 font-bold">
              {a.goToCall}
            </Link>
          </div>
        </section>
      ) : (
        <VoiceRecorder lang={lang} />
      )}
    </main>
  );
}
