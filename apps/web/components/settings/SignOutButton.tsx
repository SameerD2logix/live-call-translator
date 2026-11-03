"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { accountText } from "@/lib/i18n/account";
import type { Lang } from "@/lib/i18n/dictionary";

export function SignOutButton({ lang }: { lang: Lang }) {
  return (
    <button
      type="button"
      onClick={() => void authClient.signOut().then(() => window.location.assign("/sign-in"))}
      className="font-bold underline underline-offset-4"
    >
      {accountText[lang].signOut}
    </button>
  );
}

/** Ends every session except this one (e.g. after using a shared or lost computer). */
export function SignOutOthersButton({ lang }: { lang: Lang }) {
  const a = accountText[lang];
  const [result, setResult] = useState<"done" | "failed" | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void authClient.revokeOtherSessions().then(({ error }) => setResult(error ? "failed" : "done"))}
        className="rounded-full border border-line px-4 py-2 text-sm font-bold"
      >
        {a.signOutOthers}
      </button>
      {result && (
        <p role="status" className={`text-sm ${result === "failed" ? "text-danger" : "text-muted"}`}>
          {result === "done" ? a.signedOutOthers : a.signOutOthersFailed}
        </p>
      )}
    </div>
  );
}
