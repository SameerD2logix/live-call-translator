"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Notice tone="error">
        This reset link is missing or has expired.{" "}
        <Link href="/forgot-password" className="underline underline-offset-4">
          Request a new one
        </Link>
        .
      </Notice>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) {
      setError("The two passwords don't match.");
      return;
    }
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    setPending(false);
    if (error) {
      setError(authErrorMessage(error, "Couldn't reset your password. Request a new link and try again."));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Notice tone="success">
        Password changed, and you&apos;ve been signed out everywhere.{" "}
        <Link href="/sign-in" className="font-bold underline underline-offset-4">
          Sign in
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
        label="New password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        hint="At least 12 characters."
      />
      <Field id="confirm" name="confirm" type="password" label="Repeat new password" autoComplete="new-password" required maxLength={128} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
