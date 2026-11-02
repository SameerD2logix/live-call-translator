/** Delay between you finishing a sentence and your client starting to hear it. */
export function LatencyBadge({ ms }: { ms: number | null }) {
  const slow = ms !== null && ms > 3000;
  return (
    <p
      title="Time from when you stop speaking to when your client starts hearing the translation"
      className={[
        "rounded-full px-3 py-1.5 text-sm tabular-nums",
        slow ? "bg-saffron/20 font-bold text-ink" : "bg-line/60 text-muted",
      ].join(" ")}
    >
      <span className="sr-only">Translation delay: </span>
      {ms === null ? "Delay –" : `Delay ${(ms / 1000).toFixed(1)} s`}
    </p>
  );
}
