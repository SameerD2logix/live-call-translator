import { ProviderError } from "../providers/types";

/**
 * A safe-to-log summary of an error. Never includes request bodies, transcripts or
 * provider response bodies (those can echo user speech back).
 */
export function errorSummary(err: unknown): Record<string, string> {
  if (err instanceof ProviderError) {
    return { name: err.name, provider: err.provider, code: err.code, message: err.message };
  }
  if (err instanceof Error) return { name: err.name };
  return { name: typeof err };
}
