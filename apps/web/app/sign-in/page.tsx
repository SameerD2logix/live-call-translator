import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/safe-redirect";

export const metadata = { title: "Sign in – Live Call Translator" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell
      title="Sign in"
      intro="Speak Urdu on your client calls. They hear English, in your voice."
      footer={
        <p>
          New here?{" "}
          <Link href="/sign-up" className="font-bold text-ink underline underline-offset-4">
            Create an account
          </Link>
        </p>
      }
    >
      <SignInForm next={next} />
    </AuthShell>
  );
}
