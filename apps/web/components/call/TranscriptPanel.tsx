"use client";

import { memo, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MAX_TYPED_CHARS } from "@lct/protocol";
import type { Direction } from "@lct/protocol";
import type { Segment } from "@/hooks/use-translator-session";
import type { Dict } from "@/lib/i18n/dictionary";

interface Actions {
  /** Repeat and Fix work only while you're live. */
  live: boolean;
  onRepeat: (segmentId: number) => void;
  onSay: (text: string, lang: "ur" | "en", replaces: number) => void;
}

interface Props extends Actions {
  segments: Segment[];
  partial: Record<Direction, string>;
  t: Dict;
}

/** Which language each side of a row is in, per direction. */
const LANGS: Record<Direction, { original: "ur" | "en"; translation: "ur" | "en" }> = {
  out: { original: "ur", translation: "en" },
  in: { original: "en", translation: "ur" },
};

function textProps(lang: "ur" | "en") {
  return lang === "ur"
    ? { lang, dir: "rtl" as const, className: "font-urdu text-xl leading-[2.4]" }
    : { lang, dir: "ltr" as const, className: "text-lg leading-relaxed" };
}

/**
 * The whole conversation, in order. Each row pairs what was said with its translation, so a
 * mistranslation is easy to spot. Your lines and your client's lines are marked differently.
 */
export const TranscriptPanel = memo(function TranscriptPanel({ segments, partial, t, live, onRepeat, onSay }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Follow new lines unless the user has scrolled up to read something.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [segments, partial]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const empty = segments.length === 0 && !partial.out && !partial.in;

  return (
    <section aria-labelledby="transcript-heading" className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h2 id="transcript-heading" className="sr-only">
        {t.transcriptHeading}
      </h2>
      <div aria-hidden className="hidden border-b border-line md:grid md:grid-cols-2">
        <p className="px-5 py-3 text-sm font-bold text-muted">{t.colOriginal}</p>
        <p className="border-s border-line px-5 py-3 text-sm font-bold text-muted">{t.colTranslation}</p>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="max-h-[55dvh] min-h-48 overflow-y-auto">
        {empty ? (
          <p className="mx-auto max-w-prose px-5 py-12 text-center text-muted">{t.emptyTranscript}</p>
        ) : (
          <ol aria-live="polite" aria-relevant="additions">
            {segments.map((segment) => (
              <Row
                key={`${segment.session}-${segment.dir}-${segment.id}`}
                segment={segment}
                t={t}
                live={live}
                onRepeat={onRepeat}
                onSay={onSay}
              />
            ))}
            {(["out", "in"] as const).map((dir) =>
              partial[dir] ? (
                <li key={`partial-${dir}`} aria-hidden className={`border-s-4 md:grid md:grid-cols-2 ${dir === "in" ? "border-turquoise/50" : "border-cobalt/30"}`}>
                  <p {...textProps(LANGS[dir].original)} className={`${textProps(LANGS[dir].original).className} px-5 py-3 text-muted`}>
                    {partial[dir]}
                  </p>
                </li>
              ) : null,
            )}
          </ol>
        )}
      </div>
    </section>
  );
});

function Row({ segment, t, live, onRepeat, onSay }: { segment: Segment; t: Dict } & Actions) {
  const { dir, original, translation, failed, delayMs, typed, corrected } = segment;
  const [fixing, setFixing] = useState(false);
  const langs = LANGS[dir];
  const source = textProps(langs.original);
  const target = textProps(langs.translation);
  const actionable = live && dir === "out" && !corrected;

  return (
    <li
      className={`border-b border-s-4 border-b-line/70 last:border-b-0 md:grid md:grid-cols-2 ${
        dir === "in" ? "border-s-turquoise/60" : "border-s-cobalt/30"
      } ${corrected ? "opacity-60" : ""}`}
    >
      <div className="px-5 pt-3 md:pb-3">
        <p className={`flex flex-wrap gap-2 text-xs font-bold ${dir === "in" ? "text-turquoise" : "text-muted"}`}>
          {dir === "in" ? t.client : t.you}
          {typed && <span className="rounded bg-line/70 px-1.5 font-normal">{t.typedBadge}</span>}
          {corrected && <span className="rounded bg-saffron/20 px-1.5 font-normal text-ink">{t.correctedBadge}</span>}
        </p>
        <p {...source}>{original}</p>
      </div>
      <div className="px-5 pb-4 pt-1 md:border-s md:border-line md:pt-9">
        {translation ? (
          <p {...target} className={`${target.className} ${corrected ? "line-through" : ""}`}>
            {translation}
          </p>
        ) : failed === "translation" ? (
          <p className="text-danger">{dir === "out" ? t.failedYou : t.failedClient}</p>
        ) : (
          <p className="text-muted">{t.translatingPlaceholder}</p>
        )}
        {failed === "tts" && dir === "out" && <p className="mt-1 text-sm text-danger">{t.failedTts}</p>}
        {delayMs !== null && <p className="mt-1 text-xs tabular-nums text-muted">{t.heardAfter((delayMs / 1000).toFixed(1))}</p>}

        {actionable && !fixing && (
          <div className="mt-2 flex gap-2">
            {translation && (
              <button
                type="button"
                onClick={() => onRepeat(segment.id)}
                aria-label={t.repeatAria}
                className="rounded-full border border-line px-3 py-1 text-sm"
              >
                {t.repeat}
              </button>
            )}
            <button type="button" onClick={() => setFixing(true)} aria-label={t.fixAria} className="rounded-full border border-line px-3 py-1 text-sm">
              {t.fix}
            </button>
          </div>
        )}
        {actionable && fixing && (
          <FixForm
            t={t}
            onCancel={() => setFixing(false)}
            onSubmit={(text, lang) => {
              onSay(text, lang, segment.id);
              setFixing(false);
            }}
          />
        )}
      </div>
    </li>
  );
}

/** Type the sentence you meant; English is spoken as typed, Urdu is translated first. */
function FixForm({ t, onSubmit, onCancel }: { t: Dict; onSubmit: (text: string, lang: "ur" | "en") => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [lang, setLang] = useState<"en" | "ur">("en");
  const fieldId = useId();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (text.trim()) onSubmit(text.trim(), lang);
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <label className="block text-sm font-bold" htmlFor={fieldId}>
        {t.fixLabel}
      </label>
      <textarea
        id={fieldId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_TYPED_CHARS}
        rows={2}
        dir="auto"
        lang={lang}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className={`w-full rounded-xl border border-line bg-bg px-3 py-2 ${lang === "ur" ? "font-urdu text-lg leading-[2.2]" : ""}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        {(["en", "ur"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={lang === value}
            onClick={() => setLang(value)}
            className={`rounded-full border px-3 py-1 text-sm ${lang === value ? "border-cobalt bg-cobalt text-cobalt-ink" : "border-line"}`}
          >
            {value === "en" ? t.fixLangEn : t.fixLangUr}
          </button>
        ))}
        <button type="submit" disabled={!text.trim()} className="rounded-full bg-cobalt px-4 py-1 text-sm font-bold text-cobalt-ink disabled:opacity-50">
          {t.fixSpeak}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1 text-sm text-muted underline-offset-4 hover:underline">
          {t.cancel}
        </button>
      </div>
      <p className="text-xs text-muted">{t.fixHint}</p>
    </form>
  );
}
