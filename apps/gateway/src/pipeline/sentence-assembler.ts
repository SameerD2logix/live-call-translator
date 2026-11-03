/**
 * Joins sentences that the pause detector cut too early.
 *
 * Urdu puts the verb at the end ("میں یہ کام کل تک … مکمل کر دوں گا"). People often pause
 * before it, and a fragment like "میں یہ کام کل تک" translates badly. If a committed piece
 * ends with a word that can't end a sentence (a postposition or a connector), we hold it and
 * join it with the next piece. While the speaker keeps talking the hold is extended; after
 * `maxHoldMs` of silence (or `maxTotalMs` in all) it is translated anyway.
 */
import type { LanguageCode } from "../providers/types";

/** Words that almost never end a complete Urdu sentence (Urdu script). */
const URDU_TRAILING = new Set([
  "اور", "کہ", "کے", "کی", "کا", "کو", "میں", "سے", "پر", "تک", "لیکن", "مگر", "یا", "جو", "اگر",
  "کیونکہ", "تاکہ", "جب", "والا", "والی", "والے", "جیسے", "بلکہ", "چونکہ",
]);
/** The same in Roman Urdu, as speech recognition sometimes writes it. */
const ROMAN_URDU_TRAILING = new Set([
  "aur", "ke", "ki", "ka", "ko", "mein", "main", "se", "par", "pe", "tak", "lekin", "magar", "ya", "jo",
  "agar", "kyunke", "kyunki", "kyonki", "taake", "taki", "jab", "wala", "wali", "wale", "balke",
]);
/** English connectors and articles: for the client's English, and for code-mixed Urdu. */
const ENGLISH_TRAILING = new Set([
  "and", "but", "or", "because", "the", "a", "an", "to", "of", "with", "that", "which", "if", "when",
  "my", "your", "our", "their", "than",
]);

const SENTENCE_END = /[.!?۔؟]\s*$/u;
const EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

export function looksUnfinished(text: string, language: LanguageCode): boolean {
  const trimmed = text.trim();
  if (!trimmed || SENTENCE_END.test(trimmed)) return false;
  const words = trimmed.split(/\s+/u);
  const last = (words[words.length - 1] ?? "").replace(EDGE_PUNCTUATION, "").toLowerCase();
  if (!last) return false;
  if (language === "en") return ENGLISH_TRAILING.has(last);
  return URDU_TRAILING.has(last) || ROMAN_URDU_TRAILING.has(last) || ENGLISH_TRAILING.has(last);
}

export interface SentenceAssemblerOptions {
  language: LanguageCode;
  /** Silence to wait for the rest of a held sentence. 0 disables merging. */
  maxHoldMs: number;
  /** Upper bound on holding, however long the speaker keeps going. */
  maxTotalMs?: number;
  onSentence: (text: string) => void;
}

const MAX_HELD_CHARS = 600;

export class SentenceAssembler {
  private held: string | null = null;
  private heldSince = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly o: SentenceAssemblerOptions) {}

  /** Text waiting for its ending (shown on screen as still in progress). */
  get pending(): string {
    return this.held ?? "";
  }

  /** A committed piece from speech recognition. */
  push(text: string): void {
    const joined = this.held ? `${this.held} ${text}` : text;
    const startedAt = this.held ? this.heldSince : Date.now();
    this.clear();

    const maxTotal = this.o.maxTotalMs ?? this.o.maxHoldMs * 3;
    const canHold =
      this.o.maxHoldMs > 0 && joined.length < MAX_HELD_CHARS && Date.now() - startedAt < maxTotal;
    if (canHold && looksUnfinished(joined, this.o.language)) {
      this.held = joined;
      this.heldSince = startedAt;
      this.arm();
      return;
    }
    this.o.onSentence(joined);
  }

  /** The speaker is talking again: keep waiting for the rest of the held sentence. */
  touch(): void {
    if (this.held && Date.now() - this.heldSince < (this.o.maxTotalMs ?? this.o.maxHoldMs * 3)) this.arm();
  }

  /** Release whatever is held now (e.g. on stop). */
  flush(): void {
    const text = this.held;
    this.clear();
    if (text) this.o.onSentence(text);
  }

  dispose(): void {
    this.clear();
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.o.maxHoldMs);
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.held = null;
  }
}
