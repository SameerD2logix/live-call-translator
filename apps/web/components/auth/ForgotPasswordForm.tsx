"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await authClient.requestPasswordReset({
      email: String(form.get("email")).trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Always the same answer, so this form can't be used to find out who has an account.
    setDone(true);
    setPending(false);
  }

  if (done) {
    return (
      <Notice tone="success">
        If an account exists for that email, we&apos;ve sent a reset link. It expires in 30 minutes.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required maxLength={254} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
