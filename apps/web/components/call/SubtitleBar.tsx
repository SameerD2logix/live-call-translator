import type { Segment } from "@/hooks/use-translator-session";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * Large live subtitle of the client's latest sentence in Urdu, readable at a glance during a
 * call. The English they are saying right now appears underneath as it comes in.
 */
export function SubtitleBar({ segments, partial, t }: { segments: Segment[]; partial: string; t: Dict }) {
  let last: Segment | undefined;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i]?.dir === "in") {
      last = segments[i];
      break;
    }
  }
  const english = partial || last?.original || "";

  return (
    <section aria-label={t.incomingTitle} className="rounded-2xl border border-turquoise/40 bg-surface px-6 py-5">
      <p className="text-sm font-bold text-turquoise">{t.subtitleLabel}</p>
      {last?.translation ? (
        // aria-live: screen readers announce each new Urdu subtitle once.
        <p lang="ur" dir="rtl" aria-live="polite" className="font-urdu text-3xl leading-[2.3] md:text-4xl">
          {last.translation}
        </p>
      ) : (
        <p className="py-2 text-lg text-muted">{t.subtitleWaiting}</p>
      )}
      {english && (
        <p lang="en" dir="ltr" className="mt-1 text-muted">
          {english}
        </p>
      )}
    </section>
  );
}
