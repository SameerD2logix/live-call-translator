"use client";

import { useEffect, useRef } from "react";

interface Props {
  active: boolean;
  connecting: boolean;
  onStart: () => void;
  onStop: () => void;
  subscribeLevel: (listener: (level: number) => void) => () => void;
}

/** The one big control. While live, a turquoise ring swells with your voice. */
export function StartStopButton({ active, connecting, onStart, onStop, subscribeLevel }: Props) {
  const ringRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;
    if (!active) {
      ring.style.setProperty("--level", "0");
      return;
    }
    let target = 0;
    let current = 0;
    let frame = 0;
    const unsubscribe = subscribeLevel((rms) => {
      target = Math.min(1, rms * 6);
    });
    const tick = () => {
      current += (target - current) * 0.25; // ease so the ring doesn't flicker
      ring.style.setProperty("--level", current.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [active, subscribeLevel]);

  const label = connecting ? "Connecting…" : active ? "Stop" : "Start";
  const hint = active ? "Tap to end translation" : "Urdu to English";

  return (
    <button
      type="button"
      onClick={active ? onStop : onStart}
      aria-pressed={active}
      aria-label={active ? "Stop translating" : "Start translating"}
      className={[
        "relative grid size-44 place-items-center rounded-full transition-colors",
        active
          ? "border-2 border-cobalt bg-surface text-ink"
          : "bg-cobalt text-cobalt-ink hover:brightness-110",
      ].join(" ")}
    >
      <span ref={ringRef} aria-hidden className="level-ring pointer-events-none absolute -inset-1 rounded-full" />
      <span className="relative flex flex-col items-center gap-1">
        <span className="text-3xl font-bold">{label}</span>
        <span className="text-sm opacity-80">{hint}</span>
      </span>
    </button>
  );
}
