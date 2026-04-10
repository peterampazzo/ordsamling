interface Env {
  LEXICON: KVNamespace;
  ALLOW_AUTH_BYPASS?: string;
}

type EntryType = "word" | "expression" | "noun" | "verb" | "adjective";

const GRAMMAR_KEYS = [
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
] as const;

interface LexisEntry {
  id: string;
  danish: string;
  english: string;
  italian: string;
  notes: string;
  type: EntryType;
  grammar?: Record<string, string>;
  createdAt: number;
}

type LexisEntryInput = Omit<LexisEntry, "id" | "createdAt">;

const STORAGE_KEY = "entries:v1";

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
  const host = request.headers.get("host") ?? "";
  if (allowLocalBypass && (host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
    return true;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;

  // Look for CF_Authorization cookie
  const cookies = cookieHeader.split(";").map(c => c.trim());
  return cookies.some(c => c.startsWith("CF_Authorization="));
}

async function readEntries(env: Env): Promise<LexisEntry[]> {
  const raw = await env.LEXICON.get(STORAGE_KEY, "json");

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value) => normalizeEntry(value))
    .filter((value): value is LexisEntry => value !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
}

async function writeEntries(env: Env, entries: LexisEntry[]) {
  await env.LEXICON.put(STORAGE_KEY, JSON.stringify(entries));
}

function normalizeEntryType(value: unknown): EntryType {
  if (value === "expression" || value === "noun" || value === "verb" || value === "adjective") {
    return value;
  }
  return "word";
}

function normalizeGrammar(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const out: Record<string, string> = {};

  for (const key of GRAMMAR_KEYS) {
    const v = raw[key];
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, 240);
    if (t) out[key] = t;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeEntry(value: unknown): LexisEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const type = normalizeEntryType(candidate.type);

  const entry: LexisEntry = {
    id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
    danish: typeof candidate.danish === "string" ? candidate.danish : "",
    english: typeof candidate.english === "string" ? candidate.english : "",
    italian: typeof candidate.italian === "string" ? candidate.italian : "",
    notes: typeof candidate.notes === "string" ? candidate.notes : "",
    type,
    createdAt:
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : Date.now(),
  };

  const grammar = normalizeGrammar(candidate.grammar);
  if (grammar) {
    entry.grammar = grammar;
  }

  return entry;
}

function validateEntryInput(value: unknown): LexisEntryInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const type = normalizeEntryType(candidate.type);

  const input: LexisEntryInput = {
    danish: typeof candidate.danish === "string" ? candidate.danish.trim() : "",
    english: typeof candidate.english === "string" ? candidate.english.trim() : "",
    italian: typeof candidate.italian === "string" ? candidate.italian.trim() : "",
    notes: typeof candidate.notes === "string" ? candidate.notes.trim() : "",
    type,
  };

  const grammar = normalizeGrammar(candidate.grammar);
  if (grammar) {
    input.grammar = grammar;
  }

  return input;
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

  const entries = await readEntries(env);
  return json({ entries });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasValidAccessToken(request, env)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await getPayload<LexisEntryInput>(request);
  const entry = validateEntryInput(payload);

  if (!entry || (!entry.danish && !entry.english && !entry.italian)) {
    return json({ error: "Invalid entry payload." }, { status: 400 });
  }

  const entries = await readEntries(env);
  const createdEntry: LexisEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };

  entries.unshift(createdEntry);
  await writeEntries(env, entries);

  return json({ entry: createdEntry }, { status: 201 });
};