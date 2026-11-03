"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import type { Lang } from "@/lib/i18n/dictionary";
import { accountText } from "@/lib/i18n/account";

/** Second sign-in step: a code from the authenticator app, or a one-time backup code. */
export function TwoFactorForm({ lang }: { lang: Lang }) {
  const a = accountText[lang];
  const [useBackup, setUseBackup] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code")).replace(/\s+/g, "");
    const trustDevice = form.get("trust") === "on";
    const { error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    if (error) {
      setError(authErrorMessage(error, a.err_badCode, a));
      setPending(false);
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field
        key={useBackup ? "backup" : "totp"}
        id="code"
        name="code"
        label={useBackup ? a.backupLabel : a.totpLabel}
        dir="ltr"
        inputMode={useBackup ? "text" : "numeric"}
        autoComplete="one-time-code"
        pattern={useBackup ? undefined : "[0-9 ]{6,7}"}
        maxLength={useBackup ? 32 : 7}
        required
        autoFocus
      />
      <label className="flex items-center gap-3">
        <input type="checkbox" name="trust" className="size-5" />
        {a.trustDevice}
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? a.checking : a.continue}
      </Button>
      <button type="button" onClick={() => setUseBackup((v) => !v)} className="text-sm underline underline-offset-4">
        {useBackup ? a.useApp : a.useBackup}
      </button>
    </form>
  );
}
