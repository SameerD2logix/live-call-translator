import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { accountText } from "@/lib/i18n/account";
import { getLang } from "@/lib/i18n/server";

export const metadata = { title: "Choose a new password – Live Call Translator" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && !error;
  const lang = await getLang();
  return (
    <AuthShell lang={lang} title={accountText[lang].resetTitle}>
      <ResetPasswordForm token={valid ? token : null} lang={lang} />
    </AuthShell>
  );
}
