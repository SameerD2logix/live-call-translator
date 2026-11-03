import { AuthShell } from "@/components/auth/AuthShell";
import { TwoFactorForm } from "@/components/auth/TwoFactorForm";

export const metadata = { title: "Two-step sign-in – Live Call Translator" };

export default function TwoFactorPage() {
  return (
    <AuthShell title="Enter your code" intro="Your account uses two-step sign-in. Open your authenticator app for the current code.">
      <TwoFactorForm />
    </AuthShell>
  );
}
