import Link from "next/link";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { SignOutButton, SignOutOthersButton } from "@/components/settings/SignOutButton";
import { TwoFactorSettings } from "@/components/settings/TwoFactorSettings";
import { VoiceSettings } from "@/components/settings/VoiceSettings";
import { requireUser } from "@/lib/auth/session";
import { accountText } from "@/lib/i18n/account";
import { getLang } from "@/lib/i18n/server";
import { getVoiceProfile } from "@/lib/voice/repository";

export const metadata = { title: "Settings – Live Call Translator" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const voice = await getVoiceProfile(user.id);
  const lang = await getLang();
  const a = accountText[lang];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="font-bold">
          {a.backToCall}
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle lang={lang} />
          <SignOutButton lang={lang} />
        </div>
      </header>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">{a.settingsTitle}</h1>
        <p className="text-muted">
          {a.signedInAs} <bdi lang="en">{user.email}</bdi>
        </p>
      </div>

      <TwoFactorSettings enabled={user.twoFactorEnabled} lang={lang} />
      <SignOutOthersButton lang={lang} />
      <hr className="border-line" />
      <VoiceSettings
        lang={lang}
        voice={
          voice
            ? { createdAt: voice.createdAt.toISOString(), readingLanguage: voice.readingLanguage, sampleSeconds: voice.sampleSeconds }
            : null
        }
      />
      <hr className="border-line" />
      <DeleteAccount lang={lang} />
    </main>
  );
}
