/**
 * Security events as one-line JSON on stderr, for the hosting platform's log search and alerts
 * (e.g. alert when "origin_rejected" or "rate_limited" spikes). Never include emails, tokens,
 * audio or transcripts: the user id is a random identifier, which is enough to investigate.
 */
export type SecurityEvent = "origin_rejected" | "unauthorized" | "rate_limited" | "voice_check_failed" | "gateway_error";

export function securityEvent(event: SecurityEvent, details: { route: string; userId?: string; status?: number }): void {
  console.warn(JSON.stringify({ level: "warn", type: "security", event, time: new Date().toISOString(), ...details }));
}
