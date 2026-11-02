"use client";

import { useEffect } from "react";
import { useTranslatorSession } from "@/hooks/use-translator-session";
import { LatencyBadge } from "./LatencyBadge";
import { StartStopButton } from "./StartStopButton";
import { StatusIndicator } from "./StatusIndicator";
import { TranscriptPanel } from "./TranscriptPanel";

export function CallScreen() {
  const { phase, status, muted, error, segments, partial, lastDelayMs, start, stop, toggleMute, clear, subscribeLevel } =
    useTranslatorSession();
  const active = phase === "starting" || phase === "live";

  // Keyboard shortcut: M toggles mute during a session.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m" || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")) return;
      if (phase === "live") toggleMute();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, toggleMute]);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h1 className="text-lg font-bold">Live Call Translator</h1>
        <div className="flex items-center gap-2">
          <StatusIndicator status={status} />
          <LatencyBadge ms={lastDelayMs} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-12">
        <section aria-label="Translation controls" className="flex flex-col items-center gap-6 py-10">
          <StartStopButton
            active={active}
            connecting={phase === "starting"}
            onStart={() => void start()}
            onStop={stop}
            subscribeLevel={subscribeLevel}
          />

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleMute}
              disabled={phase !== "live"}
              aria-pressed={muted}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 font-bold disabled:opacity-40"
            >
              {muted ? "Unmute microphone" : "Mute microphone"}
              <kbd className="rounded border border-line px-1.5 text-xs font-normal text-muted">M</kbd>
            </button>
            {!active && segments.length > 0 && (
              <button type="button" onClick={clear} className="rounded-full px-5 py-2.5 text-muted underline-offset-4 hover:underline">
                Clear transcript
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="max-w-md rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-center">
              {error}
            </p>
          )}

          <div className="max-w-md space-y-1 text-center text-sm text-muted">
            <p>Wear headphones so your microphone doesn&apos;t pick up the translated voice.</p>
            <p>Let your client know you&apos;re using a live translation tool.</p>
          </div>
        </section>

        <TranscriptPanel segments={segments} partial={partial} />
      </main>
    </div>
  );
}
