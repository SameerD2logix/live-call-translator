"use client";

import { memo, useEffect, useRef } from "react";
import type { Direction } from "@lct/protocol";
import type { Segment } from "@/hooks/use-translator-session";
import type { Dict } from "@/lib/i18n/dictionary";

interface Props {
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
export const TranscriptPanel = memo(function TranscriptPanel({ segments, partial, t }: Props) {
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
              <Row key={`${segment.session}-${segment.dir}-${segment.id}`} segment={segment} t={t} />
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

function Row({ segment, t }: { segment: Segment; t: Dict }) {
  const { dir, original, translation, failed, delayMs } = segment;
  const langs = LANGS[dir];
  const source = textProps(langs.original);
  const target = textProps(langs.translation);
  return (
    <li className={`border-b border-s-4 border-b-line/70 last:border-b-0 md:grid md:grid-cols-2 ${dir === "in" ? "border-s-turquoise/60" : "border-s-cobalt/30"}`}>
      <div className="px-5 pt-3 md:pb-3">
        <p className={`text-xs font-bold ${dir === "in" ? "text-turquoise" : "text-muted"}`}>{dir === "in" ? t.client : t.you}</p>
        <p {...source}>{original}</p>
      </div>
      <div className="px-5 pb-4 pt-1 md:border-s md:border-line md:pt-9">
        {translation ? (
          <p {...target}>{translation}</p>
        ) : failed === "translation" ? (
          <p className="text-danger">{dir === "out" ? t.failedYou : t.failedClient}</p>
        ) : (
          <p className="text-muted">{t.translatingPlaceholder}</p>
        )}
        {failed === "tts" && dir === "out" && <p className="mt-1 text-sm text-danger">{t.failedTts}</p>}
        {delayMs !== null && <p className="mt-1 text-xs tabular-nums text-muted">{t.heardAfter((delayMs / 1000).toFixed(1))}</p>}
      </div>
    </li>
  );
}
