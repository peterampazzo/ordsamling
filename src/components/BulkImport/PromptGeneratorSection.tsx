import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Upload, FileText, Copy, Check, AlertCircle, X, ChevronDown, ChevronUp, ExternalLink, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PromptGeneratorSectionProps, BYOKState } from './types';
import { t } from '@/i18n';
import {
  buildDirectProcessingPrompt,
  processDocumentDirect,
  GeminiKeyMissingError,
  GeminiKeyInvalidError,
  GeminiRateLimitError,
  ProcessingCancelledError,
} from '@/lib/gemini';
import type { LexisEntryInput } from '@/lib/lexicon';
import { ProcessingIndicator } from './ProcessingIndicator';

// ---------------------------------------------------------------------------
// JSON parsing helpers (mirrors parseJsonObjects from BulkImport.tsx)
// ---------------------------------------------------------------------------

import { ENTRY_TYPES, normalizeEntryType } from '@/lib/lexicon';

const GRAMMAR_KEYS = [
  'article', 'singularDefinite', 'pluralIndefinite', 'pluralDefinite',
  'present', 'past', 'perfect',
  'neuter', 'definite', 'plural', 'comparative', 'superlative',
] as const;

function normalizeJsonValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function parseJsonObjects(items: unknown[]): LexisEntryInput[] {
  const entries: LexisEntryInput[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;

    const danish = normalizeJsonValue(obj.danish);
    const english = normalizeJsonValue(obj.english);
    if (!danish && !english) continue;

    const rawType = normalizeJsonValue(obj.type).toLowerCase();
    const type = rawType && ENTRY_TYPES.includes(normalizeEntryType(rawType) as any)
      ? normalizeEntryType(rawType)
      : 'word';

    const translationFields: Record<string, string> = {};
    if (obj.translations && typeof obj.translations === 'object' && !Array.isArray(obj.translations)) {
      const t2 = obj.translations as Record<string, unknown>;
      for (const code of Object.keys(t2)) {
        if (/^[a-z]{2,3}$/i.test(code)) {
          const v = normalizeJsonValue(t2[code]);
          if (v) translationFields[code.toLowerCase()] = v;
        }
      }
    }

    const grammarFields: Record<string, string> = {};
    if (obj.grammar && typeof obj.grammar === 'object' && !Array.isArray(obj.grammar)) {
      const grammarRaw = obj.grammar as Record<string, unknown>;
      for (const key of GRAMMAR_KEYS) {
        if (key in grammarRaw) {
          const v = normalizeJsonValue(grammarRaw[key]);
          if (v) grammarFields[key] = v;
        }
      }
    }

    entries.push({
      danish,
      english,
      notes: normalizeJsonValue(obj.notes),
      type,
      ...(Object.keys(translationFields).length > 0 ? { translations: translationFields } : {}),
      ...(Object.keys(grammarFields).length > 0 ? { grammar: grammarFields } : {}),
    });
  }

  return entries;
}

/**
 * Parses a JSON string (array or object with entries key) into LexisEntryInput[].
 * Returns null if the string is not valid JSON or doesn't contain entries.
 */
