import Link from "next/link";
import { redirect } from "next/navigation";
import { CallScreen } from "@/components/call/CallScreen";
import { requireUser } from "@/lib/auth/session";
import { getVoiceProfile } from "@/lib/voice/repository";

export default async function HomePage() {
  const user = await requireUser("/");
  // Calls speak with the user's own voice, so record it first.
  if (!(await getVoiceProfile(user.id))) redirect("/onboarding");

  return (
    <CallScreen
      accountSlot={
        <Link href="/settings" className="rounded-full border border-line px-3 py-1.5 text-sm font-bold">
          Settings
        </Link>
      }
    />
  );
}
