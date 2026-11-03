/**
 * Friendly text for Better Auth errors. Messages never reveal whether an email has an
 * account (no user enumeration through the UI).
 */
interface AuthError {
  status?: number;
  code?: string;
}

export function authErrorMessage(error: AuthError | null | undefined, fallback: string): string {
  if (!error) return fallback;
  if (error.status === 429) return "Too many attempts. Wait a few minutes, then try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return "That email and password don't match.";
    case "EMAIL_NOT_VERIFIED":
      return "Confirm your email first. We've just sent you a new link.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 12 characters.";
    case "PASSWORD_TOO_LONG":
      return "Use at most 128 characters.";
    case "PASSWORD_COMPROMISED":
      return "This password has appeared in a data breach. Choose a different one.";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
    case "INVALID_BACKUP_CODE":
      return "That code didn't work. Check it and try again.";
    case "INVALID_TOKEN":
      return "This link has expired or was already used. Request a new one.";
    default:
      return fallback;
  }
}