function parseAIResponse(text: string): LexisEntryInput[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Strip markdown fences if present
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim();

  try {
    const json = JSON.parse(stripped);
    if (Array.isArray(json)) {
      return parseJsonObjects(json);
    }
    if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>;
      if (Array.isArray(obj.entries)) {
        return parseJsonObjects(obj.entries as unknown[]);
      }
      // Single object
      return parseJsonObjects([json]);
    }
  } catch {
    // Try to extract a JSON array or object from within the text
    const firstBrace = stripped.search(/[\[{]/);
    const lastBrace = Math.max(stripped.lastIndexOf(']'), stripped.lastIndexOf('}'));
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const slice = stripped.slice(firstBrace, lastBrace + 1);
        const json2 = JSON.parse(slice);
        if (Array.isArray(json2)) return parseJsonObjects(json2);
        if (json2 && typeof json2 === 'object') {
          const obj2 = json2 as Record<string, unknown>;
          if (Array.isArray(obj2.entries)) return parseJsonObjects(obj2.entries as unknown[]);
          return parseJsonObjects([json2]);
        }
      } catch {
        // fall through
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Sample JSON example for the "Show Example" section
// ---------------------------------------------------------------------------

const SAMPLE_JSON_RESPONSE = `[
  {
    "danish": "hus",
    "english": "house",
    "type": "noun",
    "notes": "Et almindeligt dansk substantiv",
    "grammar": {
      "article": "et",
      "singularDefinite": "huset",
      "pluralIndefinite": "huse",
      "pluralDefinite": "husene"
    }
  },
  {
    "danish": "spise",
    "english": "to eat",
    "type": "verb",
    "grammar": {
      "present": "spiser",
      "past": "spiste",
      "perfect": "har spist"
    }
  },
  {
    "danish": "stor",
    "english": "big",
    "type": "adjective",
    "grammar": {
      "neuter": "stort",
      "definite": "store",
      "comparative": "større",
      "superlative": "størst"
    }
  }
]`;

// ---------------------------------------------------------------------------
// Allowed file types
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.docx'];
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// ---------------------------------------------------------------------------
// File text extraction
// ---------------------------------------------------------------------------

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.docx')) {
    // Dynamic import to avoid loading mammoth until needed
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  // .txt and .md — plain text
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? '');
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'utf-8');
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PromptGeneratorSection({
  hasGeminiKey,
  extraLanguages,
  existingWords,
  onEntriesParsed,
  onError,
}: PromptGeneratorSectionProps) {
  // State management for BYOK workflow
  const [state, setState] = useState<BYOKState>({
    inputMethod: null,
    documentText: '',
    generatedPrompt: '',
    showPrompt: false,
    aiResponse: '',
    showResponseArea: false,
  });

  // Copy button feedback
  const [copied, setCopied] = useState(false);

  // File upload state
  const [dragActive, setDragActive] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Parse response state
  const [parseError, setParseError] = useState<string | null>(null);

  // Direct processing state
  const [isProcessingDirect, setIsProcessingDirect] = useState(false);
  const [directProgress, setDirectProgress] = useState<{ completed: number; total: number } | null>(null);
  const [directError, setDirectError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const responseAreaRef = useRef<HTMLDivElement | null>(null);

  // Show/hide example JSON
  const [showExample, setShowExample] = useState(false);

  // Generate prompt whenever documentText changes
  useEffect(() => {
    if (state.documentText.trim()) {
      const prompt = buildDirectProcessingPrompt(state.documentText, extraLanguages);
      setState((prev) => ({
        ...prev,
        generatedPrompt: prompt,
        showPrompt: true,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        generatedPrompt: '',
        showPrompt: false,
      }));
    }
  }, [state.documentText, extraLanguages]);

  // ------------------------------------------------------------------
  // File handling helpers
  // ------------------------------------------------------------------

  const processFile = useCallback(async (file: File) => {
    setFileError(null);

    if (!isAllowedFile(file)) {
      setFileError(
        `Unsupported file type. Please upload a .txt, .md, or .docx file.`
      );
      return;
    }

    setIsProcessingFile(true);
    setUploadedFileName(file.name);

    try {
      const text = await extractTextFromFile(file);
      if (!text.trim()) {
        setFileError('The file appears to be empty.');
        setUploadedFileName(null);
        return;
      }
      setState((prev) => ({
        ...prev,
        inputMethod: 'upload',
        documentText: text,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read file';
      setFileError(msg);
      setUploadedFileName(null);
    } finally {
      setIsProcessingFile(false);
    }
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [processFile]
  );

  // ------------------------------------------------------------------
  // Drag-and-drop handlers
  // ------------------------------------------------------------------

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // ------------------------------------------------------------------
  // Copy prompt
  // ------------------------------------------------------------------

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(state.generatedPrompt);
      setCopied(true);
      setState((prev) => ({ ...prev, showResponseArea: true }));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError('Failed to copy to clipboard');
    }
  };

  // ------------------------------------------------------------------
  // Clear uploaded file
  // ------------------------------------------------------------------

  const handleClearFile = () => {
    setUploadedFileName(null);
    setFileError(null);
    setState((prev) => ({
      ...prev,
      documentText: '',
      inputMethod: null,
    }));
  };

  // ------------------------------------------------------------------
  // Scroll to response area
  // ------------------------------------------------------------------

  const handleScrollToResponseArea = useCallback(() => {
    setState((prev) => ({ ...prev, showResponseArea: true }));
    setTimeout(() => {
      responseAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  // ------------------------------------------------------------------
  // Parse AI response
  // ------------------------------------------------------------------

  const handleParseResponse = useCallback(() => {
    setParseError(null);

    const text = state.aiResponse.trim();
    if (!text) {
      setParseError('Please paste the AI JSON response before parsing.');
      return;
    }

    const entries = parseAIResponse(text);

    if (entries === null) {
      setParseError(
        'Could not parse the response as JSON. Make sure you pasted the full JSON array from the AI.'
      );
      return;
    }

    if (entries.length === 0) {
      setParseError(
        'The JSON was valid but contained no recognisable entries. Check that each entry has a "danish" or "english" field.'
      );
      return;
    }

    onEntriesParsed(entries);
  }, [state.aiResponse, onEntriesParsed]);

  // ------------------------------------------------------------------
  // Direct processing with Gemini
  // ------------------------------------------------------------------

  const handleProcessDirect = useCallback(async () => {
    if (!state.documentText.trim()) return;

    setDirectError(null);
    setIsProcessingDirect(true);
    setDirectProgress({ completed: 0, total: 1 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await processDocumentDirect(
        state.documentText,
        extraLanguages,
        existingWords,
        {
          onProgress: (p) => setDirectProgress(p),
          signal: controller.signal,
        }
      );

      if (result.error) {
        setDirectError(result.error);
        return;
      }

      if (!result.entries || result.entries.length === 0) {
        setDirectError('No entries were extracted from the document. Try the manual workflow instead.');
        return;
      }

      onEntriesParsed(result.entries);
    } catch (err) {
      if (err instanceof ProcessingCancelledError) {
        setDirectProgress(null);
        return;
      }
      if (err instanceof GeminiRateLimitError) {
        setDirectError(
          err.isDailyQuota
            ? 'Gemini free-tier daily quota exhausted. Try again tomorrow or add billing to your Google AI account.'
            : err.retryAfterSeconds
            ? `Gemini rate limit hit. Retry in ${err.retryAfterSeconds} seconds.`
            : 'Gemini rate limit hit. Please wait a minute and try again.'
        );
      } else if (err instanceof GeminiKeyMissingError || err instanceof GeminiKeyInvalidError) {
        setDirectError(err.message);
      } else {
        setDirectError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    } finally {
      setIsProcessingDirect(false);
      abortRef.current = null;
    }
  }, [state.documentText, extraLanguages, existingWords, onEntriesParsed]);

  const handleCancelDirect = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t('bulkImport.byokTitle') || 'Generate AI Prompt'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('bulkImport.byokDescription') ||
              'Use any AI chat (ChatGPT, Claude, etc.) to process your vocabulary list. No API key required.'}
          </p>
        </div>
      </div>

      {/* Input Method Selection */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Upload Document Card */}
        <Card
          className={`cursor-pointer transition-all hover:border-primary hover:shadow-md ${
            state.inputMethod === 'upload'
              ? 'border-primary ring-2 ring-primary/20'
              : ''
          }`}
          onClick={() => {
            setState((prev) => ({ ...prev, inputMethod: 'upload' }));
            fileInputRef.current?.click();
          }}
        >
          <CardHeader>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">
                {t('bulkImport.uploadCard') || 'Upload Document'}
              </CardTitle>
            </div>
            <CardDescription>Drop .txt, .md, or .docx file</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.docx"
              className="hidden"
              onChange={handleFileInputChange}
              aria-label="Upload document file"
            />

            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop zone for document upload"
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`flex min-h-[96px] items-center justify-center rounded-md border-2 border-dashed transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/25 bg-muted/50 hover:border-primary/50'
              }`}
            >
              {isProcessingFile ? (
                <div className="text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reading file…
                  </p>
                </div>
              ) : uploadedFileName ? (
                <div className="flex items-center gap-2 px-3 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate font-medium">{uploadedFileName}</span>
                  <button
                    type="button"
                    aria-label="Remove uploaded file"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearFile();
                    }}
                    className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {dragActive ? 'Drop file here' : 'Click or drag file here'}
                  </p>
                </div>
              )}
            </div>

            {/* Inline file error */}
            {fileError && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Paste Text Card */}
        <Card
          className={`cursor-pointer transition-all hover:border-primary hover:shadow-md ${
            state.inputMethod === 'paste'
              ? 'border-primary ring-2 ring-primary/20'
              : ''
          }`}
          onClick={() => setState((prev) => ({ ...prev, inputMethod: 'paste' }))}
        >
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">
                {t('bulkImport.pasteCard') || 'Paste Text'}
              </CardTitle>
            </div>
            <CardDescription>
              Paste your vocabulary list or document text
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Paste your text here..."
              className="min-h-[96px] resize-none"
              value={state.inputMethod === 'paste' ? state.documentText : ''}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  inputMethod: 'paste',
                  documentText: e.target.value,
                }))
              }
              onClick={(e) => e.stopPropagation()}
              aria-label="Paste vocabulary text"
            />
          </CardContent>
        </Card>
      </div>

      {/* Prompt Display Area (Progressive Disclosure) */}
      {state.showPrompt && (
        <Card className="animate-in fade-in-50 slide-in-from-top-2 duration-300">
          <CardHeader>
            <CardTitle className="text-lg">
              {t('bulkImport.promptGenerated') || 'Generated Prompt'}
            </CardTitle>
            <CardDescription>
              Copy this prompt and paste it into your preferred AI chat
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              readOnly
              value={state.generatedPrompt}
              className="min-h-[200px] font-mono text-sm"
              aria-label="Generated AI prompt"
            />
            <Button
              onClick={handleCopyPrompt}
              className="w-full sm:w-auto"
              variant={copied ? 'secondary' : 'default'}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  {t('bulkImport.copyPrompt') || 'Copy to Clipboard'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Instructions Panel (Progressive Disclosure) — visible as soon as prompt is generated */}
      {state.showPrompt && (
        <Card className="border-primary/50 bg-primary/5 animate-in fade-in-50 slide-in-from-top-2 duration-300">
          <CardHeader>
            <CardTitle className="text-lg">📋 How to use this prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stepper steps */}
            <ol className="space-y-4">
              {/* Step 1 */}
              <li className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm font-medium">Copy the prompt above</p>
                  <p className="text-xs text-muted-foreground">Click "Copy to Clipboard" to copy the generated prompt</p>
                </div>
              </li>

              {/* Step 2 */}
              <li className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  2
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm font-medium">Paste it into your preferred AI chat</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <a
                      href="https://chat.openai.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                      aria-label="Open ChatGPT in new tab"
                    >
                      ChatGPT
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                    <a
                      href="https://claude.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                      aria-label="Open Claude in new tab"
                    >
                      Claude
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                    <a
                      href="https://gemini.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                      aria-label="Open Gemini in new tab"
                    >
                      Gemini
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  </div>
                </div>
              </li>

              {/* Step 3 */}
              <li className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm font-medium">Copy the JSON response from the AI</p>
                  <p className="text-xs text-muted-foreground">The AI will return a JSON array — copy the entire response</p>
                </div>
              </li>

              {/* Step 4 */}
              <li className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  4
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm font-medium">Paste the response below</p>
                  <button
                    type="button"
                    onClick={handleScrollToResponseArea}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    aria-label="Scroll to response area"
                  >
                    <ArrowDown className="h-3 w-3" />
                    Go to response area
                  </button>
                </div>
              </li>
            </ol>

            {/* Show Example collapsible */}
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={() => setShowExample((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={showExample}
                aria-controls="example-json-panel"
              >
                <span>Show Example Response</span>
                {showExample ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {showExample && (
                <div id="example-json-panel" className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    The AI should return a JSON array like this. Each entry has a <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">danish</code> and <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">english</code> field, plus optional <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">type</code>, <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">notes</code>, and <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">grammar</code>.
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono leading-relaxed">
                    {SAMPLE_JSON_RESPONSE}
                  </pre>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show Response Area button — visible even before copying the prompt */}
      {!state.showResponseArea && (
        <div className="flex justify-center animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScrollToResponseArea}
            className="gap-2"
          >
            <ArrowDown className="h-4 w-4" />
            Show Response Area
          </Button>
        </div>
      )}

      {/* Response Area (Progressive Disclosure) */}
      {state.showResponseArea && (
        <Card ref={responseAreaRef} id="response-area">
          <CardHeader>
            <CardTitle className="text-lg">Paste AI Response Here</CardTitle>
            <CardDescription>
              Paste the JSON response from your AI chat
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Paste JSON response here..."
              value={state.aiResponse}
              onChange={(e) => {
                setState((prev) => ({ ...prev, aiResponse: e.target.value }));
                setParseError(null);
              }}
              className="min-h-[200px] font-mono text-sm"
              aria-label="Paste AI JSON response"
            />
            {parseError && (
              <div className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
            <Button
              onClick={handleParseResponse}
              className="w-full sm:w-auto"
              disabled={!state.aiResponse.trim()}
            >
              Parse Response
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Optional Direct Processing Button */}
      {hasGeminiKey && state.documentText && (
        <Card className="border-primary/50">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">
                  Or process directly with Gemini
                </span>
              </div>
              <Button
                variant="default"
                onClick={handleProcessDirect}
                disabled={isProcessingDirect}
              >
                {isProcessingDirect ? 'Processing…' : 'Process Now'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Uses your Gemini API key from Settings</p>

            {/* Processing indicator */}
            {isProcessingDirect && directProgress && (
              <ProcessingIndicator
                progress={directProgress}
                onCancel={handleCancelDirect}
              />
            )}

            {/* Direct processing error */}
            {directError && (
              <div className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{directError}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
