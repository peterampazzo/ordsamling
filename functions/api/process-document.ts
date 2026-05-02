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
  if (allowLocalBypass) {
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
    .map((value): LexisEntry | null => {
      if (!value || typeof value !== "object") return null;
      const candidate = value as Record<string, unknown>;
      const grammar = candidate.grammar as EntryGrammar | undefined;
      const entry: LexisEntry = {
        id: typeof candidate.id === "string" ? candidate.id : "",
        danish: typeof candidate.danish === "string" ? candidate.danish : "",
        english: typeof candidate.english === "string" ? candidate.english : "",
        italian: typeof candidate.italian === "string" ? candidate.italian : "",
        notes: typeof candidate.notes === "string" ? candidate.notes : "",
        type: normalizeEntryType(candidate.type),
        createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : 0,
        ...(grammar ? { grammar } : {}),
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
  // Use AI to extract unique Danish words from the text
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
    // Fallback: simple regex extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && /^[a-zæøå]+$/i.test(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // unique
    return words;
  }
}

async function processWord(word: string, env: Env): Promise<LexisEntryInput | null> {
  // Use AI to get translations and type for the Danish word
  const prompt = `For the Danish word "${word}", provide the following information in JSON format:
- english: English translation
- italian: Italian translation  
- type: One of "noun", "verb", "adjective", "expression", or "word" (default to "word")
- notes: Any additional notes about grammar or usage (optional)

Response format: {"english": "...", "italian": "...", "type": "...", "notes": "..."}`;

  try {
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

    const content = response.response as string;
    const data = JSON.parse(content.trim());

    return {
      danish: word,
      english: typeof data.english === "string" ? data.english : "",
      italian: typeof data.italian === "string" ? data.italian : "",
      notes: typeof data.notes === "string" ? data.notes : "",
      type: normalizeEntryType(data.type),
    };
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

    if (!text) {
      return json({ error: "No text provided." }, { status: 400 });
    }

    if (!text.trim()) {
      return json({ error: "File appears to be empty." }, { status: 400 });
    }

    // Extract words from text
    const extractedWords = await extractWordsFromText(text, env);

    // Get existing entries to filter out duplicates
    const existingEntries = await readEntries(env);
    const existingWords = new Set(
      existingEntries.map(e => e.danish.toLowerCase())
    );

    // Filter new words
    const newWords = extractedWords.filter(word => !existingWords.has(word.toLowerCase()));

    if (newWords.length === 0) {
      return json({ entries: [], message: "No new words found in the document." });
    }

    // Process each new word (limit to prevent too many AI calls)
    const maxWords = 50; // Limit processing
    const wordsToProcess = newWords.slice(0, maxWords);
    const processedEntries: LexisEntryInput[] = [];

    for (const word of wordsToProcess) {
      const entry = await processWord(word, env);
      if (entry) {
        processedEntries.push(entry);
      }
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return json({
      entries: processedEntries,
      totalExtracted: extractedWords.length,
      newWords: newWords.length,
      processed: processedEntries.length
    });

  } catch (error) {
    console.error("Document processing error:", error);
    return json({ error: "Failed to process document." }, { status: 500 });
  }
};