/** The 3-step onboarding progress. Numbered because it really is a sequence. */
const DEFAULT_TEXT = {
  steps: ["Create your account", "Record your voice", "Connect to Zoom or Meet"],
  done: "Completed: ",
  current: "Current: ",
  next: "Next: ",
};

export function ProgressSteps({ current, text = DEFAULT_TEXT }: { current: 0 | 1 | 2 | 3; text?: typeof DEFAULT_TEXT }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="grid grid-cols-3 gap-2">
        {text.steps.map((label, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined} className="space-y-2">
              <div className={`h-1.5 rounded-full ${state === "todo" ? "bg-line" : "bg-cobalt"}`} />
              <p className={`text-sm ${state === "current" ? "font-bold text-ink" : "text-muted"}`}>
                <span className="sr-only">{state === "done" ? text.done : state === "current" ? text.current : text.next}</span>
                {i + 1}. {label}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
