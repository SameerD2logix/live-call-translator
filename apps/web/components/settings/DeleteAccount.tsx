"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function DeleteAccount() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.deleteUser({ password: String(new FormData(event.currentTarget).get("password")) });
    if (error) {
      setError(authErrorMessage(error, "Couldn't delete your account. Check your password and try again."));
      setPending(false);
      return;
    }
    window.location.assign("/sign-up");
  }

  return (
    <section aria-labelledby="delete-account" className="space-y-4">
      <h2 id="delete-account" className="text-xl font-bold">
        Delete account
      </h2>
      <p className="text-muted">
        Permanently deletes your account, your cloned voice (at our voice provider too), your consent records and your
        settings. This can&apos;t be undone.
      </p>
      <form onSubmit={onSubmit} className="max-w-sm space-y-4">
        <Field id="delete-password" name="password" type="password" label="Your password" autoComplete="current-password" required />
        <label className="flex items-start gap-3">
          <input type="checkbox" required className="mt-1 size-5" />I understand this can&apos;t be undone.
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </form>
    </section>
  );
}
