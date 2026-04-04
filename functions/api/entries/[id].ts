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

type LexisEntryUpdate = Partial<Omit<LexisEntry, "id" | "createdAt">>;

const STORAGE_KEY = "entries:v1";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
    ...init,
  });

function hasValidAccessToken(request: Request): boolean {
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

function validateEntryUpdate(value: unknown): LexisEntryUpdate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const update: LexisEntryUpdate = {};

  if (typeof candidate.danish === "string") {
    update.danish = candidate.danish.trim();
  }

  if (typeof candidate.english === "string") {
    update.english = candidate.english.trim();
  }

  if (typeof candidate.italian === "string") {
    update.italian = candidate.italian.trim();
  }

  if (typeof candidate.notes === "string") {
    update.notes = candidate.notes.trim();
  }

  if (candidate.type === "word" || candidate.type === "expression") {
    update.type = candidate.type;
  }

  return update;
}

async function getPayload<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function getEntryId(params: Record<string, string | undefined>) {
  return typeof params.id === "string" ? params.id : null;
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!hasValidAccessToken(request)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = getEntryId(params);

  if (!id) {
    return json({ error: "Missing entry id." }, { status: 400 });
  }

  const payload = await getPayload<LexisEntryUpdate>(request);
  const updates = validateEntryUpdate(payload);

  if (!updates) {
    return json({ error: "Invalid update payload." }, { status: 400 });
  }

  const entries = await readEntries(env);
  const index = entries.findIndex((entry) => entry.id === id);

  if (index === -1) {
    return json({ error: "Entry not found." }, { status: 404 });
  }

  const nextEntry = {
    ...entries[index],
    ...updates,
  };

  entries[index] = nextEntry;
  await writeEntries(env, entries);

  return json({ entry: nextEntry });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!hasValidAccessToken(request)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = getEntryId(params);

  if (!id) {
    return json({ error: "Missing entry id." }, { status: 400 });
  }

  const entries = await readEntries(env);
  const nextEntries = entries.filter((entry) => entry.id !== id);

  if (nextEntries.length === entries.length) {
    return json({ error: "Entry not found." }, { status: 404 });
  }

  await writeEntries(env, nextEntries);

  return new Response(null, { status: 204 });
};