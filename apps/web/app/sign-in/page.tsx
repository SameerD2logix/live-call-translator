import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";
import { getCurrentUser } from "@/lib/auth/session";
import { accountText } from "@/lib/i18n/account";
import { getLang } from "@/lib/i18n/server";
import { safeNext } from "@/lib/safe-redirect";

export const metadata = { title: "Sign in – Live Call Translator" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  const lang = await getLang();
  const a = accountText[lang];
  return (
    <AuthShell
      lang={lang}
      title={a.signInTitle}
      intro={a.signInIntro}
      footer={
        <p>
          {a.newHere}{" "}
          <Link href="/sign-up" className="font-bold text-ink underline underline-offset-4">
            {a.createAccountLink}
          </Link>
        </p>
      }
    >
      <SignInForm next={next} lang={lang} />
    </AuthShell>
  );
}
