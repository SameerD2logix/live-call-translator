import type { LiveStatus } from "@/hooks/use-translator-session";

const LABELS: Record<LiveStatus, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  listening: "Listening",
  translating: "Translating",
  speaking: "Speaking",
  muted: "Muted",
};

const DOT: Record<LiveStatus, string> = {
  idle: "bg-muted",
  connecting: "bg-muted",
  listening: "bg-cobalt",
  translating: "bg-saffron",
  speaking: "bg-turquoise",
  muted: "bg-danger",
};

export function StatusIndicator({ status }: { status: LiveStatus }) {
  return (
    <p role="status" className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm font-bold">
      <span aria-hidden className={`size-2.5 rounded-full ${DOT[status]}`} />
      {LABELS[status]}
    </p>
  );
}
