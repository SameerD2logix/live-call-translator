"use client";

import { useEffect, useRef } from "react";
import type { Segment } from "@/hooks/use-translator-session";

interface Props {
  segments: Segment[];
  partial: string;
}

/**
 * Two aligned columns: each row pairs what you said in Urdu with what your client heard,
 * so a mistranslation is easy to spot at a glance.
 */
export function TranscriptPanel({ segments, partial }: Props) {
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

  const latestEnglish = [...segments].reverse().find((s) => s.english)?.english ?? "";
  const empty = segments.length === 0 && !partial;

  return (
    <section aria-labelledby="transcript-heading" className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h2 id="transcript-heading" className="sr-only">
        Live transcript
      </h2>
      <div aria-hidden className="hidden border-b border-line md:grid md:grid-cols-2">
        <p className="px-5 py-3 text-sm font-bold text-muted">You said, in Urdu</p>
        <p className="border-l border-line px-5 py-3 text-sm font-bold text-muted">Your client hears, in English</p>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="max-h-[55dvh] min-h-48 overflow-y-auto">
        {empty ? (
          <p className="mx-auto max-w-prose px-5 py-12 text-center text-muted">
            Press Start and speak in Urdu. Each sentence appears here, next to the English your client hears.
          </p>
        ) : (
          <ol>
            {segments.map((segment) => (
              <Row key={`${segment.session}-${segment.id}`} segment={segment} />
            ))}
            {partial && (
              <li className="md:grid md:grid-cols-2">
                <p lang="ur" dir="rtl" className="px-5 py-3 font-urdu text-xl leading-[2.4] text-muted">
                  {partial}
                </p>
              </li>
            )}
          </ol>
        )}
      </div>

      {/* Screen readers hear each new English line once. */}
      <p className="sr-only" aria-live="polite">
        {latestEnglish}
      </p>
    </section>
  );
}

function Row({ segment }: { segment: Segment }) {
  const { urdu, english, failed, delayMs } = segment;
  return (
    <li className="border-b border-line/70 last:border-b-0 md:grid md:grid-cols-2">
      <p lang="ur" dir="rtl" className="px-5 pt-3 font-urdu text-xl leading-[2.4] md:pb-3">
        <span lang="en" className="sr-only">
          You said:{" "}
        </span>
        {urdu}
      </p>
      <div className="px-5 pb-4 pt-1 md:border-l md:border-line md:pt-4">
        {english ? (
          <p lang="en" className="text-lg leading-relaxed">
            {english}
          </p>
        ) : failed === "translation" ? (
          <p className="text-danger">Couldn&apos;t translate this sentence. Say it again.</p>
        ) : (
          <p className="text-muted">Translating…</p>
        )}
        {failed === "tts" && <p className="mt-1 text-sm text-danger">Your client didn&apos;t hear this one. Say it again.</p>}
        {delayMs !== null && (
          <p className="mt-1 text-xs tabular-nums text-muted">Heard {(delayMs / 1000).toFixed(1)} s after you finished</p>
        )}
      </div>
    </li>
  );
}
