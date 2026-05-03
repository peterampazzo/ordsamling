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
