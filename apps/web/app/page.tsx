import Link from "next/link";
import { redirect } from "next/navigation";
import { CallScreen } from "@/components/call/CallScreen";
import { requireUser } from "@/lib/auth/session";
import { dictionaries } from "@/lib/i18n/dictionary";
import { getLang } from "@/lib/i18n/server";
import { getVoiceProfile } from "@/lib/voice/repository";

export default async function HomePage() {
  const user = await requireUser("/");
  // Calls speak with the user's own voice, so record it first.
  if (!(await getVoiceProfile(user.id))) redirect("/onboarding");
  const lang = await getLang();

  return (
    <CallScreen
      lang={lang}
      accountSlot={
        <Link href="/settings" className="rounded-full border border-line px-3 py-1.5 text-sm font-bold">
          {dictionaries[lang].settings}
        </Link>
      }
    />
  );
}
