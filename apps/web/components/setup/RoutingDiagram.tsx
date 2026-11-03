import type { Dict } from "@/lib/i18n/dictionary";

/** How sound flows: mic → translator → virtual cable → call app. Arrows follow the reading direction. */
export function RoutingDiagram({ t }: { t: Dict }) {
  const boxes = [t.diagramMic, t.diagramTranslator, t.diagramCable, t.diagramApp];
  return (
    <figure aria-label={boxes.join(" → ")} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {boxes.map((label, i) => (
        <div key={label} className="contents">
          <div
            className={`rounded-xl border px-4 py-3 text-center font-bold sm:flex-1 ${
              i === 2 ? "border-turquoise bg-turquoise/10" : "border-line bg-surface"
            }`}
          >
            {label}
          </div>
          {i < boxes.length - 1 && (
            <span aria-hidden className="self-center text-xl text-muted rotate-90 sm:rotate-0 sm:rtl:rotate-180">
              →
            </span>
          )}
        </div>
      ))}
    </figure>
  );
}
