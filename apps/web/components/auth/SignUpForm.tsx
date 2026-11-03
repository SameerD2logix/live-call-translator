"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import type { Lang } from "@/lib/i18n/dictionary";
import { accountText } from "@/lib/i18n/account";

export function SignUpForm({ lang }: { lang: Lang }) {
  const a = accountText[lang];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError(a.passwordsDiffer);
      return;
    }

    setPending(true);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email,
      password,
      // Where the confirmation link lands: straight into recording your voice.
      callbackURL: `${window.location.origin}/onboarding`,
    });
    setPending(false);
    if (error) {
      // Same message whether or not the email is already registered (no account probing).
      setError(authErrorMessage(error, a.signUpFailed, a));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Notice tone="success">
        <p className="font-bold">{a.checkEmailTitle}</p>
        <p className="mt-1">{a.checkEmailBody(sentTo)}</p>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field id="name" name="name" label={a.yourName} autoComplete="name" required maxLength={80} />
      <Field id="email" name="email" type="email" label={a.email} autoComplete="email" dir="ltr" required maxLength={254} />
      <Field
        id="password"
        name="password"
        type="password"
        label={a.password}
        autoComplete="new-password"
        dir="ltr"
        required
        minLength={12}
        maxLength={128}
        hint={a.passwordHint}
      />
      <Field id="confirm" name="confirm" type="password" label={a.repeatPassword} autoComplete="new-password" dir="ltr" required maxLength={128} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? a.creatingAccount : a.createAccount}
      </Button>
    </form>
  );
}
