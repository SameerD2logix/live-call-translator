/**
 * How closely a transcript matches the sentence the user was asked to read (0..1).
 * Used to check voice-cloning samples: someone else's speech (a podcast, a video) won't match
 * our prompts. Tolerant of recognition errors, punctuation, Arabic/Urdu letter variants and
 * diacritics, so honest recordings pass.
 */

const LETTER_VARIANTS: Array<[RegExp, string]> = [
  [/[يى]/gu, "ی"], // Arabic yeh / alef maksura → Urdu yeh
  [/ك/gu, "ک"], // Arabic kaf → Urdu kaf
  [/[هة]/gu, "ہ"], // Arabic heh / teh marbuta → Urdu heh goal
  [/ۂ/gu, "ہ"],
  [/ۓ/gu, "ے"],
  [/[أإآ]/gu, "ا"],
  [/ؤ/gu, "و"],
];

const URDU_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeForMatch(text: string): string {
  let s = text.normalize("NFKC").toLowerCase();
  for (const [pattern, replacement] of LETTER_VARIANTS) s = s.replace(pattern, replacement);
  s = s.replace(/[۰-۹]/gu, (d) => String(URDU_DIGITS.indexOf(d)));
  s = s.replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F]/gu, ""); // diacritics, tatweel, zero-width marks
  s = s.replace(/[\p{P}\p{S}]/gu, " ");
  return s.replace(/\s+/gu, " ").trim();
}

/** 1 − (Levenshtein distance ÷ longer length), on normalised text. */
export function textSimilarity(heard: string, expected: string): number {
  const a = [...normalizeForMatch(heard)];
  const b = [...normalizeForMatch(expected)];
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}
