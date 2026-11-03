/**
 * Only allow same-site relative paths after sign-in. Blocks open redirects such as
 * ?next=https://evil.example or ?next=//evil.example.
 */
export function safeNext(value: string | string[] | undefined, fallback = "/"): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
