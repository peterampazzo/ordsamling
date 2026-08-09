import type { LexisEntry } from "@/lib/lexicon";

/** Which exercise the user picked on the quiz setup screen. */
export type ExerciseKind = "vocabulary" | "verbs" | "numbers" | "articles";

export const EXERCISE_KINDS: readonly ExerciseKind[] = [
  "vocabulary",
  "verbs",
  "numbers",
  "articles",
] as const;

export function isExerciseKind(value: unknown): value is ExerciseKind {
  return typeof value === "string" && (EXERCISE_KINDS as readonly string[]).includes(value);
}

export type LangDirection = {
  from: "danish" | "english";
  to: "danish" | "english";
  fromLabel: string;
  toLabel: string;
};

export type QuestionType =
  | "translate"
  | "conjugation"
  | "noun_form"
  | "fill_blank"
  | "number"
  | "article"
  | "preposition";

export interface QuizQuestion {
  entry: LexisEntry;
  prompt: string;
  answer: string;
  options: string[];
  questionType: QuestionType;
  hint?: string;
  direction: LangDirection;
  /** For completion mode: the masked version */
  masked?: string;
  /** For mixed mode: which display mode this question uses */
  displayMode?: "choice" | "type" | "completion";
  /** Optional short explanation shown in feedback (curated exercises). */
  note?: string;
}

/** Prefix used for ids of generated (non-vocabulary) questions. */
export const GENERATED_ID_PREFIX = "gen:";

export function isGeneratedEntryId(id: string): boolean {
  return id.startsWith(GENERATED_ID_PREFIX);
}

/** Build a throwaway entry so generated questions fit the normal renderer. */
export function syntheticEntry(key: string, danish: string, english: string): LexisEntry {
  return {
    id: `${GENERATED_ID_PREFIX}${key}`,
    danish,
    english,
    notes: "",
    type: "word",
    createdAt: 0,
    updatedAt: 0,
  };
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
