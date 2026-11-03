import Link from "next/link";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { ProgressSteps } from "@/components/onboarding/ProgressSteps";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { requireUser } from "@/lib/auth/session";
import { dictionaries } from "@/lib/i18n/dictionary";
import { getLang } from "@/lib/i18n/server";

export const metadata = { title: "Connect to your call app – Live Call Translator" };

export default async function SetupPage() {
  await requireUser("/setup");
  const lang = await getLang();
  const t = dictionaries[lang];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-5 py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="font-bold">
          {t.appName}
        </Link>
        <LanguageToggle lang={lang} />
      </header>
      <ProgressSteps
        current={2}
        text={{ steps: t.progress, done: t.progressDone, current: t.progressCurrent, next: t.progressNext }}
      />
      <SetupWizard lang={lang} />
    </main>
  );
}
