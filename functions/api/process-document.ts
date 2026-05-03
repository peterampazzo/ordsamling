import type { Ai } from "@cloudflare/workers-types";

interface Env {
  LEXICON: KVNamespace;
  AI: Ai;
  ALLOW_AUTH_BYPASS?: string;
}

type EntryType = "word" | "expression" | "noun" | "verb" | "adjective";

interface LexisEntry {
  id: string;
  danish: string;
  english: string;
  translations?: Record<string, string>;
  notes: string;
  type: EntryType;
  grammar?: Record<string, string>;
  createdAt: number;
}

type LexisEntryInput = Omit<LexisEntry, "id" | "createdAt">;

const STORAGE_KEY = "entries:v1";
const MAX_EXTRA_LANGUAGES = 5;

const LANGUAGE_NAMES: Record<string, string> = {
  it: "Italian",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Portuguese",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  fi: "Finnish",
  is: "Icelandic",
  pl: "Polish",
  ja: "Japanese",
  zh: "Chinese",
};

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
  if (allowLocalBypass) return true;
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;
  return cookieHeader.split(";").map(c => c.trim()).some(c => c.startsWith("CF_Authorization="));
}

function parseLanguages(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const code = part.trim().toLowerCase();
    if (!/^[a-z]{2,3}$/.test(code)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= MAX_EXTRA_LANGUAGES) break;
  }
  return out;
}

async function readEntries(env: Env): Promise<LexisEntry[]> {
  const raw = await env.LEXICON.get(STORAGE_KEY, "json");
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value): LexisEntry | null => {
      if (!value || typeof value !== "object") return null;
      const c = value as Record<string, unknown>;
      const grammar = c.grammar as Record<string, string> | undefined;
      const translations = c.translations as Record<string, string> | undefined;
      const entry: LexisEntry = {
        id: typeof c.id === "string" ? c.id : "",
        danish: typeof c.danish === "string" ? c.danish : "",
        english: typeof c.english === "string" ? c.english : "",
        notes: typeof c.notes === "string" ? c.notes : "",
        type: normalizeEntryType(c.type),
        createdAt: typeof c.createdAt === "number" ? c.createdAt : 0,
        ...(grammar ? { grammar } : {}),
        ...(translations ? { translations } : {}),
      };
      return entry;
    })
    .filter((value): value is LexisEntry => value !== null && value.id !== "")
    .sort((left, right) => right.createdAt - left.createdAt);
}

function normalizeEntryType(value: unknown): EntryType {
  if (value === "expression" || value === "noun" || value === "verb" || value === "adjective") {
    return value;
  }
  return "word";
}

async function extractWordsFromText(text: string, env: Env): Promise<string[]> {
  const prompt = `Extract all unique Danish words from the following text. Return only a JSON array of strings, no other text. Focus on actual Danish words, ignore numbers, punctuation, and non-Danish words. Make them lowercase.

Text:
${text}

Response format: ["word1", "word2", ...]`;

  try {
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const content = response.response as string;
    const words = JSON.parse(content.trim());
    return Array.isArray(words) ? words.filter(w => typeof w === "string" && w.length > 0) : [];
  } catch (error) {
    console.error("AI extraction failed:", error);
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && /^[a-zæøå]+$/i.test(w))
      .filter((w, i, arr) => arr.indexOf(w) === i);
    return words;
  }
}

async function processWord(word: string, languages: string[], env: Env): Promise<LexisEntryInput | null> {
  const translationLines = languages
    .map((code) => `  - translations.${code}: ${LANGUAGE_NAMES[code] ?? code.toUpperCase()} translation`)
    .join("\n");

  const exampleTranslations = languages.length > 0
    ? `, "translations": { ${languages.map((c) => `"${c}": "..."`).join(", ")} }`
    : "";

  const prompt = `For the Danish word "${word}", provide the following information in JSON format:
- english: English translation
- type: One of "noun", "verb", "adjective", "expression", or "word" (default to "word")
- notes: Any additional notes about grammar or usage (optional, may be empty string)${languages.length > 0 ? "\n" + translationLines : ""}

Response format: {"english": "...", "type": "...", "notes": "..."${exampleTranslations}}`;

  try {
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

    const content = response.response as string;
    const data = JSON.parse(content.trim()) as Record<string, unknown>;

    const translations: Record<string, string> = {};
    const rawTranslations = data.translations;
    if (rawTranslations && typeof rawTranslations === "object") {
      for (const code of languages) {
        const v = (rawTranslations as Record<string, unknown>)[code];
        if (typeof v === "string" && v.trim()) translations[code] = v.trim();
      }
    }

    const entry: LexisEntryInput = {
      danish: word,
      english: typeof data.english === "string" ? data.english : "",
      notes: typeof data.notes === "string" ? data.notes : "",
      type: normalizeEntryType(data.type),
      ...(Object.keys(translations).length > 0 ? { translations } : {}),
    };
    return entry;
  } catch (error) {
    console.error(`AI processing failed for word "${word}":`, error);
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasValidAccessToken(request, env)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ error: "Expected multipart/form-data." }, { status: 400 });
    }

    const formData = await request.formData();
    const text = formData.get("text") as string;
    const languages = parseLanguages(formData.get("languages") as string | null);

    if (!text) return json({ error: "No text provided." }, { status: 400 });
    if (!text.trim()) return json({ error: "File appears to be empty." }, { status: 400 });

    const extractedWords = await extractWordsFromText(text, env);

    const existingEntries = await readEntries(env);
    const existingWords = new Set(existingEntries.map(e => e.danish.toLowerCase()));

    const newWords = extractedWords.filter(word => !existingWords.has(word.toLowerCase()));

    if (newWords.length === 0) {
      return json({ entries: [], message: "No new words found in the document." });
    }

    const maxWords = 50;
    const wordsToProcess = newWords.slice(0, maxWords);
    const processedEntries: LexisEntryInput[] = [];

    for (const word of wordsToProcess) {
      const entry = await processWord(word, languages, env);
      if (entry) processedEntries.push(entry);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return json({
      entries: processedEntries,
      totalExtracted: extractedWords.length,
      newWords: newWords.length,
      processed: processedEntries.length,
      languages,
    });
  } catch (error) {
    console.error("Document processing error:", error);
    return json({ error: "Failed to process document." }, { status: 500 });
  }
};
