"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { useTranslatorSession, type UiError } from "@/hooks/use-translator-session";
import { dictionaries, type Dict, type Lang } from "@/lib/i18n/dictionary";
import { IncomingControls } from "./IncomingControls";
import { LatencyBadge } from "./LatencyBadge";
import { OutputDevicePicker } from "./OutputDevicePicker";
import { SetupReminder } from "./SetupReminder";
import { StartStopButton } from "./StartStopButton";
import { StatusIndicator } from "./StatusIndicator";
import { SubtitleBar } from "./SubtitleBar";
import { TranscriptPanel } from "./TranscriptPanel";

/** `accountSlot`: links rendered by the server page (e.g. Settings). */
export function CallScreen({ lang, accountSlot }: { lang: Lang; accountSlot?: ReactNode }) {
  const t = dictionaries[lang];
  const s = useTranslatorSession();
  const active = s.phase === "starting" || s.phase === "live";
  const live = s.phase === "live";
  const { toggleMute } = s;

  // Keyboard shortcut: M toggles mute during a session.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m" || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (live) toggleMute();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [live, toggleMute]);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h1 className="text-lg font-bold">{t.appName}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusIndicator status={s.status} t={t} />
          <LatencyBadge ms={s.lastDelayMs} t={t} />
          <LanguageToggle lang={lang} />
          {accountSlot}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 pb-12">
        <SetupReminder t={t} />
        {s.incoming === "on" && <SubtitleBar segments={s.segments} partial={s.partial.in} t={t} />}

        <section aria-label={t.startAria} className="flex flex-col items-center gap-6 py-6">
          <StartStopButton
            active={active}
            connecting={s.phase === "starting"}
            onStart={() => void s.start()}
            onStop={s.stop}
            subscribeLevel={s.subscribeLevel}
            t={t}
          />

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleMute}
              disabled={!live}
              aria-pressed={s.muted}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 font-bold disabled:opacity-40"
            >
              {s.muted ? t.unmute : t.mute}
              <kbd lang="en" className="rounded border border-line px-1.5 text-xs font-normal text-muted">
                M
              </kbd>
            </button>
            {!active && s.segments.length > 0 && (
              <button type="button" onClick={s.clear} className="rounded-full px-5 py-2.5 text-muted underline-offset-4 hover:underline">
                {t.clearTranscript}
              </button>
            )}
          </div>

          {s.error && <ErrorNotice error={s.error} t={t} onDismiss={s.dismissError} />}

          <div className="max-w-md space-y-1 text-center text-sm text-muted">
            <p>{t.headphonesTip}</p>
            <p>{t.consentTip}</p>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <OutputDevicePicker
            output={s.output}
            onChange={(choice) => void s.setOutput(choice)}
            monitor={s.monitor}
            onMonitorChange={(value) => void s.setMonitor(value)}
            t={t}
          />
          <IncomingControls
            live={live}
            incoming={s.incoming}
            speakUrdu={s.speakUrdu}
            urduVoiceAvailable={s.urduVoiceAvailable}
            onShare={(source) => void s.startIncoming(source)}
            onStop={s.stopIncoming}
            onSpeakUrduChange={s.setSpeakUrdu}
            t={t}
          />
        </div>

        <TranscriptPanel segments={s.segments} partial={s.partial} t={t} />
      </main>
    </div>
  );
}

function ErrorNotice({ error, t, onDismiss }: { error: UiError; t: Dict; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex max-w-md items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
      <p className="flex-1">
        {t[`err_${error}`]}
        {error === "voice_required" && (
          <>
            {" "}
            <Link href="/onboarding" className="font-bold underline underline-offset-4">
              {t.setupReminderLink}
            </Link>
          </>
        )}
      </p>
      <button type="button" onClick={onDismiss} aria-label={t.dismiss} className="text-lg leading-none text-muted">
        ×
      </button>
    </div>
  );
}
