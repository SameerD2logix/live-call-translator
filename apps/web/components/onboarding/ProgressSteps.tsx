/** The 3-step onboarding progress. Numbered because it really is a sequence. */
const STEPS = ["Create your account", "Record your voice", "Connect to Zoom or Meet"] as const;

export function ProgressSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined} className="space-y-2">
              <div className={`h-1.5 rounded-full ${state === "todo" ? "bg-line" : "bg-cobalt"}`} />
              <p className={`text-sm ${state === "current" ? "font-bold text-ink" : "text-muted"}`}>
                <span className="sr-only">{state === "done" ? "Completed: " : state === "current" ? "Current: " : "Next: "}</span>
                {i + 1}. {label}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
