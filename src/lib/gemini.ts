/**
 * Client-side Gemini API helpers.
 * All calls go directly from the browser to the Gemini REST API.
 * The user's API key is read from localStorage and never sent to any
 * developer-controlled server.
 */

import { getGeminiApiKey, getGeminiModel } from "@/lib/settings";
import type { LexisEntryInput, EntryType } from "@/lib/lexicon";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const ALLOWED_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash-preview-04-17"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvedModel(): string {
  const m = getGeminiModel();
  return (ALLOWED_MODELS as readonly string[]).includes(m) ? m : "gemini-2.0-flash";
}

function geminiUrl(model: string): string {
  return `${GEMINI_BASE}/${model}:generateContent`;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; status?: string; details?: unknown[] };
}

async function callGemini(
  prompt: string,
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    systemInstruction?: string;
  } = {},
): Promise<string> {
  const key = getGeminiApiKey();
  if (!key) throw new GeminiKeyMissingError();

  const model = resolvedModel();
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
    },
  };
  if (options.systemInstruction) {
    body.systemInstruction = { parts: [{ text: options.systemInstruction }] };
  }

  const res = await fetch(`${geminiUrl(model)}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (res.status === 429) {
      const details = err.error?.details as Array<Record<string, unknown>> | undefined;
      // Check if any violation is a daily quota
      const quotaFailure = details?.find(
        (d) => d["@type"] === "type.googleapis.com/google.rpc.QuotaFailure"
      );
      const violations = quotaFailure?.violations as Array<Record<string, unknown>> | undefined;
      const isDailyQuota = violations?.some((v) =>
        typeof v.quotaId === "string" && v.quotaId.toLowerCase().includes("perday")
      ) ?? false;
      // Extract retryDelay from the RetryInfo detail if present
      const retryInfo = details?.find(
        (d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
      );
      const retryDelayStr = retryInfo?.retryDelay as string | undefined;
      const retryAfterSeconds = retryDelayStr
        ? parseInt(retryDelayStr.replace("s", ""), 10) || null
        : null;
      throw new GeminiRateLimitError(retryAfterSeconds, isDailyQuota);
    }
    if (res.status === 400 && err.error?.status === "INVALID_ARGUMENT") {
      throw new GeminiKeyInvalidError();
    }
    if (res.status === 401 || res.status === 403) {
      throw new GeminiKeyInvalidError();
    }
    throw new Error(`Gemini API error ${res.status}: ${err.error?.message ?? res.statusText}`);
  }

  const data = (await res.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/** Best-effort JSON extraction from possibly-noisy LLM output. */
function safeJsonParse<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(s) as T; } catch { /* fallthrough */ }
  const firstBrace = s.search(/[\[{]/);
  const lastBrace = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(s.slice(firstBrace, lastBrace + 1)) as T; } catch { /* fallthrough */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class GeminiKeyMissingError extends Error {
  constructor() {
    super("Add a Gemini API key in Settings to use AI features.");
    this.name = "GeminiKeyMissingError";
  }
}

export class GeminiKeyInvalidError extends Error {
  constructor() {
    super("Invalid Gemini API key. Check your key in Settings.");
    this.name = "GeminiKeyInvalidError";
  }
}

export class GeminiRateLimitError extends Error {
  /** Seconds until the quota resets, if provided by the API. */
  retryAfterSeconds: number | null;
  /** True when the daily quota is exhausted (reset at midnight PT, not just next minute). */
  isDailyQuota: boolean;
  constructor(retryAfterSeconds: number | null = null, isDailyQuota = false) {
    super("Gemini API quota exceeded.");
    this.name = "GeminiRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.isDailyQuota = isDailyQuota;
  }
}

// ---------------------------------------------------------------------------
// Key validation
// ---------------------------------------------------------------------------

export type KeyValidationStatus = "valid" | "invalid" | "missing" | "checking";

/**
 * Validates the stored Gemini API key by making a minimal generateContent call.
 * Returns "valid", "invalid", or "missing".
 */
export async function validateGeminiKey(): Promise<"valid" | "invalid" | "missing"> {
  const key = getGeminiApiKey();
  if (!key.trim()) return "missing";

  try {
    await callGemini("Say OK", { maxOutputTokens: 5 });
    return "valid";
  } catch (err) {
    if (err instanceof GeminiKeyInvalidError) return "invalid";
    // Network errors etc — don't mark as invalid
    return "valid";
  }
}

// ---------------------------------------------------------------------------
// Distractor generation
// ---------------------------------------------------------------------------

export interface DistractorRequest {
  correctAnswer: string;
  questionType: "translate" | "conjugation" | "noun_form" | "fill_blank";
  entryType: "word" | "expression" | "noun" | "verb" | "adjective";
  difficulty: "beginner" | "intermediate" | "advanced";
  scoreRatio: number;
  prompt: string;
  answerLang: "danish" | "english";
  existingAnswers?: string[];
  answerPrefix?: string;
}

function buildDistractorPrompt(req: DistractorRequest): string {
  const lang = req.answerLang === "danish" ? "Danish" : "English";
  const similarity =
    req.difficulty === "advanced" || req.scoreRatio > 0.7
      ? "very similar (differing by only 1-2 letters, endings, or articles)"
      : req.difficulty === "intermediate"
      ? "somewhat similar (same word family or pattern)"
      : "plausible but clearly different";

  let typeHint = "";
  if (req.questionType === "conjugation") {
    typeHint = `These should be other plausible ${lang} verb conjugation forms (wrong tense, wrong ending).`;
  } else if (req.questionType === "noun_form") {
    typeHint = `These should be other plausible ${lang} noun declension forms (wrong article, wrong plural ending).`;
  } else {
    typeHint = `These should be other real ${lang} words that could be confused with the correct answer.`;
  }

  const typeRule = (() => {
    switch (req.entryType) {
      case "verb": return `IMPORTANT: All 3 distractors MUST be ${lang} VERBS (not nouns or adjectives).`;
      case "noun": return `IMPORTANT: All 3 distractors MUST be ${lang} NOUNS (not verbs or adjectives).`;
      case "adjective": return `IMPORTANT: All 3 distractors MUST be ${lang} ADJECTIVES (not nouns or verbs).`;
      case "expression": return `IMPORTANT: All 3 distractors MUST be short ${lang} expressions/phrases of similar length.`;
      default: return `IMPORTANT: All 3 distractors MUST be the same part of speech as the correct answer.`;
    }
  })();

  const prefixRule = req.answerPrefix
    ? `IMPORTANT: The correct answer starts with "${req.answerPrefix} ". Every distractor MUST also start with "${req.answerPrefix} ".`
    : "";

  const avoid = req.existingAnswers?.length
    ? `\nDo NOT include any of these: ${req.existingAnswers.join(", ")}`
    : "";

  return `Generate exactly 3 wrong answer options (distractors) for a ${lang} language quiz.

Correct answer: "${req.correctAnswer}"
Source prompt: "${req.prompt}"
Word type: ${req.entryType}
Question type: ${req.questionType}

${typeHint}
${typeRule}
${prefixRule}
The distractors should be ${similarity} to the correct answer.${avoid}

Return ONLY a JSON array of 3 strings, no explanation. Example: ["word1", "word2", "word3"]`;
}

function parseDistractors(text: string): string[] {
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s: string) => s.trim())
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Fetches AI-generated distractors for a quiz question directly from Gemini.
 * Returns empty array silently if no key is configured.
 */
export async function fetchDistractors(req: DistractorRequest): Promise<string[]> {
  try {
    const text = await callGemini(buildDistractorPrompt(req), {
      maxOutputTokens: 100,
      temperature: req.difficulty === "advanced" ? 0.3 : 0.5,
      systemInstruction: "You are a language quiz assistant. Return only JSON arrays, no other text.",
    });
    return parseDistractors(text);
  } catch (err) {
    if (err instanceof GeminiKeyMissingError || err instanceof GeminiKeyInvalidError) {
      throw err; // let caller handle
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Document processing (bulk import)
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  it: "Italian", fr: "French", de: "German", es: "Spanish",
  pt: "Portuguese", nl: "Dutch", sv: "Swedish", no: "Norwegian",
  fi: "Finnish", is: "Icelandic", pl: "Polish", ja: "Japanese", zh: "Chinese",
};

// Max words per single Gemini request — keeps output tokens manageable (~50 words
// × ~60 tokens/entry ≈ 3 000 tokens, well within limits). Multiple chunks are
// processed sequentially to stay inside the 15 RPM free-tier rate limit.
const WORDS_PER_CHUNK = 50;

function fallbackExtractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\wæøå\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && /^[a-zæøå]+$/i.test(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

async function extractWordsFromText(text: string): Promise<string[]> {
  const truncated = text.slice(0, 6000);
  const prompt = `Extract all unique Danish words from the following text. Return only a JSON array of strings, no other text. Focus on actual Danish words, ignore numbers, punctuation, and non-Danish words. Make them lowercase.

Text:
${truncated}

Response format: ["word1", "word2", ...]`;

  try {
    const responseText = await callGemini(prompt, { temperature: 0.1 });
    const words = safeJsonParse<unknown>(responseText);
    if (Array.isArray(words)) {
      const cleaned = words
        .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
        .map((w) => w.trim().toLowerCase());
      if (cleaned.length > 0) return Array.from(new Set(cleaned));
    }
  } catch (err) {
    if (err instanceof GeminiKeyMissingError || err instanceof GeminiKeyInvalidError) throw err;
    console.error("AI word extraction failed:", err);
  }
  return fallbackExtractWords(text);
}

function normalizeEntryTypeLocal(value: unknown): EntryType {
  if (value === "expression" || value === "noun" || value === "verb" || value === "adjective") {
    return value;
  }
  return "word";
}

/**
 * Processes a chunk of words in a single Gemini request, returning one entry per word.
 * Using a single batched request per chunk instead of one request per word keeps
 * API usage well within the free-tier rate limits (15 RPM / 200 RPD).
 */
async function processWordChunk(
  words: string[],
  languages: string[],
): Promise<LexisEntryInput[]> {
  if (words.length === 0) return [];

  const translationFields = languages.length > 0
    ? `,\n  "translations": { ${languages.map((c) => `"${c}": "${LANGUAGE_NAMES[c] ?? c.toUpperCase()} translation"`).join(", ")} }`
    : "";

  const prompt = `For each Danish word in the list below, return a JSON array where each element has:
- "danish": the word exactly as given
- "english": English translation
- "type": one of "noun", "verb", "adjective", "expression", or "word"
- "notes": brief grammar/usage note, or empty string${languages.length > 0 ? `\n- "translations": object with keys ${languages.map((c) => `"${c}"`).join(", ")} (${languages.map((c) => LANGUAGE_NAMES[c] ?? c.toUpperCase()).join(", ")} translations)` : ""}

Words: ${JSON.stringify(words)}

Return ONLY a JSON array, no markdown, no explanation.
Example element: {"danish": "hus", "english": "house", "type": "noun", "notes": "common gender"${translationFields}}`;

  const responseText = await callGemini(prompt, { temperature: 0.1, maxOutputTokens: 4096 });
  const parsed = safeJsonParse<unknown>(responseText);
  if (!Array.isArray(parsed)) return [];

  return (parsed as unknown[]).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const obj = item as Record<string, unknown>;
    const danish = typeof obj.danish === "string" ? obj.danish.trim() : "";
    if (!danish) return [];

    const translations: Record<string, string> = {};
    if (obj.translations && typeof obj.translations === "object") {
      for (const code of languages) {
        const v = (obj.translations as Record<string, unknown>)[code];
        if (typeof v === "string" && v.trim()) translations[code] = v.trim();
      }
    }

    return [{
      danish,
      english: typeof obj.english === "string" ? obj.english : "",
      notes: typeof obj.notes === "string" ? obj.notes : "",
      type: normalizeEntryTypeLocal(obj.type),
      ...(Object.keys(translations).length > 0 ? { translations } : {}),
    }];
  });
}

export interface ProcessDocumentResult {
  entries: LexisEntryInput[];
  totalExtracted: number;
  newWords: number;
  processed: number;
  truncated: boolean;
  languages: string[];
  message?: string;
  error?: string;
}

/**
 * Extracts and processes Danish words from a plain-text document using Gemini.
 * Runs entirely client-side — no server involved.
 *
 * Words are processed in chunks of WORDS_PER_CHUNK per Gemini request (instead of
 * one request per word) to stay within free-tier rate limits.
 *
 * @param onProgress - called after each step with { completed, total } where
 *   step 0 = word extraction, steps 1..N = chunk processing.
 */
export async function processDocument(
  text: string,
  languages: string[],
  existingWords: string[],
  onProgress?: (progress: { completed: number; total: number }) => void,
): Promise<ProcessDocumentResult> {
  const existingSet = new Set(existingWords.map((w) => w.toLowerCase()));

  // Step 0: extract words (counts as 1 step)
  onProgress?.({ completed: 0, total: 1 });
  const extractedWords = await extractWordsFromText(text);
  const newWords = extractedWords.filter((w) => !existingSet.has(w.toLowerCase()));

  if (newWords.length === 0) {
    onProgress?.({ completed: 1, total: 1 });
    return {
      entries: [],
      totalExtracted: extractedWords.length,
      newWords: 0,
      processed: 0,
      truncated: false,
      languages,
      message: "No new words found in the document.",
    };
  }

  // Now we know how many chunks there are: 1 extraction step + N chunk steps
  const totalChunks = Math.ceil(newWords.length / WORDS_PER_CHUNK);
  const totalSteps = 1 + totalChunks;
  onProgress?.({ completed: 1, total: totalSteps });

  // Split into chunks and process each with a single Gemini request
  const entries: LexisEntryInput[] = [];
  let firstError: Error | null = null;

  for (let i = 0; i < newWords.length; i += WORDS_PER_CHUNK) {
    const chunk = newWords.slice(i, i + WORDS_PER_CHUNK);
    try {
      const chunkEntries = await processWordChunk(chunk, languages);
      entries.push(...chunkEntries);
    } catch (err) {
      if (
        err instanceof GeminiKeyMissingError ||
        err instanceof GeminiKeyInvalidError ||
        err instanceof GeminiRateLimitError
      ) throw err;
      if (!firstError) firstError = err instanceof Error ? err : new Error(String(err));
      // Continue with remaining chunks even if one fails
    }
    onProgress?.({ completed: 1 + Math.floor(i / WORDS_PER_CHUNK) + 1, total: totalSteps });
  }

  return {
    entries,
    totalExtracted: extractedWords.length,
    newWords: newWords.length,
    processed: entries.length,
    truncated: false, // no longer truncating — we process all words
    languages,
    ...(firstError && entries.length === 0 ? { error: firstError.message } : {}),
  };
}
