interface Env {
  LEXICON: KVNamespace;
  ALLOW_AUTH_BYPASS?: string;
}

type EntryType = "word" | "expression" | "noun" | "verb" | "adjective";

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

const STORAGE_PREFIX = "quiz-history:";
const MAX_HISTORY = 50;

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
    ...init,
  });

function hasValidAccessToken(request: Request, env: Env): boolean {
  const allowLocalBypass = env.ALLOW_AUTH_BYPASS === "1" || env.ALLOW_AUTH_BYPASS === "true";
  if (allowLocalBypass) {
    return true;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  return cookies.some((c) => c.startsWith("CF_Authorization="));
}

function getAuthToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const authCookie = cookies.find((c) => c.startsWith("CF_Authorization="));
  if (!authCookie) return null;
  return authCookie.split("=")[1] || null;
}

async function digestToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getHistoryKey(request: Request): Promise<string> {
  const token = getAuthToken(request) ?? "anonymous";
  const hash = await digestToken(token);
  return `${STORAGE_PREFIX}${hash}`;
}

async function readHistory(env: Env, request: Request): Promise<QuizSessionRecord[]> {
  const key = await getHistoryKey(request);
  const raw = await env.LEXICON.get(key, "json");

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((item): item is QuizSessionRecord => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return (
      typeof record.id === "string" &&
      typeof record.date === "number" &&
      typeof record.mode === "string" &&
      typeof record.fromLabel === "string" &&
      typeof record.toLabel === "string" &&
      typeof record.score === "number" &&
      typeof record.total === "number" &&
      Array.isArray(record.answers)
    );
  });
}

async function writeHistory(env: Env, request: Request, history: QuizSessionRecord[]) {
  const key = await getHistoryKey(request);
  await env.LEXICON.put(key, JSON.stringify(history));
}

function validateSession(value: unknown): QuizSessionRecord | null {
  if (!value || typeof value !== "object") return null;

  const session = value as Record<string, unknown>;
  if (
    typeof session.id !== "string" ||
    typeof session.date !== "number" ||
    typeof session.mode !== "string" ||
    typeof session.fromLabel !== "string" ||
    typeof session.toLabel !== "string" ||
    typeof session.score !== "number" ||
    typeof session.total !== "number" ||
    !Array.isArray(session.answers)
  ) {
    return null;
  }

  const answers = session.answers.every((answer) => {
    if (!answer || typeof answer !== "object") return false;
    const a = answer as Record<string, unknown>;
    return (
      typeof a.prompt === "string" &&
      typeof a.correctAnswer === "string" &&
      typeof a.givenAnswer === "string" &&
      typeof a.correct === "boolean" &&
      typeof a.skipped === "boolean" &&
      typeof a.fromLang === "string" &&
      typeof a.toLang === "string" &&
      typeof a.entryId === "string"
    );
  });

  if (!answers) return null;

  return {
    id: session.id,
    date: session.date,
    mode: session.mode as QuizSessionRecord["mode"],
    fromLabel: session.fromLabel,
    toLabel: session.toLabel,
    score: session.score,
    total: session.total,
    answers: session.answers as QuizAnswerRecord[],
  };
}

async function getPayload<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasValidAccessToken(request, env)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  const history = await readHistory(env, request);
  return json({ history });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasValidAccessToken(request, env)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await getPayload<QuizSessionRecord>(request);
  const session = validateSession(payload);
  if (!session) {
    return json({ error: "Invalid quiz session payload." }, { status: 400 });
  }

  const existingHistory = await readHistory(env, request);
  existingHistory.unshift(session);
  if (existingHistory.length > MAX_HISTORY) {
    existingHistory.length = MAX_HISTORY;
  }

  await writeHistory(env, request, existingHistory);
  return json({ history: existingHistory }, { status: 201 });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasValidAccessToken(request, env)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  const key = await getHistoryKey(request);
  await env.LEXICON.delete(key);
  return json({ ok: true });
};
