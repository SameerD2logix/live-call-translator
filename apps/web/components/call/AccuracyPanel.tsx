"use client";

import { useEffect, useState, type FormEvent } from "react";
import { GlossaryTerm, type PausePreset } from "@lct/protocol";
import type { Dict } from "@/lib/i18n/dictionary";

interface Props {
  pause: PausePreset;
  noiseGate: boolean;
  live: boolean;
  onChange: (prefs: { pause?: PausePreset; noiseGate?: boolean }) => void;
  t: Dict;
}

interface Term {
  id: string;
  term: string;
}

type GlossaryError = "glossary_invalid_term" | "glossary_full" | "glossary_duplicate" | "glossary_error";

/** Pause length, noise gate and the glossary of words to keep unchanged. */
export function AccuracyPanel({ pause, noiseGate, live, onChange, t }: Props) {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GlossaryError | null>(null);
  const [changedWhileLive, setChangedWhileLive] = useState(false);

  useEffect(() => {
    fetch("/api/glossary", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body: { terms: Term[] }) => setTerms(body.terms))
      .catch(() => setTerms([]));
  }, []);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = GlossaryTerm.safeParse(draft);
    if (!parsed.success) return setError("glossary_invalid_term");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/glossary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term: parsed.data }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(res?.status === 409 ? "glossary_full" : res?.status === 400 ? "glossary_invalid_term" : "glossary_error");
    const body = (await res.json()) as { terms: Term[]; duplicate?: boolean };
    setTerms(body.terms);
    setDraft("");
    if (body.duplicate) setError("glossary_duplicate");
    if (live) setChangedWhileLive(true);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/glossary?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setError("glossary_error");
    setTerms(((await res.json()) as { terms: Term[] }).terms);
    if (live) setChangedWhileLive(true);
  }

  const presets: PausePreset[] = ["short", "normal", "long"];

  return (
    <section aria-labelledby="accuracy-title" className="space-y-5 rounded-2xl border border-line bg-surface p-5">
      <h2 id="accuracy-title" className="font-bold">
        {t.accuracyTitle}
      </h2>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">{t.pauseTitle}</legend>
        <div className="flex flex-wrap gap-2">
          {presets.map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-bold has-[:focus-visible]:outline-2 ${
                pause === value ? "border-cobalt bg-cobalt text-cobalt-ink" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="pause"
                value={value}
                checked={pause === value}
                onChange={() => {
                  onChange({ pause: value });
                  if (live) setChangedWhileLive(true);
                }}
                className="sr-only"
              />
              {t[`pause_${value}`]}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted">{t.pauseHint}</p>
      </fieldset>

      <label className="flex items-start gap-3">
        <input type="checkbox" checked={noiseGate} onChange={(e) => onChange({ noiseGate: e.target.checked })} className="mt-1.5 size-4" />
        <span>
          <span className="block text-sm font-bold">{t.noiseGate}</span>
          <span className="block text-sm text-muted">{t.noiseGateHint}</span>
        </span>
      </label>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">{t.glossaryTitle}</h3>
        <p className="text-sm text-muted">{t.glossaryHint}</p>
        {terms && terms.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {terms.map(({ id, term }) => (
              <li key={id} className="inline-flex items-center gap-1 rounded-full border border-line bg-bg ps-3 pe-1">
                <bdi lang="en">{term}</bdi>
                <button
                  type="button"
                  onClick={() => void remove(id)}
                  aria-label={t.glossaryRemove(term)}
                  className="grid size-7 place-items-center rounded-full text-muted hover:text-ink"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          terms && <p className="text-sm text-muted">{t.glossaryEmpty}</p>
        )}
        <form onSubmit={add} className="flex gap-2">
          <label htmlFor="glossary-term" className="sr-only">
            {t.glossaryLabel}
          </label>
          <input
            id="glossary-term"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={40}
            dir="auto"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="rounded-xl border border-line px-4 font-bold disabled:opacity-50">
            {t.glossaryAdd}
          </button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {t[error]}
          </p>
        )}
      </div>

      {changedWhileLive && live && <p className="text-sm text-muted">{t.appliesNextStart}</p>}
    </section>
  );
}
