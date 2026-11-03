import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Reset password – Live Call Translator" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" intro="Enter your account's email and we'll send you a reset link.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
