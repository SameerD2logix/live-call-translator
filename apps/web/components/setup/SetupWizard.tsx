"use client";

/**
 * Guided setup of the virtual audio cable (once per computer):
 *   1. install it (official download only)  2. prove it works with a real loopback test
 *   3. pick it as the microphone in the call app.
 * The test result also saves the cable as the translator's output on this computer.
 */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Notice } from "@/components/ui/form";
import { testCable, type CableTestResult } from "@/lib/audio/cable-test";
import { findCable, markSetupDone, saveOutputChoice } from "@/lib/audio/devices";
import { dictionaries, type CallApp, type Lang } from "@/lib/i18n/dictionary";
import { RoutingDiagram } from "./RoutingDiagram";

type Os = "windows" | "mac" | "other";

function detectOs(): Os {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return "other";
}

const APPS: CallApp[] = ["zoom", "meet", "teams", "whatsapp"];

export function SetupWizard({ lang }: { lang: Lang }) {
  const t = dictionaries[lang];
  const [os, setOs] = useState<Os>("windows");
  const [test, setTest] = useState<CableTestResult | "running" | null>(null);
  const [app, setApp] = useState<CallApp>("zoom");
  const [finished, setFinished] = useState(false);

  useEffect(() => setOs(detectOs()), []);

  const cableName = os === "mac" ? "BlackHole 2ch" : "CABLE Output (VB-Audio Virtual Cable)";

  async function runTest() {
    setTest("running");
    const result = await testCable().catch((): CableTestResult => "silent");
    setTest(result);
    if (result === "ok") {
      // Make the cable the translator's output on this computer.
      const cable = await findCable();
      if (cable.output) saveOutputChoice({ id: cable.output.deviceId, label: cable.output.label });
    }
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{t.setupTitle}</h1>
        <p className="max-w-prose text-muted">{t.setupIntro}</p>
      </header>

      <RoutingDiagram t={t} />

      <ol className="space-y-10">
        <Step n={1} title={t.step1Title} done={test === "ok"} doneLabel={t.stepDone}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t.osLabel}</span>
            {(["windows", "mac"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={os === value}
                onClick={() => setOs(value)}
                lang="en"
                className={`rounded-full border px-3 py-1 font-bold ${os === value ? "border-cobalt bg-cobalt text-cobalt-ink" : "border-line"}`}
              >
                {value === "windows" ? "Windows" : "macOS"}
              </button>
            ))}
          </div>
          <ol className="list-decimal space-y-2 ps-5">
            {t.step1[os].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </Step>

        <Step n={2} title={t.step2Title} done={test === "ok"} doneLabel={t.stepDone}>
          <p className="text-muted">{t.step2Intro}</p>
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={test === "running"}
            className="rounded-full bg-cobalt px-5 py-3 font-bold text-cobalt-ink hover:brightness-110 disabled:opacity-50"
          >
            {test === "running" ? t.testing : t.runTest}
          </button>
          {test && test !== "running" && <Notice tone={test === "ok" ? "success" : "error"}>{t[`test_${test}`]}</Notice>}
        </Step>

        <Step n={3} title={t.step3Title} done={finished} doneLabel={t.stepDone}>
          <p>{t.step3Intro(cableName)}</p>
          <div role="tablist" aria-label={t.step3Title} className="flex flex-wrap gap-2">
            {APPS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={app === value}
                onClick={() => setApp(value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-bold ${app === value ? "border-cobalt bg-cobalt text-cobalt-ink" : "border-line"}`}
              >
                {t.appNames[value]}
              </button>
            ))}
          </div>
          <ol role="tabpanel" className="list-decimal space-y-2 ps-5">
            {t.apps[app].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              markSetupDone();
              setFinished(true);
            }}
            className="rounded-full border border-line px-5 py-2.5 font-bold"
          >
            {t.step3Done}
          </button>
        </Step>
      </ol>

      {finished ? (
        <Notice tone="success">
          <p className="font-bold">{t.finishTitle}</p>
          <p className="mt-1">{t.finishText}</p>
          <Link href="/" className="mt-3 inline-flex rounded-full bg-cobalt px-5 py-2.5 font-bold text-cobalt-ink">
            {t.goToCall}
          </Link>
        </Notice>
      ) : (
        <Link href="/" className="inline-block text-sm text-muted underline underline-offset-4">
          {t.skip}
        </Link>
      )}
    </div>
  );
}

function Step({ n, title, done, doneLabel, children }: { n: number; title: string; done: boolean; doneLabel: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-4">
      <span
        aria-hidden
        className={`grid size-10 place-items-center rounded-full font-bold ${done ? "bg-turquoise text-surface" : "border-2 border-cobalt text-cobalt"}`}
      >
        {done ? "✓" : n}
      </span>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">
          {title}
          {done && <span className="sr-only"> ({doneLabel})</span>}
        </h2>
        {children}
      </div>
    </li>
  );
}
