import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
}

/** The signed-in user for this request, or null. Server components and route handlers only. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as typeof session.user & { twoFactorEnabled?: boolean | null };
  // requireEmailVerification already blocks unverified sessions; this is a second check.
  if (!user.emailVerified) return null;
  return { id: user.id, name: user.name, email: user.email, twoFactorEnabled: Boolean(user.twoFactorEnabled) };
}

/** Use in protected pages: sends signed-out visitors to sign-in and back here afterwards. */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return user;
}
