"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { accountText } from "@/lib/i18n/account";
import type { Lang } from "@/lib/i18n/dictionary";

export function DeleteAccount({ lang }: { lang: Lang }) {
  const a = accountText[lang];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.deleteUser({ password: String(new FormData(event.currentTarget).get("password")) });
    if (error) {
      setError(authErrorMessage(error, a.deleteAccountFailed, a));
      setPending(false);
      return;
    }
    window.location.assign("/sign-up");
  }

  return (
    <section aria-labelledby="delete-account" className="space-y-4">
      <h2 id="delete-account" className="text-xl font-bold">
        {a.deleteAccountTitle}
      </h2>
      <p className="text-muted">{a.deleteAccountBody}</p>
      <form onSubmit={onSubmit} className="max-w-sm space-y-4">
        <Field id="delete-password" name="password" type="password" label={a.yourPassword} autoComplete="current-password" dir="ltr" required />
        <label className="flex items-start gap-3">
          <input type="checkbox" required className="mt-1 size-5" />
          {a.understandIrreversible}
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? a.deleting : a.deleteAccount}
        </Button>
      </form>
    </section>
  );
}
