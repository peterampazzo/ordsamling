import type { LexisEntry } from "@/lib/lexicon";

/**
 * Demo mode is now activated by visiting the /demo route.
 *
 * To keep the user's real data at /app safe, demo entries live in a SEPARATE
 * localStorage key. The current "active" storage key is resolved by reading
 * a sessionStorage flag — set when /demo loads and cleared when the user
 * exits the demo.
 */

const DEMO_FLAG_KEY = "ordsamling-demo-route";
const REAL_STORAGE_KEY = "lexikon-entries";
const DEMO_STORAGE_KEY = "lexikon-entries-demo";

export { REAL_STORAGE_KEY, DEMO_STORAGE_KEY };

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Currently-active entries storage key (real or demo). */
export function getEntriesStorageKey(): string {
  return isDemoMode() ? DEMO_STORAGE_KEY : REAL_STORAGE_KEY;
}

/** Seed the demo storage with sample entries (idempotent). */
export function seedDemoEntries(): void {
  const existing = localStorage.getItem(DEMO_STORAGE_KEY);
  if (!existing || JSON.parse(existing).length === 0) {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(DEMO_ENTRIES));
  }
}

/** Activate demo mode and seed the demo storage with sample entries (idempotent). */
export function activateDemo(): void {
  try {
    sessionStorage.setItem(DEMO_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
  seedDemoEntries();
  window.dispatchEvent(new CustomEvent("ordsamling:demo-changed"));
}

/**
 * Disable demo mode. Real user data is untouched.
 * Demo entries are kept in their own localStorage key so re-entering /demo
 * is instant; they're harmless and re-seeded on activate anyway.
 */
export function deactivateDemo(): void {
  try {
    sessionStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("ordsamling:demo-changed"));
}

const now = Date.now();
const h = (offset: number) => now - offset * 3600_000;

const DEMO_ENTRIES: LexisEntry[] = [
  { id: "demo-1", danish: "hund", english: "dog", notes: "", type: "noun",
    grammar: { article: "en", singularDefinite: "hunden", pluralIndefinite: "hunde", pluralDefinite: "hundene" }, createdAt: h(1), updatedAt: h(1) },
  { id: "demo-2", danish: "kat", english: "cat", notes: "", type: "noun",
    grammar: { article: "en", singularDefinite: "katten", pluralIndefinite: "katte", pluralDefinite: "kattene" }, createdAt: h(2), updatedAt: h(2) },
  { id: "demo-3", danish: "hus", english: "house", notes: "", type: "noun",
    grammar: { article: "et", singularDefinite: "huset", pluralIndefinite: "huse", pluralDefinite: "husene" }, createdAt: h(3), updatedAt: h(3) },
  { id: "demo-4", danish: "løbe", english: "run", notes: "", type: "verb",
    grammar: { present: "løber", past: "løb", perfect: "har løbet" }, createdAt: h(4), updatedAt: h(4) },
  { id: "demo-5", danish: "spise", english: "eat", notes: "", type: "verb",
    grammar: { present: "spiser", past: "spiste", perfect: "har spist" }, createdAt: h(5), updatedAt: h(5) },
  { id: "demo-6", danish: "stor", english: "big", notes: "", type: "adjective",
    grammar: { neuter: "stort", definite: "store", plural: "store", comparative: "større", superlative: "størst" }, createdAt: h(6), updatedAt: h(6) },
  { id: "demo-7", danish: "lille", english: "small", notes: "", type: "adjective",
    grammar: { neuter: "lille", definite: "lille", plural: "små", comparative: "mindre", superlative: "mindst" }, createdAt: h(7), updatedAt: h(7) },
  { id: "demo-8", danish: "tak", english: "thanks", notes: "Very common", type: "word", createdAt: h(8), updatedAt: h(8) },
  { id: "demo-9", danish: "undskyld", english: "sorry/excuse me", notes: "", type: "word", createdAt: h(9), updatedAt: h(9) },
  { id: "demo-10", danish: "det er lige meget", english: "it doesn't matter", notes: "", type: "expression", createdAt: h(10), updatedAt: h(10) },
  { id: "demo-11", danish: "at have det sjovt", english: "to have fun", notes: "", type: "expression", createdAt: h(11), updatedAt: h(11) },
  { id: "demo-12", danish: "drikke", english: "drink", notes: "", type: "verb",
    grammar: { present: "drikker", past: "drak", perfect: "har drukket" }, createdAt: h(12), updatedAt: h(12) },
];
