"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  hasDeviceLabels,
  isCable,
  listDevices,
  requestDeviceLabels,
  resolveOutput,
  supportsOutputSelection,
  type SavedOutput,
} from "@/lib/audio/devices";
import type { Dict } from "@/lib/i18n/dictionary";

interface Props {
  output: SavedOutput | null;
  onChange: (choice: SavedOutput | null) => void;
  monitor: boolean;
  onMonitorChange: (value: boolean) => void;
  t: Dict;
}

/** Where your translated English plays: normally the virtual cable your call app listens to. */
export function OutputDevicePicker({ output, onChange, monitor, onMonitorChange, t }: Props) {
  const [supported, setSupported] = useState(true);
  const [labels, setLabels] = useState(true);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setSupported(supportsOutputSelection());
    setLabels(await hasDeviceLabels());
    setOutputs(await listDevices("audiooutput"));
  }, []);

  useEffect(() => {
    void refresh();
    // Plugging in headphones or installing the cable updates the list by itself.
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  }, [refresh]);

  const selected = resolveOutput(output, outputs);
  const cable = outputs.find(isCable);

  return (
    <section aria-labelledby="output-title" className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <h2 id="output-title" className="font-bold">
        {t.outputTitle}
      </h2>

      {!supported ? (
        <p className="text-sm text-danger">{t.outputUnsupported}</p>
      ) : !labels ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">{t.outputNeedsPermission}</p>
          <button
            type="button"
            onClick={() => void requestDeviceLabels().catch(() => undefined).then(refresh)}
            className="rounded-full border border-line px-4 py-2 text-sm font-bold"
          >
            {t.allowMic}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              aria-labelledby="output-title"
              value={selected?.deviceId ?? ""}
              onChange={(e) => {
                const device = outputs.find((d) => d.deviceId === e.target.value);
                onChange(device ? { id: device.deviceId, label: device.label } : null);
              }}
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5"
            >
              <option value="">{t.outputDefault}</option>
              {outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId} lang="en">
                  {d.label || d.deviceId.slice(0, 8)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void refresh()} className="rounded-xl border border-line px-3 text-sm">
              {t.refreshDevices}
            </button>
          </div>
          <p className="text-sm text-muted">
            {selected && isCable(selected) ? (
              t.outputCableSelected
            ) : cable ? (
              t.outputCableFound
            ) : (
              <>
                {t.outputNoCable}{" "}
                <Link href="/setup" className="font-bold text-ink underline underline-offset-4">
                  {t.setupReminderLink}
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={monitor} onChange={(e) => onMonitorChange(e.target.checked)} className="mt-1 size-4" />
        {t.monitor}
      </label>
    </section>
  );
}
