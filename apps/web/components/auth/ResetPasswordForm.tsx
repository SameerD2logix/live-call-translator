"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import type { Lang } from "@/lib/i18n/dictionary";
import { accountText } from "@/lib/i18n/account";

export function ResetPasswordForm({ token, lang }: { token: string | null; lang: Lang }) {
  const a = accountText[lang];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Notice tone="error">
        {a.linkMissing}{" "}
        <Link href="/forgot-password" className="underline underline-offset-4">
          {a.requestNew}
        </Link>
      </Notice>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) {
      setError(a.passwordsDiffer);
      return;
    }
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    setPending(false);
    if (error) {
      setError(authErrorMessage(error, a.resetFailed, a));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Notice tone="success">
        {a.passwordChanged}{" "}
        <Link href="/sign-in" className="font-bold underline underline-offset-4">
          {a.signIn}
        </Link>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field
        id="password"
        name="password"
        type="password"
        label={a.newPassword}
        autoComplete="new-password"
        dir="ltr"
        required
        minLength={12}
        maxLength={128}
        hint={a.newPasswordHint}
      />
      <Field id="confirm" name="confirm" type="password" label={a.repeatNewPassword} autoComplete="new-password" dir="ltr" required maxLength={128} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? a.saving : a.savePassword}
      </Button>
    </form>
  );
}
