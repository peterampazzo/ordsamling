import type { LexisEntry } from "@/lib/lexicon";

const DEMO_FLAG_KEY = "lexikon-demo";
const STORAGE_KEY = "lexikon-entries";

export function isDemoMode(): boolean {
  return localStorage.getItem(DEMO_FLAG_KEY) === "1";
}

export function activateDemo(): void {
  if (isDemoMode()) return;
  localStorage.setItem(DEMO_FLAG_KEY, "1");
  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing || JSON.parse(existing).length === 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_ENTRIES));
  }
}

export function deactivateDemo(): void {
  localStorage.removeItem(DEMO_FLAG_KEY);
  // Remove demo entries (clear all local data seeded by demo)
  localStorage.removeItem(STORAGE_KEY);
}

const now = Date.now();
const h = (offset: number) => now - offset * 3600_000;

const DEMO_ENTRIES: LexisEntry[] = [
  {
    id: "demo-1",
    danish: "hund",
    english: "dog",
    italian: "",
    notes: "",
    type: "noun",
    grammar: { article: "en", singularDefinite: "hunden", pluralIndefinite: "hunde", pluralDefinite: "hundene" },
    createdAt: h(1),
  },
  {
    id: "demo-2",
    danish: "kat",
    english: "cat",
    italian: "",
    notes: "",
    type: "noun",
    grammar: { article: "en", singularDefinite: "katten", pluralIndefinite: "katte", pluralDefinite: "kattene" },
    createdAt: h(2),
  },
  {
    id: "demo-3",
    danish: "hus",
    english: "house",
    italian: "",
    notes: "",
    type: "noun",
    grammar: { article: "et", singularDefinite: "huset", pluralIndefinite: "huse", pluralDefinite: "husene" },
    createdAt: h(3),
  },
  {
    id: "demo-4",
    danish: "løbe",
    english: "run",
    italian: "",
    notes: "",
    type: "verb",
    grammar: { present: "løber", past: "løb", perfect: "har løbet" },
    createdAt: h(4),
  },
  {
    id: "demo-5",
    danish: "spise",
    english: "eat",
    italian: "",
    notes: "",
    type: "verb",
    grammar: { present: "spiser", past: "spiste", perfect: "har spist" },
    createdAt: h(5),
  },
  {
    id: "demo-6",
    danish: "stor",
    english: "big",
    italian: "",
    notes: "",
    type: "adjective",
    grammar: { neuter: "stort", definite: "store", plural: "store", comparative: "større", superlative: "størst" },
    createdAt: h(6),
  },
  {
    id: "demo-7",
    danish: "lille",
    english: "small",
    italian: "",
    notes: "",
    type: "adjective",
    grammar: { neuter: "lille", definite: "lille", plural: "små", comparative: "mindre", superlative: "mindst" },
    createdAt: h(7),
  },
  {
    id: "demo-8",
    danish: "tak",
    english: "thanks",
    italian: "",
    notes: "Very common",
    type: "word",
    createdAt: h(8),
  },
  {
    id: "demo-9",
    danish: "undskyld",
    english: "sorry / excuse me",
    italian: "",
    notes: "",
    type: "word",
    createdAt: h(9),
  },
  {
    id: "demo-10",
    danish: "det er lige meget",
    english: "it doesn't matter",
    italian: "",
    notes: "",
    type: "expression",
    createdAt: h(10),
  },
  {
    id: "demo-11",
    danish: "at have det sjovt",
    english: "to have fun",
    italian: "",
    notes: "",
    type: "expression",
    createdAt: h(11),
  },
  {
    id: "demo-12",
    danish: "drikke",
    english: "drink",
    italian: "",
    notes: "",
    type: "verb",
    grammar: { present: "drikker", past: "drak", perfect: "har drukket" },
    createdAt: h(12),
  },
];
