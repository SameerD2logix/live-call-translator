/**
 * The exact consent statement shown before cloning. Bump CONSENT_VERSION whenever the
 * wording changes: each stored consent records the version and a SHA-256 of this text,
 * so we can prove later what the user agreed to.
 */
export const CONSENT_VERSION = "voice-consent-2026-11";

export const CONSENT_STATEMENT = {
  en:
    "This is my own voice. I allow Live Call Translator to create a digital copy of it with its voice " +
    "provider (ElevenLabs) and to use that copy only to speak my translated words in my own calls. " +
    "I can delete it at any time.",
  ur:
    "یہ میری اپنی آواز ہے۔ میں لائیو کال ٹرانسلیٹر کو اجازت دیتا/دیتی ہوں کہ وہ اپنے وائس پرووائیڈر (ElevenLabs) " +
    "کے ذریعے میری آواز کی ڈیجیٹل کاپی بنائے اور اسے صرف میری اپنی کالز میں میرے ترجمہ شدہ الفاظ بولنے کے لیے " +
    "استعمال کرے۔ میں اسے کسی بھی وقت حذف کر سکتا/سکتی ہوں۔",
} as const;

/** The text that gets hashed into the consent record. */
export function consentDocument(): string {
  return `${CONSENT_VERSION}\n${CONSENT_STATEMENT.en}\n${CONSENT_STATEMENT.ur}`;
}
