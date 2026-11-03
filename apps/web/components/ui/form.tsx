import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/** Labelled input. The label is always visible (no placeholder-as-label). */
export function Field({
  label,
  hint,
  id,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink"
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

const VARIANTS = {
  primary: "bg-cobalt text-cobalt-ink hover:brightness-110",
  secondary: "border border-line bg-surface text-ink hover:bg-bg",
  danger: "border border-danger/50 text-danger hover:bg-danger/10",
} as const;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

const TONES = {
  info: "border-line bg-surface",
  error: "border-danger/40 bg-danger/10",
  success: "border-turquoise/40 bg-turquoise/10",
} as const;

export function Notice({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 ${TONES[tone]}`}>
      {children}
    </div>
  );
}
