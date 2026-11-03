"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function SignUpForm() {
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
      setError("The two passwords don't match.");
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
      setError(
        authErrorMessage(error, "Couldn't create an account with this email. If you already have one, sign in or reset your password."),
      );
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Notice tone="success">
        <p className="font-bold">Check your email</p>
        <p className="mt-1">
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it on this device to finish. It expires in 1 hour.
        </p>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field id="name" name="name" label="Your name" autoComplete="name" required maxLength={80} />
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required maxLength={254} />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        hint="At least 12 characters. A few random words work well."
      />
      <Field id="confirm" name="confirm" type="password" label="Repeat password" autoComplete="new-password" required maxLength={128} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
