import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { ProgressSteps } from "@/components/onboarding/ProgressSteps";
import { getCurrentUser } from "@/lib/auth/session";
import { accountText } from "@/lib/i18n/account";
import { dictionaries } from "@/lib/i18n/dictionary";
import { getLang } from "@/lib/i18n/server";

export const metadata = { title: "Create account – Live Call Translator" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/");
  const lang = await getLang();
  const a = accountText[lang];
  const t = dictionaries[lang];
  return (
    <AuthShell
      lang={lang}
      title={a.signUpTitle}
      intro={<ProgressSteps current={0} text={{ steps: t.progress, done: t.progressDone, current: t.progressCurrent, next: t.progressNext }} />}
      footer={
        <p>
          {a.haveAccount}{" "}
          <Link href="/sign-in" className="font-bold text-ink underline underline-offset-4">
            {a.signIn}
          </Link>
        </p>
      }
    >
      <SignUpForm lang={lang} />
    </AuthShell>
  );
}
