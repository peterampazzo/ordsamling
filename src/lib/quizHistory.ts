const STORAGE_KEY = "lexikon-quiz-history";

export interface QuizAnswerRecord {
  prompt: string;
  correctAnswer: string;
  givenAnswer: string;
  correct: boolean;
  skipped: boolean;
  fromLang: string;
  toLang: string;
  entryId: string;
}

export interface QuizSessionRecord {
  id: string;
  date: number;
  mode: "choice" | "type" | "completion" | "mixed";
  fromLabel: string;
  toLabel: string;
  score: number;
  total: number;
  answers: QuizAnswerRecord[];
}

// ---------------------------------------------------------------------------
// Task 9.1 — Module-level sync callback set by the app when cloud sync is active
// ---------------------------------------------------------------------------

let _pushQuizSession: ((session: QuizSessionRecord) => void) | null = null;

export function registerPushQuizSession(fn: (session: QuizSessionRecord) => void): void {
  _pushQuizSession = fn;
}

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

function getLocalHistory(): QuizSessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(history: QuizSessionRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// ---------------------------------------------------------------------------
// Task 9.2 — Always use localStorage (no isLocalStorageMode branch)
// ---------------------------------------------------------------------------

export function loadHistory(): QuizSessionRecord[] {
  return getLocalHistory();
}

export async function fetchHistory(): Promise<QuizSessionRecord[]> {
  return getLocalHistory();
}

export async function saveSession(session: QuizSessionRecord): Promise<void> {
  const history = getLocalHistory();
  history.unshift(session);
  if (history.length > 50) history.length = 50;
  saveLocalHistory(history);
  // Task 9.1 — push to Sheets if registered
  if (_pushQuizSession) {
    _pushQuizSession(session);
  }
}

export async function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Spaced repetition (SM-2 lite / Leitner boxes)
// Pure functions — no React, no DOM. Storage helpers are isolated below.
// ---------------------------------------------------------------------------

const BOX_STORAGE_KEY = "lexikon-box-states";

/** Default starting box for new or migrated entries. */
export const DEFAULT_BOX = 2;

/** Interval per box in milliseconds (box index 1..5). Index 0 unused. */
export const BOX_INTERVALS_MS: readonly number[] = [
  0,
  24 * 60 * 60 * 1000, // box 1: 1 day
  3 * 24 * 60 * 60 * 1000, // box 2: 3 days
  7 * 24 * 60 * 60 * 1000, // box 3: 7 days
  14 * 24 * 60 * 60 * 1000, // box 4: 14 days
  30 * 24 * 60 * 60 * 1000, // box 5: 30 days
];

export interface BoxState {
  entryId: string;
  box: number; // 1..5
  lastReviewedAt: number;
  nextDueAt: number;
}

/** Pure: compute the next BoxState given the previous one and the answer outcome. */
export function updateSm2(prev: BoxState | undefined, correct: boolean, now: number = Date.now()): BoxState {
  const entryId = prev?.entryId ?? "";
  const currentBox = prev?.box ?? DEFAULT_BOX;
  const nextBox = correct ? Math.min(5, currentBox + 1) : Math.max(1, currentBox - 1);
  const interval = BOX_INTERVALS_MS[nextBox] ?? BOX_INTERVALS_MS[1];
  return {
    entryId,
    box: nextBox,
    lastReviewedAt: now,
    nextDueAt: now + interval,
  };
}

/**
 * Pure: choose entry IDs that are due for practice now.
 * Unknown entries (no state) are seeded at DEFAULT_BOX with nextDueAt=0 so
 * they are immediately due. Result is sorted by oldest-due first.
 */
export function pickDue(
  states: ReadonlyMap<string, BoxState>,
  allEntryIds: readonly string[],
  now: number = Date.now(),
): string[] {
  const due: { id: string; due: number }[] = [];
  for (const id of allEntryIds) {
    const s = states.get(id);
    const nextDueAt = s?.nextDueAt ?? 0;
    if (nextDueAt <= now) due.push({ id, due: nextDueAt });
  }
  return due.sort((a, b) => a.due - b.due).map((x) => x.id);
}

/**
 * Migration: seed BoxStates for any entry id that appears in past quiz history
 * but doesn't yet have a box state. New states start at DEFAULT_BOX, immediately due.
 */
export function seedFromHistory(
  states: Map<string, BoxState>,
  history: readonly QuizSessionRecord[],
): Map<string, BoxState> {
  for (const session of history) {
    for (const a of session.answers) {
      if (!a.entryId || states.has(a.entryId)) continue;
      states.set(a.entryId, {
        entryId: a.entryId,
        box: DEFAULT_BOX,
        lastReviewedAt: 0,
        nextDueAt: 0,
      });
    }
  }
  return states;
}

// Storage helpers (thin wrappers; tests target the pure functions above)

export function loadBoxStates(): Map<string, BoxState> {
  try {
    const raw = localStorage.getItem(BOX_STORAGE_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as BoxState[];
    return new Map(arr.map((s) => [s.entryId, s]));
  } catch {
    return new Map();
  }
}

export function saveBoxStates(states: ReadonlyMap<string, BoxState>): void {
  try {
    localStorage.setItem(BOX_STORAGE_KEY, JSON.stringify([...states.values()]));
  } catch {
    /* ignore quota errors */
  }
}

/** Record an answer's outcome against the box state for an entry, persisting the result. */
export function recordReview(entryId: string, correct: boolean, now: number = Date.now()): void {
  if (!entryId) return;
  const states = loadBoxStates();
  const prev = states.get(entryId) ?? {
    entryId,
    box: DEFAULT_BOX,
    lastReviewedAt: 0,
    nextDueAt: 0,
  };
  states.set(entryId, updateSm2(prev, correct, now));
  saveBoxStates(states);
}

/** Aggregate per-word stats across all sessions */
export function wordStats(history: QuizSessionRecord[]) {
  const map = new Map<string, { prompt: string; correct: number; wrong: number; total: number }>();

  for (const session of history) {
    for (const a of session.answers) {
      if (a.skipped) continue;
      const key = `${a.fromLang}:${a.prompt}`;
      const existing = map.get(key) || { prompt: a.prompt, correct: 0, wrong: 0, total: 0 };
      existing.total++;
      if (a.correct) existing.correct++;
      else existing.wrong++;
      map.set(key, existing);
    }
  }

  return [...map.values()].sort((a, b) => b.wrong - a.wrong || b.total - a.total);
}
