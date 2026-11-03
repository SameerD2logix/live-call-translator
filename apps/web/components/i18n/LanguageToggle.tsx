"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, dictionaries, type Lang } from "@/lib/i18n/dictionary";

/** Switches the interface between English and Urdu. Remembered for a year on this device. */
export function LanguageToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const t = dictionaries[lang];
  const next: Lang = lang === "ur" ? "en" : "ur";

  return (
    <button
      type="button"
      lang={next}
      aria-label={t.switchLanguageLabel}
      onClick={() => {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${LANG_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
        router.refresh();
      }}
      className={`rounded-full border border-line px-3 py-1.5 text-sm font-bold ${next === "ur" ? "font-urdu" : ""}`}
    >
      {t.otherLanguageName}
    </button>
  );
}
