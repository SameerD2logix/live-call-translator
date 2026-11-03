"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import type { Lang } from "@/lib/i18n/dictionary";
import { accountText } from "@/lib/i18n/account";

export function SignInForm({ next, lang }: { next: string; lang: Lang }) {
  const a = accountText[lang];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError(authErrorMessage(error, a.signInFailed, a));
      setPending(false);
      return;
    }
    // Accounts with two-step sign-in: the 2FA plugin takes the user to /two-factor.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
    window.location.assign(next); // full navigation so server pages see the new session
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field id="email" name="email" type="email" label={a.email} autoComplete="email" dir="ltr" required maxLength={254} />
      <Field id="password" name="password" type="password" label={a.password} autoComplete="current-password" dir="ltr" required maxLength={128} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? a.signingIn : a.signIn}
      </Button>
      <p className="text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">
          {a.forgotPassword}
        </Link>
      </p>
    </form>
  );
}
