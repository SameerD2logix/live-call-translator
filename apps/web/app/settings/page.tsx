import Link from "next/link";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { TwoFactorSettings } from "@/components/settings/TwoFactorSettings";
import { VoiceSettings } from "@/components/settings/VoiceSettings";
import { requireUser } from "@/lib/auth/session";
import { getVoiceProfile } from "@/lib/voice/repository";

export const metadata = { title: "Settings – Live Call Translator" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const voice = await getVoiceProfile(user.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-5 py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="font-bold">
          Back to the call screen
        </Link>
        <SignOutButton />
      </header>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted">Signed in as {user.email}</p>
      </div>

      <TwoFactorSettings enabled={user.twoFactorEnabled} />
      <hr className="border-line" />
      <VoiceSettings
        voice={
          voice
            ? { createdAt: voice.createdAt.toISOString(), readingLanguage: voice.readingLanguage, sampleSeconds: voice.sampleSeconds }
            : null
        }
      />
      <hr className="border-line" />
      <DeleteAccount />
    </main>
  );
}
