"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isSetupDone } from "@/lib/audio/devices";
import type { Dict } from "@/lib/i18n/dictionary";

/** Shown until the virtual-cable setup has been completed on this computer. */
export function SetupReminder({ t }: { t: Dict }) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!isSetupDone()), []);
  if (!show) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-saffron/40 bg-saffron/10 px-4 py-3">
      <p>{t.setupReminder}</p>
      <Link href="/setup" className="font-bold underline underline-offset-4">
        {t.setupReminderLink}
      </Link>
    </div>
  );
}
