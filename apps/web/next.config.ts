import type { NextConfig } from "next";

// Static security headers. The Content-Security-Policy is per-request (nonce) and lives in proxy.ts.
const securityHeaders = [
  // Add "; preload" only if you own the apex domain, serve every subdomain over HTTPS, and submit it to hstspreload.org.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Only this site may use the microphone and screen/tab sharing (for the call's audio); nothing else.
  { key: "Permissions-Policy", value: "microphone=(self), display-capture=(self), camera=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@lct/protocol"],
  // Native / Node-only modules are loaded at runtime instead of bundled.
  serverExternalPackages: ["@node-rs/argon2", "pg"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
