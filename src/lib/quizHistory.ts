const STORAGE_KEY = "lexikon-quiz-history";
const HISTORY_API = "/api/quiz/history";

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

function isLocalStorageMode() {
  return import.meta.env.DEV || window.location.hostname.endsWith(".pages.dev");
}

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

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = "Request failed.";

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Ignore JSON parse errors and use generic message
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function loadHistory(): QuizSessionRecord[] {
  return getLocalHistory();
}

export async function fetchHistory(): Promise<QuizSessionRecord[]> {
  if (isLocalStorageMode()) {
    return getLocalHistory();
  }

  try {
    const data = await requestJson<{ history: QuizSessionRecord[] }>(HISTORY_API);
    const history = Array.isArray(data.history) ? data.history : [];
    saveLocalHistory(history);
    return history;
  } catch {
    return getLocalHistory();
  }
}

export async function saveSession(session: QuizSessionRecord) {
  if (isLocalStorageMode()) {
    const history = getLocalHistory();
    history.unshift(session);
    if (history.length > 50) history.length = 50;
    saveLocalHistory(history);
    return;
  }

  try {
    const data = await requestJson<{ history: QuizSessionRecord[] }>(HISTORY_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(session),
    });
    const history = Array.isArray(data.history) ? data.history : [session];
    saveLocalHistory(history);
  } catch {
    const history = getLocalHistory();
    history.unshift(session);
    if (history.length > 50) history.length = 50;
    saveLocalHistory(history);
  }
}

export async function clearHistory() {
  if (isLocalStorageMode()) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  try {
    await fetch(HISTORY_API, { method: "DELETE" });
  } catch {
    // ignore network errors, still clear local cache
  }
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
