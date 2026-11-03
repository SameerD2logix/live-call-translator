"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui/form";

interface Props {
  voice: { createdAt: string; readingLanguage: "en" | "ur"; sampleSeconds: number } | null;
}

export function VoiceSettings({ voice }: Props) {
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
      setError("Couldn't delete your voice right now. Nothing was removed; try again in a minute.");
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  return (
    <section aria-labelledby="voice" className="space-y-4">
      <h2 id="voice" className="text-xl font-bold">
        Your voice
      </h2>
      {voice ? (
        <>
          <p className="text-muted">
            Created on {new Date(voice.createdAt).toLocaleDateString()} from {voice.sampleSeconds} seconds of{" "}
            {voice.readingLanguage === "en" ? "English" : "Urdu"}. Only your own calls can use it.
          </p>
          {confirming ? (
            <div className="space-y-3">
              <Notice tone="error">
                Delete your voice? It&apos;s removed from our voice provider too, and you&apos;ll need to record again before your
                next call.
              </Notice>
              <div className="flex gap-3">
                <Button variant="danger" onClick={() => void deleteVoice()} disabled={pending}>
                  {pending ? "Deleting…" : "Delete my voice"}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Delete my voice
            </Button>
          )}
        </>
      ) : (
        <p>
          You haven&apos;t recorded your voice yet.{" "}
          <Link href="/onboarding" className="font-bold underline underline-offset-4">
            Record it now
          </Link>
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
