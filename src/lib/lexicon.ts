export type EntryType = "word" | "expression" | "noun" | "verb" | "adjective";

/** Optional Danish inflection / grammar detail; which fields matter depends on `type`. */
export interface EntryGrammar {
  article?: string;
  singularDefinite?: string;
  pluralIndefinite?: string;
  pluralDefinite?: string;
  present?: string;
  past?: string;
  perfect?: string;
  neuter?: string;
  definite?: string;
  plural?: string;
  comparative?: string;
  superlative?: string;
}

export const GRAMMAR_KEYS = [
  "article",
  "singularDefinite",
  "pluralIndefinite",
  "pluralDefinite",
  "present",
  "past",
  "perfect",
  "neuter",
  "definite",
  "plural",
  "comparative",
  "superlative",
] as const satisfies readonly (keyof EntryGrammar)[];

export type GrammarKey = (typeof GRAMMAR_KEYS)[number];

export const ENTRY_TYPES: readonly EntryType[] = ["word", "noun", "verb", "adjective", "expression"] as const;

/** Types treated as single lexical units when linking words inside expressions. */
export const WORD_LIKE_TYPES: ReadonlySet<EntryType> = new Set(["word", "noun", "verb", "adjective"]);

export const TYPE_SORT_ORDER: Record<EntryType, number> = {
  word: 0,
  noun: 1,
  verb: 2,
  adjective: 3,
  expression: 4,
};

export function entryTypeLabel(type: EntryType): string {
  const labels: Record<EntryType, string> = {
    word: "ord",
    expression: "udtryk",
    noun: "substantiv",
    verb: "verbum",
    adjective: "adjektiv",
  };
  return labels[type];
}

/** Compact pill behind type label (e.g. after headword). */
export function entryTypePillClass(type: EntryType): string {
  switch (type) {
    case "expression":
      return "bg-primary/10 text-primary";
    case "noun":
      return "bg-sky-900/10 text-sky-900 dark:text-sky-200";
    case "verb":
      return "bg-emerald-900/10 text-emerald-900 dark:text-emerald-200";
    case "adjective":
      return "bg-amber-900/12 text-amber-950 dark:text-amber-100";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Which grammar inputs to show per entry type (Danish labels). */
export const GRAMMAR_FIELD_CONFIG: Record<
  EntryType,
  readonly { key: GrammarKey; label: string; placeholder?: string }[] | null
> = {
  word: null,
  expression: null,
  noun: [
    { key: "article", label: "Artikel", placeholder: "en / et" },
    { key: "singularDefinite", label: "Bestemt ental", placeholder: "huset …" },
    { key: "pluralIndefinite", label: "Ubestemt flertal", placeholder: "huse …" },
    { key: "pluralDefinite", label: "Bestemt flertal", placeholder: "husene …" },
  ],
  verb: [
    { key: "present", label: "Nutid", placeholder: "går …" },
    { key: "past", label: "Datid", placeholder: "gik …" },
    { key: "perfect", label: "Perfektum", placeholder: "har gået …" },
  ],
  adjective: [
    { key: "neuter", label: "T-form (-t)", placeholder: "stort …" },
    { key: "definite", label: "Bestemt form", placeholder: "store …" },
    { key: "plural", label: "Flertal", placeholder: "store …" },
    { key: "comparative", label: "Komparativ", placeholder: "større …" },
    { key: "superlative", label: "Superlativ", placeholder: "størst …" },
  ],
};

export interface LexisEntry {
  id: string;
  danish: string;
  english: string;
  /** Optional translations for extra languages, keyed by ISO 639-1 code (e.g. "it", "fr"). */
  translations?: Record<string, string>;
  notes: string;
  type: EntryType;
  grammar?: EntryGrammar;
  createdAt: number;
}

export type LexisEntryInput = Omit<LexisEntry, "id" | "createdAt">;

/** Read a translation safely (returns empty string when missing). */
export function getTranslation(entry: Pick<LexisEntry, "translations">, code: string): string {
  return entry.translations?.[code] ?? "";
}

/** Normalize a translations map: trim, drop empty/non-string. */
export function normalizeTranslations(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, 240);
    if (t && /^[a-z]{2,3}$/i.test(k)) out[k.toLowerCase()] = t;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const MAX_GRAMMAR_FIELD_LEN = 240;

export function normalizeGrammar(value: unknown): EntryGrammar | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const out: EntryGrammar = {};

  for (const key of GRAMMAR_KEYS) {
    const v = raw[key];
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, MAX_GRAMMAR_FIELD_LEN);
    if (t) {
      out[key] = t;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function pruneGrammar(g: EntryGrammar | undefined): EntryGrammar | undefined {
  if (!g) return undefined;
  const out: EntryGrammar = {};
  for (const key of GRAMMAR_KEYS) {
    const v = g[key];
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, MAX_GRAMMAR_FIELD_LEN);
    if (t) out[key] = t;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeEntryType(value: unknown): EntryType {
  if (value === "expression" || value === "noun" || value === "verb" || value === "adjective") {
    return value;
  }
  return "word";
}

export function grammarHasContent(type: EntryType, grammar: EntryGrammar | undefined): boolean {
  const fields = GRAMMAR_FIELD_CONFIG[type];
  if (!fields || !grammar) return false;
  return fields.some(({ key }) => Boolean(grammar[key]?.trim()));
}
