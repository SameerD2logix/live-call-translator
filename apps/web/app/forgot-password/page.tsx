import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { accountText } from "@/lib/i18n/account";
import { getLang } from "@/lib/i18n/server";

export const metadata = { title: "Reset password – Live Call Translator" };

export default async function ForgotPasswordPage() {
  const lang = await getLang();
  const a = accountText[lang];
  return (
    <AuthShell lang={lang} title={a.forgotTitle} intro={a.forgotIntro}>
      <ForgotPasswordForm lang={lang} />
    </AuthShell>
  );
}
