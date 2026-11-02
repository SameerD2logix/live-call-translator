import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Noto_Nastaliq_Urdu } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Atkinson Hyperlegible: designed for low-vision legibility. Noto Nastaliq: proper Urdu script.
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson", display: "swap" });
const nastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-nastaliq", display: "swap" });

export const metadata: Metadata = {
  title: "Live Call Translator",
  description: "Speak Urdu on your calls. Your client hears English in your own voice.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1324" },
  ],
};

// Render per request so Next.js can stamp the CSP nonce from proxy.ts onto its scripts.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${nastaliq.variable}`}>
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
