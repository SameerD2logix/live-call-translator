"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { accountText } from "@/lib/i18n/account";
import type { Lang } from "@/lib/i18n/dictionary";

type Step =
  | { kind: "idle" }
  | { kind: "password"; action: "enable" | "disable" | "codes" }
  | { kind: "scan"; qr: string; secret: string; backupCodes: string[] }
  | { kind: "codes"; backupCodes: string[] };

/** Turn two-step sign-in on or off, and manage backup codes. Every change needs the password. */
export function TwoFactorSettings({ enabled, lang }: { enabled: boolean; lang: Lang }) {
  const a = accountText[lang];
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "password") return;
    setPending(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password"));

    if (step.action === "enable") {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data) return fail(error);
      const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 });
      const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
      setStep({ kind: "scan", qr, secret, backupCodes: data.backupCodes });
    } else if (step.action === "disable") {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) return fail(error);
      setStep({ kind: "idle" });
      router.refresh();
    } else {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
      if (error || !data) return fail(error);
      setStep({ kind: "codes", backupCodes: data.backupCodes });
    }
    setPending(false);
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "scan") return;
    setPending(true);
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code")).replace(/\s+/g, "");
    // 2FA only switches on once a code from the app proves the setup worked.
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    if (error) return fail(error);
    setStep({ kind: "codes", backupCodes: step.backupCodes });
    setPending(false);
    router.refresh();
  }

  function fail(err: { status?: number; code?: string } | null) {
    setError(authErrorMessage(err, a.twoFaFailed, a));
    setPending(false);
  }

  return (
    <section aria-labelledby="twofa" className="space-y-4">
      <h2 id="twofa" className="text-xl font-bold">
        {a.twoFaTitle}
      </h2>
      <p className="text-muted">
        {enabled ? a.twoFaOn : a.twoFaOff}
      </p>

      {step.kind === "idle" &&
        (enabled ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setStep({ kind: "password", action: "codes" })}>
              {a.newBackupCodes}
            </Button>
            <Button variant="danger" onClick={() => setStep({ kind: "password", action: "disable" })}>
              {a.turnOff}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setStep({ kind: "password", action: "enable" })}>{a.turnOn2fa}</Button>
        ))}

      {step.kind === "password" && (
        <form onSubmit={onPassword} className="max-w-sm space-y-4">
          <Field id="twofa-password" name="password" type="password" label={a.yourPassword} autoComplete="current-password" dir="ltr" required autoFocus />
          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {a.continue}
            </Button>
            <Button variant="secondary" onClick={() => setStep({ kind: "idle" })}>
              {a.cancel}
            </Button>
          </div>
        </form>
      )}

      {step.kind === "scan" && (
        <form onSubmit={onVerify} className="space-y-4">
          <p>{a.scanQr}</p>
          {/* A data: URL generated in the browser, so next/image adds nothing here. */}
          <img src={step.qr} alt={a.qrAlt} width={220} height={220} className="rounded-lg bg-white p-2" />
          <p className="text-sm text-muted">
            {a.cantScan}{" "}
            <code lang="en" dir="ltr" className="break-all font-bold text-ink">
              {step.secret}
            </code>
          </p>
          <Field id="totp" name="code" label={a.sixDigitCode} dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
          <Button type="submit" disabled={pending}>
            {a.turnOn}
          </Button>
        </form>
      )}

      {step.kind === "codes" && (
        <div className="space-y-3">
          <Notice tone="success">
            {a.saveBackupCodes}
          </Notice>
          <ul lang="en" dir="ltr" className="grid max-w-sm grid-cols-2 gap-2 font-mono">
            {step.backupCodes.map((code) => (
              <li key={code} className="rounded border border-line bg-surface px-3 py-1.5 text-center">
                {code}
              </li>
            ))}
          </ul>
          <Button onClick={() => setStep({ kind: "idle" })}>{a.savedThem}</Button>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
