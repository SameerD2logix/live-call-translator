import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { ProgressSteps } from "@/components/onboarding/ProgressSteps";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "Create account – Live Call Translator" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthShell
      title="Create your account"
      intro={<ProgressSteps current={0} />}
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-bold text-ink underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
