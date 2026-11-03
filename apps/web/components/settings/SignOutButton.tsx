"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void authClient.signOut().then(() => window.location.assign("/sign-in"))}
      className="font-bold underline underline-offset-4"
    >
      Sign out
    </button>
  );
}
