import Link from "next/link";
import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { dictionaries, type Lang } from "@/lib/i18n/dictionary";

/** Narrow, centred column shared by every sign-in related page. */
export function AuthShell({
  lang,
  title,
  intro,
  children,
  footer,
}: {
  lang: Lang;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-12">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="font-bold">
          {dictionaries[lang].appName}
        </Link>
        <LanguageToggle lang={lang} />
      </div>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <div className="text-muted">{intro}</div>}
      </header>
      {children}
      {footer && <div className="space-y-2 text-sm text-muted">{footer}</div>}
    </main>
  );
}
