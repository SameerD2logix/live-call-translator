import type { Dict } from "@/lib/i18n/dictionary";

/** Delay between you finishing a sentence and your client starting to hear it. */
export function LatencyBadge({ ms, t }: { ms: number | null; t: Dict }) {
  const slow = ms !== null && ms > 3000;
  return (
    <p
      title={t.delayTitle}
      className={["rounded-full px-3 py-1.5 text-sm tabular-nums", slow ? "bg-saffron/20 font-bold text-ink" : "bg-line/60 text-muted"].join(" ")}
    >
      {t.delay} <bdi>{ms === null ? "–" : (ms / 1000).toFixed(1)}</bdi> {ms === null ? "" : t.seconds}
    </p>
  );
}
