interface Env {
  LEXICON: KVNamespace;
}

type EntryType = "word" | "expression";

interface LexisEntry {
  id: string;
  danish: string;
  english: string;
  italian: string;
  notes: string;
  type: EntryType;
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

function normalizeEntry(value: unknown): LexisEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const type = candidate.type === "expression" ? "expression" : "word";

  return {
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
}

function validateEntryInput(value: unknown): LexisEntryInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const type = candidate.type === "expression" ? "expression" : candidate.type === "word" ? "word" : null;

  if (!type) {
    return null;
  }

  return {
    danish: typeof candidate.danish === "string" ? candidate.danish.trim() : "",
    english: typeof candidate.english === "string" ? candidate.english.trim() : "",
    italian: typeof candidate.italian === "string" ? candidate.italian.trim() : "",
    notes: typeof candidate.notes === "string" ? candidate.notes.trim() : "",
    type,
  };
}

async function getPayload<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const entries = await readEntries(env);
  return json({ entries });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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