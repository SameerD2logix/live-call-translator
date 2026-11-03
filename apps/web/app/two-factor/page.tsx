import { AuthShell } from "@/components/auth/AuthShell";
import { TwoFactorForm } from "@/components/auth/TwoFactorForm";
import { accountText } from "@/lib/i18n/account";
import { getLang } from "@/lib/i18n/server";

export const metadata = { title: "Two-step sign-in – Live Call Translator" };

export default async function TwoFactorPage() {
  const lang = await getLang();
  const a = accountText[lang];
  return (
    <AuthShell lang={lang} title={a.twoFactorTitle} intro={a.twoFactorIntro}>
      <TwoFactorForm lang={lang} />
    </AuthShell>
  );
}
