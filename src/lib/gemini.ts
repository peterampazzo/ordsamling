/**
 * Client-side Gemini REST API helpers.
 * All calls go directly from the browser to the Gemini API.
 * The user's API key is read from localStorage and never sent to any
 * developer-controlled server.
 */

import { getGeminiApiKey, getGeminiModel } from "@/lib/settings";
import { entryKey } from "@/lib/lexicon";
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

export class ProcessingCancelledError extends Error {
  constructor() {
    super("Processing was cancelled.");
    this.name = "ProcessingCancelledError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ProcessingCancelledError();
}

// ---------------------------------------------------------------------------
// Last prompt storage (for troubleshooting)
// ---------------------------------------------------------------------------

let _lastPrompt = "";
let _lastPromptTimestamp: Date | null = null;

export function getLastPrompt(): { prompt: string; timestamp: Date | null } {
  return { prompt: _lastPrompt, timestamp: _lastPromptTimestamp };
}

function resolvedModel(): string {
  const m = getGeminiModel();
  return m || "gemini-2.5-flash";
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

interface GeminiResponse {
  error?: {
    message?: string;
    details?: Array<{ reason?: string; retryDelay?: string; violations?: Array<{ quotaId?: string }> }>;
  };
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
}

class GeminiTruncatedError extends Error {
  constructor(readonly text: string) {
    super('Gemini reached its response limit. Retry with a smaller input.');
  }
}

function mapApiError(status: number, body: GeminiResponse, retryAfter: string | null): never {
  const details = body.error?.details ?? [];
  if (status === 401 || status === 403 || details.some(detail => detail.reason === 'API_KEY_INVALID')) {
    throw new GeminiKeyInvalidError();
  }
  if (status === 429) {
    const delay = details.find(detail => detail.retryDelay)?.retryDelay;
    const parsedDelay = delay && /^\d+(?:\.\d+)?s$/.test(delay) ? Number(delay.slice(0, -1)) : Number(retryAfter);
    const retryAfterSeconds = (delay || retryAfter) && Number.isFinite(parsedDelay) && parsedDelay >= 0 ? Math.ceil(parsedDelay) : null;
    const isDailyQuota = details.some(detail => detail.violations?.some(violation => /perday/i.test(violation.quotaId ?? '')));
    throw new GeminiRateLimitError(retryAfterSeconds, isDailyQuota);
  }
  if (status >= 500) throw new GeminiUnavailableError();
  throw new Error(body.error?.message || `Gemini request failed (${status}).`);
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
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  throwIfAborted(options.signal);
  const key = getGeminiApiKey();
  if (!key.trim()) throw new GeminiKeyMissingError();
  const model = resolvedModel();
  if (!/^gemini-[A-Za-z0-9._-]+$/.test(model)) throw new Error('Select a valid Gemini model in Settings.');

  // Store prompt for troubleshooting
  _lastPrompt = prompt;
  _lastPromptTimestamp = new Date();

  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 90_000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        },
        ...(options.systemInstruction ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } } : {}),
      }),
    });
    const body = await response.json().catch(() => null) as GeminiResponse | null;
    if (!response.ok) mapApiError(response.status, body ?? {}, response.headers.get('Retry-After'));
    if (!body || typeof body !== 'object') throw new Error('Gemini returned an invalid response.');
    const candidate = body.candidates?.[0];
    if (body.promptFeedback?.blockReason || (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))) {
      throw new Error('Gemini did not return usable content for this request.');
    }
    const text = candidate?.content?.parts?.filter(part => !part.thought && typeof part.text === 'string')
      .map(part => part.text).join('') ?? '';
    if (candidate?.finishReason === 'MAX_TOKENS') throw new GeminiTruncatedError(text);
    if (!text.trim()) throw new Error('Gemini returned no text. Try another model or a smaller input.');
    return text;
  } catch (err) {
    throwIfAborted(options.signal);
    if (controller.signal.aborted) throw new Error('The Gemini request timed out. Please try again.');
    throw err;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

// ---------------------------------------------------------------------------
// JSON parsing helper
// ---------------------------------------------------------------------------

function safeJsonParse<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  // Strip markdown fences
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(s) as T; } catch { /* fallthrough */ }
  // Extract first JSON object or array
  const firstBrace = s.search(/[[{]/);
  const lastBrace = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(s.slice(firstBrace, lastBrace + 1)) as T; } catch { /* fallthrough */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Key validation
// ---------------------------------------------------------------------------

export type KeyValidationStatus = "valid" | "invalid" | "missing" | "checking" | "unavailable";

export async function validateGeminiKey(): Promise<"valid" | "invalid" | "missing"> {
  const key = getGeminiApiKey();
  if (!key.trim()) return "missing";
  try {
    await callGemini("Say OK", { maxOutputTokens: 128 });
    return "valid";
  } catch (err) {
    if (err instanceof GeminiKeyInvalidError) return "invalid";
    if (err instanceof GeminiRateLimitError || err instanceof GeminiTruncatedError) return "valid";
    throw err;
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

async function extractWordsFromText(text: string, signal?: AbortSignal): Promise<string[]> {
  const truncated = text.slice(0, 6000);
  const prompt = `Extract all unique Danish words from the following text. Return only a JSON array of strings, no other text. Focus on actual Danish words, ignore numbers, punctuation, and non-Danish words. Make them lowercase.

Text:
${truncated}

Response format: ["word1", "word2", ...]`;

  try {
    const responseText = await callGemini(prompt, { temperature: 0.1, signal });
    const words = safeJsonParse<unknown>(responseText);
    if (Array.isArray(words)) {
      const cleaned = words
        .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
        .map((w) => w.trim().toLowerCase());
      if (cleaned.length > 0) return Array.from(new Set(cleaned));
    }
  } catch (err) {
    if (err instanceof GeminiKeyMissingError || err instanceof GeminiKeyInvalidError ||
      err instanceof GeminiRateLimitError || err instanceof ProcessingCancelledError) throw err;
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

async function processWordChunk(words: string[], languages: string[], signal?: AbortSignal): Promise<LexisEntryInput[]> {
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

  const responseText = await callGemini(prompt, { temperature: 0.1, maxOutputTokens: 8192, signal });
  const parsed = safeJsonParse<unknown>(responseText);
  if (!Array.isArray(parsed)) throw new Error('Gemini returned an invalid vocabulary list.');

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

export interface FailedChunk {
  /** 0-based index of the chunk within the original sequence. */
  index: number;
  /** Words sent to the AI for this chunk. */
  words: string[];
  /** Error message reported when the chunk failed. */
  error: string;
}

export interface ChunkProgress {
  index: number;
  total: number;
  status: "ok" | "error";
  entries?: LexisEntryInput[];
  error?: string;
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
  /** Chunks that failed and can be retried via retryFailedChunks. */
  failedChunks?: FailedChunk[];
}

export interface ProcessDocumentOptions {
  onProgress?: (progress: { completed: number; total: number }) => void;
  onChunk?: (chunk: ChunkProgress) => void;
  signal?: AbortSignal;
}

export async function processDocument(
  text: string,
  languages: string[],
  existingWords: string[],
  optionsOrOnProgress?:
    | ProcessDocumentOptions
    | ((progress: { completed: number; total: number }) => void),
): Promise<ProcessDocumentResult> {
  const options: ProcessDocumentOptions =
    typeof optionsOrOnProgress === "function"
      ? { onProgress: optionsOrOnProgress }
      : optionsOrOnProgress ?? {};
  const { onProgress, onChunk, signal } = options;
  const existingSet = new Set(existingWords.map((w) => w.toLowerCase()));

  throwIfAborted(signal);
  onProgress?.({ completed: 0, total: 1 });
  const extractedWords = await extractWordsFromText(text, signal);
  throwIfAborted(signal);
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
  const failedChunks: FailedChunk[] = [];
  let firstError: Error | null = null;

  for (let i = 0; i < newWords.length; i += WORDS_PER_CHUNK) {
    throwIfAborted(signal);
    const chunkIndex = Math.floor(i / WORDS_PER_CHUNK);
    const chunk = newWords.slice(i, i + WORDS_PER_CHUNK);
    try {
      const chunkEntries = await processWordChunk(chunk, languages, signal);
      entries.push(...chunkEntries);
      onChunk?.({ index: chunkIndex, total: totalChunks, status: "ok", entries: chunkEntries });
    } catch (err) {
      if (
        err instanceof GeminiKeyMissingError ||
        err instanceof GeminiKeyInvalidError ||
        err instanceof GeminiRateLimitError || err instanceof ProcessingCancelledError
      ) throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      failedChunks.push({ index: chunkIndex, words: chunk, error: errMsg });
      onChunk?.({ index: chunkIndex, total: totalChunks, status: "error", error: errMsg });
      if (!firstError) firstError = err instanceof Error ? err : new Error(errMsg);
    }
    onProgress?.({ completed: 1 + chunkIndex + 1, total: totalSteps });
  }

  return {
    entries,
    totalExtracted: extractedWords.length,
    newWords: newWords.length,
    processed: entries.length,
    truncated: false,
    languages,
    ...(failedChunks.length > 0 ? { failedChunks } : {}),
    ...(firstError && entries.length === 0 ? { error: firstError.message } : {}),
  };
}

/**
 * Re-runs only the chunks that previously failed. Returns new entries plus
 * any chunks that failed again. Honours signal for cancellation.
 */
export async function retryFailedChunks(
  failed: FailedChunk[],
  languages: string[],
  options: ProcessDocumentOptions = {},
): Promise<{ entries: LexisEntryInput[]; failedChunks: FailedChunk[] }> {
  const { onProgress, onChunk, signal } = options;
  const entries: LexisEntryInput[] = [];
  const stillFailed: FailedChunk[] = [];
  const total = failed.length;
  onProgress?.({ completed: 0, total });

  for (let i = 0; i < failed.length; i++) {
    throwIfAborted(signal);
    const chunk = failed[i];
    try {
      const chunkEntries = await processWordChunk(chunk.words, languages, signal);
      entries.push(...chunkEntries);
      onChunk?.({ index: chunk.index, total, status: "ok", entries: chunkEntries });
    } catch (err) {
      if (
        err instanceof GeminiKeyMissingError ||
        err instanceof GeminiKeyInvalidError ||
        err instanceof GeminiRateLimitError || err instanceof ProcessingCancelledError
      ) throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      stillFailed.push({ ...chunk, error: errMsg });
      onChunk?.({ index: chunk.index, total, status: "error", error: errMsg });
    }
    onProgress?.({ completed: i + 1, total });
  }

  return { entries, failedChunks: stillFailed };
}

export async function processDocumentChunked(
  words: string[],
  languages: string[],
  existingWords: string[] = [],
  optionsOrOnProgress?:
    | ProcessDocumentOptions
    | ((progress: { completed: number; total: number }) => void),
): Promise<LexisEntryInput[]> {
  const options: ProcessDocumentOptions =
    typeof optionsOrOnProgress === "function"
      ? { onProgress: optionsOrOnProgress }
      : optionsOrOnProgress ?? {};
  const { onProgress, onChunk, signal } = options;

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
    throwIfAborted(signal);
    const chunkIndex = Math.floor(i / WORDS_PER_CHUNK);
    const chunk = cleaned.slice(i, i + WORDS_PER_CHUNK);
    try {
      const chunkEntries = await processWordChunk(chunk, languages, signal);
      entries.push(...chunkEntries);
      onChunk?.({ index: chunkIndex, total: totalChunks, status: "ok", entries: chunkEntries });
    } catch (err) {
      if (
        err instanceof GeminiKeyMissingError ||
        err instanceof GeminiKeyInvalidError ||
        err instanceof GeminiRateLimitError || err instanceof ProcessingCancelledError
      ) throw err;
      onChunk?.({
        index: chunkIndex,
        total: totalChunks,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    onProgress?.({ completed: chunkIndex + 1, total: totalChunks });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Direct document processing (single-step extraction)
// ---------------------------------------------------------------------------

/** Max characters of document text sent to Gemini in one direct-processing request. */
export const DIRECT_CHUNK_CHARS = 6000;

/** Max characters of document text put into the copy-paste prompt; external AI chats handle long input. */
export const COPY_PROMPT_MAX_CHARS = 60000;

const MAX_KNOWN_WORDS_IN_PROMPT = 5000;

/**
 * Splits a document into chunks of at most `maxChars`, breaking on line
 * boundaries so vocabulary lines ("ord – word") are never cut in half.
 */
export function splitDocumentIntoChunks(text: string, maxChars = DIRECT_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    for (let start = 0; start < Math.max(line.length, 1); start += maxChars) {
      const piece = line.slice(start, start + maxChars);
      if (current && current.length + 1 + piece.length > maxChars) {
        chunks.push(current);
        current = piece;
      } else {
        current = current ? `${current}\n${piece}` : piece;
      }
    }
  }
  chunks.push(current);
  return chunks.filter((chunk) => chunk.trim());
}

function formatKnownWords(words: string[]): string {
  const unique = Array.from(
    new Set(words.map((w) => w.trim().replace(/\s+/g, " ").toLowerCase()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "da"));
  return unique.slice(0, MAX_KNOWN_WORDS_IN_PROMPT).join(", ");
}

/**
 * Builds the vocabulary-extraction prompt. Used both for direct Gemini calls
 * (one chunk at a time) and for the copy-paste prompt shown in Bulk Import.
 * Text longer than `maxChars` is cut; callers warn the user or chunk first.
 */
export function buildDirectProcessingPrompt(
  text: string,
  languages: string[],
  existingWords: string[] = [],
  maxChars = DIRECT_CHUNK_CHARS,
): string {
  const truncated = text.slice(0, maxChars);

  const translationInstruction = languages.length > 0
    ? `\n- "translations": object with keys ${languages.map((c) => `"${c}"`).join(", ")} (${languages.map((c) => LANGUAGE_NAMES[c] ?? c.toUpperCase()).join(", ")} translations of the same meaning; verbs as infinitives, nouns as nouns)`
    : "";

  const translationExample = languages.length > 0
    ? `,"translations":{${languages.map((c) => `"${c}":"..."`).join(",")}}`
    : "";

  const knownWords = formatKnownWords(existingWords);
  const knownWordsInstruction = knownWords
    ? `\n- Do not return any of these words, the learner already has them: ${knownWords}`
    : "";

  return `You are a JSON-only API. You must respond with valid JSON and nothing else.

The document below is typically a teacher's notes from a Danish class (mixed Danish/English: vocabulary from conversation, grammar notes, exercises, homework). Extract the Danish vocabulary a learner should study.

CRITICAL FORMATTING RULES:
- Your response must be a valid JSON array starting with [ and ending with ]
- Use COMPACT JSON with NO whitespace, NO newlines, NO indentation (minified format)
- Do not include any text before or after the JSON array
- Do not use markdown code fences
- Do not add explanations

For each entry, create a JSON object with these fields:
- "danish": the dictionary form in lowercase (capitals only for proper nouns and acronyms). Strip a leading "at " for verbs and "en "/"et " for nouns.
- "english": short English translation in lowercase; strip a leading "to " for verbs. If one Danish word has two meanings, join them with "; " (e.g. "touch; stir").
- "type": one of "noun", "verb", "adjective", "expression", or "word"
- "notes": optional learner context from the document: a short example sentence, or a contrast the teacher drew (e.g. "tabe = lose a game; miste = lose something you had"). Empty string otherwise. Never grammar labels.
- "grammar": object with type-appropriate Danish inflections:
    - noun: { "article": "en" or "et", "singularDefinite": "...", "pluralIndefinite": "...", "pluralDefinite": "..." }. For plural-only nouns (bukser, briller) leave article and singularDefinite empty. Leave a field empty rather than invent a form that does not exist (no plural for uncountables like "slik").
    - verb: { "present": "...", "past": "...", "perfect": "..." }. Perfect uses "er" for verbs of motion or change of state (er gået, er flyttet, er blevet), otherwise "har". Reflexive and particle verbs keep the particle in every form (slapper af, slappede af, har slappet af).
    - adjective: { "neuter": "...", "definite": "...", "plural": "...", "comparative": "...", "superlative": "..." }. Use "mere"/"mest" for long adjectives and participles; leave comparative and superlative empty when they make no sense (jødisk, udsolgt).
    - expression, word: omit "grammar" entirely${translationInstruction}

WHAT TO INCLUDE:
- Single words, fixed expressions, collocations and idioms (holde øje med, have råd til, set i bakspejlet)
- Handle mixed formats: "hus - house", "at spise = to eat", "stor (big)", etc.
- If grammar notes are present in the document (e.g., "huset, huse, husene"), use them in the grammar field
- Reusable sentence patterns, shortened to the pattern (e.g. "Jeg skulle have spurgt ham" -> "jeg skulle have", with the full sentence in "notes")
- **CRITICAL DEDUPLICATION RULE**: inflected forms reduce to ONE entry in the base/dictionary form ("græd" -> græde, "fyringer" -> fyring, "sultne" -> sulten, "spise/spiser/spiste" -> spise). Never create separate entries for different inflections of the same word.
- Correct obvious spelling mistakes in the document (e.g. "fjerdel" -> fjerdedel)

WHAT TO SKIP:
- Class admin: dates, homework instructions ("Hjemmearbejde", "I dag"), page or exercise references (s. 50, opg 11), URLs, book and podcast titles
- Names of people, places, brands, films and shows; numbers written as digits; prices
- Long personal sentences that are only anecdotes (keep at most the useful word or pattern inside them)
- English-only lines

DUPLICATES:
- One entry per Danish spelling: the app treats entries with the same "danish" as duplicates regardless of type. If a spelling is both a noun and a verb, pick the more useful one and mention the other in "notes".${knownWordsInstruction}

Document text:
${truncated}

RESPONSE FORMAT: Return ONLY compact JSON with no whitespace. Start with [ and end with ]. No newlines, no indentation, no spaces except inside string values.

Example response format (compact, single line):
[{"danish":"hus","english":"house","type":"noun","notes":"","grammar":{"article":"et","singularDefinite":"huset","pluralIndefinite":"huse","pluralDefinite":"husene"}${translationExample}},{"danish":"flytte","english":"move","type":"verb","notes":"","grammar":{"present":"flytter","past":"flyttede","perfect":"er flyttet"}${translationExample}},{"danish":"stor","english":"big","type":"adjective","notes":"","grammar":{"neuter":"stort","definite":"store","plural":"store","comparative":"større","superlative":"størst"}${translationExample}},{"danish":"have råd til","english":"afford","type":"expression","notes":"Jeg har ikke råd – I can't afford it"${translationExample}}]`;
}

const DIRECT_SYSTEM_INSTRUCTION =
  "You are a JSON-only API. Return compact JSON with no whitespace (minified format). Never use markdown code fences. Never add explanations or text before/after the JSON. Your entire response must be parseable by JSON.parse().";

function toEntryInputs(items: unknown[], languages: string[]): LexisEntryInput[] {
  return items.flatMap((item) => {
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

interface DirectChunkResult {
  entries: LexisEntryInput[];
  truncated: boolean;
  error?: string;
}

async function processDirectChunk(
  chunk: string,
  languages: string[],
  existingWords: string[],
  signal?: AbortSignal,
): Promise<DirectChunkResult> {
  let truncated = false;
  const responseText = await callGemini(buildDirectProcessingPrompt(chunk, languages, existingWords), {
    signal,
    temperature: 0.2,
    maxOutputTokens: 16384,
    systemInstruction: DIRECT_SYSTEM_INSTRUCTION,
  }).catch((error) => {
    if (!(error instanceof GeminiTruncatedError)) throw error;
    truncated = true;
    return error.text;
  });
  throwIfAborted(signal);

  const trimmed = responseText.trim();
  let parsed = safeJsonParse<unknown>(trimmed);
  if (!Array.isArray(parsed)) {
    // Salvage complete objects from a response cut off mid-array.
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const salvaged = safeJsonParse<unknown>(`${trimmed.slice(start, end + 1)}]`);
      if (Array.isArray(salvaged) && salvaged.length > 0) {
        console.warn(`Direct processing: salvaged ${salvaged.length} entries from a cut-off response`);
        parsed = salvaged;
        truncated = true;
      }
    }
  }

  if (!Array.isArray(parsed)) {
    console.error("Direct processing: could not parse response. Length:", responseText.length);
    console.error("Response preview (first 500 chars):", responseText.slice(0, 500));
    const cutOff = trimmed.startsWith("[") && !trimmed.endsWith("]");
    return {
      entries: [],
      truncated,
      error: cutOff
        ? "The AI response was cut off mid-response, likely because it exceeded the token limit. Try processing a shorter text."
        : "Could not parse AI response as JSON array. The AI may have returned text in an unexpected format. Check the Gemini API response format in your browser console.",
    };
  }

  return { entries: toEntryInputs(parsed, languages), truncated };
}

/**
 * Extracts vocabulary from a document with Gemini. Long documents are split
 * into chunks of DIRECT_CHUNK_CHARS (on line boundaries) and processed in
 * sequence; results are merged, de-duplicated and filtered against
 * `existingWords`.
 */
export async function processDocumentDirect(
  text: string,
  languages: string[],
  existingWords: string[],
  optionsOrOnProgress?:
    | ProcessDocumentOptions
    | ((progress: { completed: number; total: number }) => void),
): Promise<ProcessDocumentResult> {
  const options: ProcessDocumentOptions =
    typeof optionsOrOnProgress === "function"
      ? { onProgress: optionsOrOnProgress }
      : optionsOrOnProgress ?? {};
  const { onProgress, signal } = options;
  const existingSet = new Set(existingWords.map((w) => entryKey({ danish: w, type: "word" })));

  const chunks = splitDocumentIntoChunks(text);
  const total = Math.max(chunks.length, 1);
  throwIfAborted(signal);
  onProgress?.({ completed: 0, total });

  const allEntries: LexisEntryInput[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  let truncated = false;
  let unprocessed = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const result = await processDirectChunk(chunks[i], languages, existingWords, signal);
      truncated ||= result.truncated;
      if (result.error) errors.push(result.error);
      for (const entry of result.entries) {
        const key = entryKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        allEntries.push(entry);
      }
    } catch (err) {
      if (
        err instanceof GeminiKeyMissingError ||
        err instanceof GeminiKeyInvalidError ||
        err instanceof ProcessingCancelledError
      ) {
        throw err;
      }
      if (err instanceof GeminiRateLimitError) {
        // Keep what earlier chunks produced; only surface the error if nothing was extracted.
        if (allEntries.length === 0) throw err;
        unprocessed = chunks.length - i;
        break;
      }
      console.error("Direct processing failed:", err);
      errors.push(err instanceof Error ? err.message : "Unknown error during processing");
    }
    onProgress?.({ completed: i + 1, total });
  }
  if (unprocessed === 0) onProgress?.({ completed: total, total });

  const newEntries = allEntries.filter((entry) => !existingSet.has(entryKey(entry)));
  const base = {
    entries: newEntries,
    totalExtracted: allEntries.length,
    newWords: newEntries.length,
    processed: newEntries.length,
    truncated,
    languages,
  };

  if (allEntries.length === 0 && errors.length > 0) {
    return { ...base, error: errors[0] };
  }

  const messages: string[] = [];
  if (allEntries.length === 0) messages.push("No Danish words found in the document.");
  else if (newEntries.length === 0) messages.push("All extracted words already exist in your lexicon.");
  if (errors.length > 0) {
    messages.push(`${errors.length} of ${chunks.length} parts could not be processed: ${errors[0]}`);
  }
  if (unprocessed > 0) {
    messages.push(`Gemini's rate limit was reached, so ${unprocessed} of ${chunks.length} parts were not processed. Run the rest of the text again later.`);
  }
  if (truncated) {
    messages.push("The AI response was cut off, so some words may be missing. Try processing a shorter text.");
  }
  return messages.length > 0 ? { ...base, message: messages.join(" ") } : base;
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

// ---------------------------------------------------------------------------
// Verb-form helper (Sparkles button inside GrammarFields for type="verb")
// ---------------------------------------------------------------------------

export interface VerbForms {
  present: string;
  past: string;
  perfect: string;
}

/**
 * Pure parser for the AI verb-forms response. Exported for unit tests.
 * Accepts raw model text (possibly wrapped in markdown fences or with
 * surrounding prose) and returns the three Danish verb forms, or null
 * when the response cannot be interpreted.
 */
export function parseVerbFormsResponse(text: string): VerbForms | null {
  const parsed = safeJsonParse<Record<string, unknown>>(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const present = typeof parsed.present === "string" ? parsed.present.trim() : "";
  const past = typeof parsed.past === "string" ? parsed.past.trim() : "";
  const perfect = typeof parsed.perfect === "string" ? parsed.perfect.trim() : "";
  if (!present && !past && !perfect) return null;
  return { present, past, perfect };
}

export async function autocompleteVerbForms(danish: string): Promise<VerbForms> {
  const trimmed = danish.trim();
  if (!trimmed) throw new Error("Empty verb");

  const prompt = `You are a Danish grammar assistant.
The user provided this Danish verb infinitive (without "at"): "${trimmed}"

Return a single JSON object with exactly these fields:
- "present": the present tense (nutid), e.g. "går"
- "past": the past tense (datid), e.g. "gik"
- "perfect": the perfect tense (perfektum) WITH the auxiliary, e.g. "har gået" or "er gået"

Return ONLY the JSON object, no markdown, no explanation.`;

  const responseText = await callGemini(prompt, {
    temperature: 0.1,
    systemInstruction: "Return only valid JSON. No prose, no markdown fences.",
  });

  const forms = parseVerbFormsResponse(responseText);
  if (!forms) {
    console.error("Could not parse verb-forms response. Length:", responseText.length);
    console.error("Raw (first 500):", responseText.slice(0, 500));
    throw new Error("Could not parse AI response");
  }
  return forms;
}
