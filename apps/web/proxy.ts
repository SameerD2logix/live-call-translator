/**
 * Per-request Content Security Policy with a nonce.
 * (Next.js 16 calls this file proxy.ts. On Next.js 15 it is middleware.ts exporting `middleware`.)
 *
 * Next.js reads the nonce from the request's CSP header and adds it to its own inline scripts,
 * so no other inline script can run, which blunts XSS.
 */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Pages anyone may open. Everything else needs a session; API routes answer 401 themselves. */
const PUBLIC_PAGES = ["/sign-in", "/sign-up", "/two-factor", "/forgot-password", "/reset-password"];

function needsSignIn(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return false;
  if (PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) return false;
  // Cookie PRESENCE only: a fast first filter. The page itself validates the session.
  return !getSessionCookie(request);
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  if (needsSignIn(request)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";
  const gateway = originOf(process.env.GATEWAY_PUBLIC_URL);

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    // React and next/font emit inline style attributes. Styles can't execute code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${gateway ? ` ${gateway}` : ""}${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self'", // the AudioWorklet is a same-origin file
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|worklets/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
