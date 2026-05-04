/**
 * Client-side Gemini API helpers using the official @google/genai SDK.
 * All calls go directly from the browser to the Gemini API.
 * The user's API key is read from localStorage and never sent to any
 * developer-controlled server.
 */

import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, getGeminiModel } from "@/lib/settings";
import type { LexisEntryInput, EntryType } from "@/lib/lexicon";

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
  retryAfterSeconds: number | null;
  isDailyQuota: boolean;
  constructor(retryAfterSeconds: number | null = null, isDailyQuota = false) {
    super("Gemini API quota exceeded.");
    this.name = "GeminiRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.isDailyQuota = isDailyQuota;
  }
}

export class GeminiUnavailableError extends Error {
  constructor() {
    super("Gemini is currently experiencing high demand. Please try again in a moment.");
    this.name = "GeminiUnavailableError";
  }
}

// ---------------------------------------------------------------------------
// SDK client factory (one instance per key)
// ---------------------------------------------------------------------------

let _client: GoogleGenAI | null = null;
let _clientKey = "";

// ---------------------------------------------------------------------------
// Last prompt storage (for troubleshooting)
// ---------------------------------------------------------------------------

let _lastPrompt = "";
let _lastPromptTimestamp: Date | null = null;

export function getLastPrompt(): { prompt: string; timestamp: Date | null } {
  return { prompt: _lastPrompt, timestamp: _lastPromptTimestamp };
}

function getClient(): GoogleGenAI {
  const key = getGeminiApiKey();
  if (!key) throw new GeminiKeyMissingError();
  if (!_client || _clientKey !== key) {
    _client = new GoogleGenAI({ apiKey: key });
    _clientKey = key;
  }
  return _client;
}

function resolvedModel(): string {
  const m = getGeminiModel();
  return m || "gemini-2.5-flash";
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapSdkError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("403")) {
    throw new GeminiKeyInvalidError();
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    // Try to extract retryDelay from the message
    const retryMatch = msg.match(/retryDelay["\s:]+(\d+)/);
    const retryAfterSeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;
    const isDailyQuota = msg.toLowerCase().includes("perday");
    throw new GeminiRateLimitError(retryAfterSeconds, isDailyQuota);
  }
  if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
    throw new GeminiUnavailableError();
  }
  throw err instanceof Error ? err : new Error(msg);
}

// ---------------------------------------------------------------------------
// Core callf
// ---------------------------------------------------------------------------

async function callGemini(
  prompt: string,
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    systemInstruction?: string;
  } = {},
): Promise<string> {
  const ai = getClient();
  const model = resolvedModel();

  // Store prompt for troubleshooting
  _lastPrompt = prompt;
  _lastPromptTimestamp = new Date();

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: options.temperature ?? 0.3,
        ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        ...(options.systemInstruction
          ? { systemInstruction: options.systemInstruction }
          : {}),
      },
    });

    // response.text may be empty for thinking models — extract from parts directly
    const text = response.text
      ?? response.candidates?.[0]?.content?.parts
          ?.filter((p: any) => !p.thought && p.text)
          ?.map((p: any) => p.text)
          ?.join("") 
      ?? "";

    return text;
  } catch (err) {
    mapSdkError(err);
  }
}

// ---------------------------------------------------------------------------
// JSON parsing helper
// ---------------------------------------------------------------------------

