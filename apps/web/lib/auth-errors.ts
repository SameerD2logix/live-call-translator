/**
 * Friendly text for Better Auth errors, in the chosen language. Messages never reveal whether
 * an email has an account (no user enumeration through the UI).
 */
import type { AccountDict } from "./i18n/account";

interface AuthError {
  status?: number;
  code?: string;
}

export function authErrorMessage(error: AuthError | null | undefined, fallback: string, a: AccountDict): string {
  if (!error) return fallback;
  if (error.status === 429) return a.err_tooMany;
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return a.err_badLogin;
    case "EMAIL_NOT_VERIFIED":
      return a.err_notVerified;
    case "PASSWORD_TOO_SHORT":
      return a.err_tooShort;
    case "PASSWORD_TOO_LONG":
      return a.err_tooLong;
    case "PASSWORD_COMPROMISED":
      return a.err_compromised;
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
    case "INVALID_BACKUP_CODE":
      return a.err_badCode;
    case "INVALID_TOKEN":
      return a.err_badToken;
    default:
      return fallback;
  }
}
