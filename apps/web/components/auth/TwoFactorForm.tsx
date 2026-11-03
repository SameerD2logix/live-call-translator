"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

/** Second sign-in step: a code from the authenticator app, or a one-time backup code. */
export function TwoFactorForm() {
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
      setError(authErrorMessage(error, "That code didn't work. Check it and try again."));
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
        label={useBackup ? "Backup code" : "6-digit code from your authenticator app"}
        inputMode={useBackup ? "text" : "numeric"}
        autoComplete="one-time-code"
        pattern={useBackup ? undefined : "[0-9 ]{6,7}"}
        maxLength={useBackup ? 32 : 7}
        required
        autoFocus
      />
      <label className="flex items-center gap-3">
        <input type="checkbox" name="trust" className="size-5" />
        Trust this device (you&apos;ll be asked for a code less often)
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
      <button type="button" onClick={() => setUseBackup((v) => !v)} className="text-sm underline underline-offset-4">
        {useBackup ? "Use your authenticator app instead" : "Lost your phone? Use a backup code"}
      </button>
    </form>
  );
}
