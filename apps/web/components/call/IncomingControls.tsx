"use client";

import type { IncomingPhase } from "@/hooks/use-translator-session";
import type { CallSource } from "@/lib/audio/call-capture";
import type { Dict } from "@/lib/i18n/dictionary";

interface Props {
  live: boolean;
  incoming: IncomingPhase;
  speakUrdu: boolean;
  urduVoiceAvailable: boolean;
  onShare: (source: CallSource) => void;
  onStop: () => void;
  onSpeakUrduChange: (value: boolean) => void;
  t: Dict;
}

/** Turn on the client → you direction by sharing the call's sound. */
export function IncomingControls({ live, incoming, speakUrdu, urduVoiceAvailable, onShare, onStop, onSpeakUrduChange, t }: Props) {
  const choices: Array<{ source: CallSource; title: string; hint: string }> = [
    { source: "tab", title: t.shareTab, hint: t.shareTabHint },
    { source: "screen", title: t.shareScreen, hint: t.shareScreenHint },
  ];

  return (
    <section aria-labelledby="incoming-title" className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <h2 id="incoming-title" className="font-bold">
        {t.incomingTitle}
      </h2>

      {!live ? (
        <p className="text-sm text-muted">{t.incomingNeedsCall}</p>
      ) : incoming === "on" ? (
        <div className="space-y-3">
          <p role="status" className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full bg-turquoise" />
            {t.incomingLive}
          </p>
          <button type="button" onClick={onStop} className="rounded-full border border-line px-4 py-2 text-sm font-bold">
            {t.stopSharing}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">{t.incomingIntro}</p>
          {choices.map(({ source, title, hint }) => (
            <button
              key={source}
              type="button"
              onClick={() => onShare(source)}
              disabled={incoming === "starting"}
              className="block w-full rounded-xl border border-line bg-bg px-4 py-3 text-start hover:border-turquoise disabled:opacity-50"
            >
              <span className="block font-bold">{title}</span>
              <span className="block text-sm text-muted">{hint}</span>
            </button>
          ))}
        </div>
      )}

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={speakUrdu}
          disabled={live && !urduVoiceAvailable}
          onChange={(e) => onSpeakUrduChange(e.target.checked)}
          className="mt-1 size-4"
        />
        {t.speakUrdu}
      </label>
      {live && !urduVoiceAvailable && <p className="text-xs text-muted">{t.speakUrduUnavailable}</p>}
    </section>
  );
}