function safeJsonParse<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  // Strip markdown fences
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(s) as T; } catch { /* fallthrough */ }
  // Extract first JSON object or array
  const firstBrace = s.search(/[\[{]/);
  const lastBrace = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(s.slice(firstBrace, lastBrace + 1)) as T; } catch { /* fallthrough */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Key validation
// ---------------------------------------------------------------------------

export type KeyValidationStatus = "valid" | "invalid" | "missing" | "checking";

export async function validateGeminiKey(): Promise<"valid" | "invalid" | "missing"> {
  const key = getGeminiApiKey();
  if (!key.trim()) return "missing";
  try {
    await callGemini("Say OK", { maxOutputTokens: 5 });
    return "valid";
  } catch (err) {
    if (err instanceof GeminiKeyInvalidError) return "invalid";
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
      throw err;
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

async function processWordChunk(words: string[], languages: string[]): Promise<LexisEntryInput[]> {
  if (words.length === 0) return [];

  const translationInstruction = languages.length > 0
    ? `\n- "translations": object with keys ${languages.map((c) => `"${c}"`).join(", ")} (${languages.map((c) => LANGUAGE_NAMES[c] ?? c.toUpperCase()).join(", ")} translations)`
    : "";

  const translationExample = languages.length > 0
    ? `, "translations": { ${languages.map((c) => `"${c}": "..."`).join(", ")} }`
    : "";

  const prompt = `For each Danish word or phrase in the list below, return a JSON array where each element has:
- "danish": the word exactly as given (strip leading "at " for verbs)
- "english": English translation (strip leading "to " for verbs)
- "type": one of "noun", "verb", "adjective", "expression", or "word"
- "notes": any useful usage note for the learner, or empty string — do NOT put grammar info here
- "grammar": object with type-appropriate Danish inflections:
    - noun: { "article": "en" or "et", "singularDefinite": "...", "pluralIndefinite": "...", "pluralDefinite": "..." }
    - verb: { "present": "...", "past": "...", "perfect": "har/er ..." }
    - adjective: { "neuter": "...", "definite": "...", "plural": "...", "comparative": "...", "superlative": "..." }
    - expression, word: omit "grammar" entirely${translationInstruction}

IMPORTANT:
- Only include words that are genuine Danish words or phrases. Skip any English words, proper nouns, or non-Danish entries.
- If a word is not Danish, omit it from the output entirely — do not include it with a note.
- The "notes" field is for learner context (e.g. "used with 'at have'", "informal"), NOT for grammar labels like "common gender" or "neuter gender" — those belong in grammar.article.

Words: ${JSON.stringify(words)}

Return ONLY a JSON array, no markdown, no explanation.
Examples:
{"danish": "hus", "english": "house", "type": "noun", "notes": "", "grammar": {"article": "et", "singularDefinite": "huset", "pluralIndefinite": "huse", "pluralDefinite": "husene"}${translationExample}}
{"danish": "løbe", "english": "run", "type": "verb", "notes": "", "grammar": {"present": "løber", "past": "løb", "perfect": "har løbet"}${translationExample}}
{"danish": "stor", "english": "big", "type": "adjective", "notes": "", "grammar": {"neuter": "stort", "definite": "store", "plural": "store", "comparative": "større", "superlative": "størst"}${translationExample}}
{"danish": "god morgen", "english": "good morning", "type": "expression", "notes": "common greeting"${translationExample}}
{"danish": "altid", "english": "always", "type": "word", "notes": "adverb"${translationExample}}`;

  const responseText = await callGemini(prompt, { temperature: 0.1, maxOutputTokens: 8192 });
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

    const grammarRaw =
      obj.grammar && typeof obj.grammar === "object" && !Array.isArray(obj.grammar)
        ? (obj.grammar as Record<string, unknown>)
        : {};
    const grammar: Record<string, string> = {};
    for (const [k, v] of Object.entries(grammarRaw)) {
      if (typeof v === "string" && v.trim()) grammar[k] = v.trim();
    }

    return [{
      danish,
      english: typeof obj.english === "string" ? obj.english : "",
      notes: typeof obj.notes === "string" ? obj.notes : "",
      type: normalizeEntryTypeLocal(obj.type),
      ...(Object.keys(translations).length > 0 ? { translations } : {}),
      ...(Object.keys(grammar).length > 0 ? { grammar } : {}),
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

export async function processDocument(
  text: string,
  languages: string[],
  existingWords: string[],
  onProgress?: (progress: { completed: number; total: number }) => void,
): Promise<ProcessDocumentResult> {
  const existingSet = new Set(existingWords.map((w) => w.toLowerCase()));

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

  const totalChunks = Math.ceil(newWords.length / WORDS_PER_CHUNK);
  const totalSteps = 1 + totalChunks;
  onProgress?.({ completed: 1, total: totalSteps });

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
    }
    onProgress?.({ completed: 1 + Math.floor(i / WORDS_PER_CHUNK) + 1, total: totalSteps });
  }

  return {
    entries,
    totalExtracted: extractedWords.length,
    newWords: newWords.length,
    processed: entries.length,
    truncated: false,
    languages,
    ...(firstError && entries.length === 0 ? { error: firstError.message } : {}),
  };
}

export async function processDocumentChunked(
  words: string[],
  languages: string[],
  existingWords: string[] = [],
  onProgress?: (progress: { completed: number; total: number }) => void,
): Promise<LexisEntryInput[]> {
  const existingSet = new Set(existingWords.map((w) => w.toLowerCase()));
  const cleaned = Array.from(
    new Set(
      words
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length > 0 && !existingSet.has(w)),
    ),
  );

  if (cleaned.length === 0) {
    onProgress?.({ completed: 1, total: 1 });
    return [];
  }

  const totalChunks = Math.ceil(cleaned.length / WORDS_PER_CHUNK);
  onProgress?.({ completed: 0, total: totalChunks });

  const entries: LexisEntryInput[] = [];
  for (let i = 0; i < cleaned.length; i += WORDS_PER_CHUNK) {
    const chunk = cleaned.slice(i, i + WORDS_PER_CHUNK);
    try {
      const chunkEntries = await processWordChunk(chunk, languages);
      entries.push(...chunkEntries);
    } catch (err) {
      if (
        err instanceof GeminiKeyMissingError ||
        err instanceof GeminiKeyInvalidError ||
        err instanceof GeminiRateLimitError
      ) throw err;
    }
    onProgress?.({ completed: Math.floor(i / WORDS_PER_CHUNK) + 1, total: totalChunks });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Single-word AI autocomplete (Sparkles button in AddEntryForm)
// ---------------------------------------------------------------------------

export async function autocompleteSingleWord(
  word: string,
  sourceLang: "da" | "en" = "da",
): Promise<LexisEntryInput> {
  const trimmed = word.trim();
  if (!trimmed) throw new Error("Empty word");

  const sourceLabel = sourceLang === "da" ? "Danish" : "English";
  const prompt = `You are a Danish-English dictionary assistant.
The user provided this ${sourceLabel} word: "${trimmed}"

Return a single JSON object with these fields:
- "danish": the Danish form (without "at " for verbs)
- "english": the English translation (without "to " for verbs)
- "type": one of "noun", "verb", "adjective", "expression", or "word"
- "notes": short usage/grammar note in English (or empty string)
- "grammar": object with type-appropriate Danish inflections, or empty object
    - noun: { article, singularDefinite, pluralIndefinite, pluralDefinite }
    - verb: { present, past, perfect }
    - adjective: { neuter, definite, plural, comparative, superlative }
    - other: {}

Return ONLY the JSON object, no markdown, no explanation.`;

  const responseText = await callGemini(prompt, {
    temperature: 0.2,
    systemInstruction: "Return only valid JSON. No prose, no markdown fences.",
  });

  const parsed = safeJsonParse<Record<string, unknown>>(responseText);
  if (!parsed || typeof parsed !== "object") {
    console.error("Could not parse AI response. Length:", responseText.length);
    console.error("Raw (first 500):", responseText.slice(0, 500));
    console.error("Raw (last 200):", responseText.slice(-200));
    throw new Error("Could not parse AI response");
  }

  const danish = typeof parsed.danish === "string" ? parsed.danish.trim() : "";
  const english = typeof parsed.english === "string" ? parsed.english.trim() : "";
  if (!danish && !english) throw new Error("AI returned no usable translation");

  const grammarRaw =
    parsed.grammar && typeof parsed.grammar === "object" && !Array.isArray(parsed.grammar)
      ? (parsed.grammar as Record<string, unknown>)
      : {};
  const grammar: Record<string, string> = {};
  for (const [k, v] of Object.entries(grammarRaw)) {
    if (typeof v === "string" && v.trim()) grammar[k] = v.trim();
  }

  return {
    danish,
    english,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    type: normalizeEntryTypeLocal(parsed.type),
    ...(Object.keys(grammar).length > 0 ? { grammar } : {}),
  };
}
