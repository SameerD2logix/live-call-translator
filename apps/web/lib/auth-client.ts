"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser-side auth API. Talks only to our own /api/auth routes (same origin). */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      // Password was right but this account has 2FA: finish sign-in on the code screen.
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
  ],
});
