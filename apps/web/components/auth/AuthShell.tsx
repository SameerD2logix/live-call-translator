import Link from "next/link";
import type { ReactNode } from "react";

/** Narrow, centred column shared by every sign-in related page. */
export function AuthShell({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-12">
      <Link href="/" className="self-start font-bold">
        Live Call Translator
      </Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <div className="text-muted">{intro}</div>}
      </header>
      {children}
      {footer && <div className="space-y-2 text-sm text-muted">{footer}</div>}
    </main>
  );
}
