"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui/form";
import { accountText } from "@/lib/i18n/account";
import type { Lang } from "@/lib/i18n/dictionary";

interface Props {
  voice: { createdAt: string; readingLanguage: "en" | "ur"; sampleSeconds: number } | null;
  lang: Lang;
}

export function VoiceSettings({ voice, lang }: Props) {
  const a = accountText[lang];
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteVoice() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/voice", { method: "DELETE" }).catch(() => null);
    setPending(false);
    if (!res || (!res.ok && res.status !== 204)) {
      setError(a.deleteVoiceFailed);
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  return (
    <section aria-labelledby="voice" className="space-y-4">
      <h2 id="voice" className="text-xl font-bold">
        {a.voiceTitle}
      </h2>
      {voice ? (
        <>
          <p className="text-muted">
            {a.voiceCreated(
              new Date(voice.createdAt).toLocaleDateString(lang === "ur" ? "ur-PK" : "en-GB"),
              voice.sampleSeconds,
              voice.readingLanguage === "en",
            )}
          </p>
          {confirming ? (
            <div className="space-y-3">
              <Notice tone="error">
                {a.deleteVoiceConfirm}
              </Notice>
              <div className="flex gap-3">
                <Button variant="danger" onClick={() => void deleteVoice()} disabled={pending}>
                  {pending ? a.deleting : a.deleteVoice}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                  {a.keepVoice}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {a.deleteVoice}
            </Button>
          )}
        </>
      ) : (
        <p>
          {a.noVoiceYet}{" "}
          <Link href="/onboarding" className="font-bold underline underline-offset-4">
            {a.recordNow}
          </Link>
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
