import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, XCircle, AlertCircle, Loader2, FileText, RefreshCw, Settings, FileUp, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageFooter } from "@/components/layout";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useGoogleSheets } from "@/hooks/useGoogleSheets";
import { useLexicon } from "@/hooks/useLexicon";
import { ENTRY_TYPES, entryTypeLabel, normalizeEntryType, type EntryType } from "@/lib/lexicon";
import type { LexisEntryInput } from "@/lib/lexicon";
import { getExtraLanguages, getLanguageLabel, getGeminiApiKey } from "@/lib/settings";
import { processDocument, GeminiKeyMissingError, GeminiKeyInvalidError, GeminiRateLimitError } from "@/lib/gemini";
import { t } from "@/i18n";

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function detectDelimiter(text: string): "tab" | "comma" {
  const firstLine = text.split("\n")[0] || "";
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount >= commaCount ? "tab" : "comma";
}

function splitLine(line: string, delimiter: "tab" | "comma"): string[] {
  if (delimiter === "tab") {
    return line.split("\t").map((f) => f.trim());
  }
  return splitCsvLine(line);
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

const KNOWN_COLUMNS = [
  "danish", "english", "type", "notes",
  "article", "singularDefinite", "pluralIndefinite", "pluralDefinite",
  "present", "past", "perfect",
  "neuter", "definite", "plural", "comparative", "superlative",
] as const;

type KnownColumn = (typeof KNOWN_COLUMNS)[number];

/** Returns either a known column key, a `translations.<code>` key, or null. */
function normalizeHeader(raw: string): KnownColumn | `translations.${string}` | null {
  const original = raw.trim();
  const s = original.toLowerCase().replace(/[\s_-]/g, "");
  const map: Record<string, KnownColumn> = {
    danish: "danish", dansk: "danish", da: "danish",
    english: "english", engelsk: "english", en: "english",
    type: "type", type_: "type", ordklasse: "type",
    notes: "notes", noter: "notes", note: "notes", comment: "notes", comments: "notes",
    article: "article", artikel: "article",
    singulardefinite: "singularDefinite", bestemtental: "singularDefinite",
    pluralindefinite: "pluralIndefinite", ubestemtflertal: "pluralIndefinite",
    pluraldefinite: "pluralDefinite", bestemtflertal: "pluralDefinite",
    present: "present", nutid: "present",
    past: "past", datid: "past",
    perfect: "perfect", perfektum: "perfect",
    neuter: "neuter", tform: "neuter",
    definite: "definite", bestemtform: "definite",
    plural: "plural", flertal: "plural",
    comparative: "comparative", komparativ: "comparative",
    superlative: "superlative", superlativ: "superlative",
  };
  if (map[s]) return map[s];

  // translations.<code> or translation.<code>
  const dotMatch = original.toLowerCase().match(/^translations?\.([a-z]{2,3})$/);
  if (dotMatch) return `translations.${dotMatch[1]}`;
  // Bare ISO 2-3 letter code, but skip the ones we already use as known cols
  // Also skip "id" which is a UUID field, not a language code
  if (/^[a-z]{2,3}$/.test(s) && !["da", "en", "id"].includes(s)) {
    return `translations.${s}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

export interface ParsedRow {
  rowIndex: number;
  raw: string[];
  entry: LexisEntryInput | null;
  errors: string[];
  warnings: string[];
}

function normalizeJsonValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function parseJsonObjects(items: unknown[]): { rows: ParsedRow[]; headers: string[] } {
  const rows: ParsedRow[] = [];
  const headerSet = new Set<string>();
  const grammarKeys = [
    "article", "singularDefinite", "pluralIndefinite", "pluralDefinite",
    "present", "past", "perfect",
    "neuter", "definite", "plural", "comparative", "superlative",
  ] as const;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const rawObject = item as Record<string, unknown>;
    const errors: string[] = [];
    const warnings: string[] = [];
    const fields: Partial<Record<KnownColumn, string>> = {};
    const grammarFields: Record<string, string> = {};
    const translationFields: Record<string, string> = {};

    for (const key of Object.keys(rawObject)) {
      // Native nested translations object
      if (key === "translations" && rawObject[key] && typeof rawObject[key] === "object" && !Array.isArray(rawObject[key])) {
        const t2 = rawObject[key] as Record<string, unknown>;
        for (const code of Object.keys(t2)) {
          if (/^[a-z]{2,3}$/i.test(code)) {
            const v = normalizeJsonValue(t2[code]);
            if (v) {
              translationFields[code.toLowerCase()] = v;
              headerSet.add(`translations.${code.toLowerCase()}`);
            }
          }
        }
        continue;
      }

      const normalizedKey = normalizeHeader(key);
      if (!normalizedKey) continue;

      if (typeof normalizedKey === "string" && normalizedKey.startsWith("translations.")) {
        const code = normalizedKey.slice("translations.".length);
        const v = normalizeJsonValue(rawObject[key]);
        if (v) translationFields[code] = v;
        headerSet.add(normalizedKey);
        continue;
      }

      fields[normalizedKey as KnownColumn] = normalizeJsonValue(rawObject[key]);
      headerSet.add(normalizedKey);
    }

    if (rawObject.grammar && typeof rawObject.grammar === "object") {
      const grammarRaw = rawObject.grammar as Record<string, unknown>;
      for (const grammarKey of grammarKeys) {
        if (grammarKey in grammarRaw) {
          grammarFields[grammarKey] = normalizeJsonValue(grammarRaw[grammarKey]);
          headerSet.add(grammarKey);
        }
      }
    }

    const danish = fields.danish ?? "";
    const english = fields.english ?? "";

    if (!danish && !english) {
      errors.push(t("bulkImport.rowValidationError"));
    }

    const rawType = fields.type ?? "";
    const type: EntryType = rawType
      ? normalizeEntryType(rawType.toLowerCase())
      : "word";

    if (rawType && !ENTRY_TYPES.includes(type)) {
      warnings.push(t("bulkImport.unknownType", { type: rawType }));
    }

    const entry: LexisEntryInput = {
      danish,
      english,
      notes: fields.notes ?? "",
      type,
      ...(Object.keys(translationFields).length > 0 ? { translations: translationFields } : {}),
      ...(Object.keys(grammarFields).length > 0 ? { grammar: grammarFields } : {}),
    };

    rows.push({ rowIndex: i + 1, raw: [], entry: errors.length === 0 ? entry : null, errors, warnings });
  }

  return { rows, headers: Array.from(headerSet) };
}

function parseInput(text: string): { rows: ParsedRow[]; headers: string[] } {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], headers: [] };

  if (trimmed[0] === "[" || trimmed[0] === "{") {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) {
        return parseJsonObjects(json);
      }
      if (json && typeof json === "object") {
        const obj = json as Record<string, unknown>;
        if (Array.isArray(obj.entries)) {
          return parseJsonObjects(obj.entries as unknown[]);
        }
        return parseJsonObjects([json]);
      }
    } catch {
      // fall back to CSV parsing
    }
  }

  const lines = trimmed
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() !== "");
  const isJsonl = lines.length > 0 && lines.every((line) => {
    const s = line.trim();
    return s.startsWith("{") && s.endsWith("}");
  });

  if (isJsonl) {
    try {
      const items = lines.map((line) => JSON.parse(line));
      return parseJsonObjects(items);
    } catch {
      // fall back to CSV parsing
    }
  }

  return parseRows(text);
}

function parseRows(text: string): { rows: ParsedRow[]; headers: string[] } {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) return { rows: [], headers: [] };

  const delimiter = detectDelimiter(text);
  const headerRaw = splitLine(lines[0], delimiter);
  const headers = headerRaw.map((h) => h.replace(/^(["'])(.*)\1$/g, "$2").trim());

  type ColKey = KnownColumn | `translations.${string}`;
  const columnMap: (ColKey | null)[] = headers.map(normalizeHeader);

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = splitLine(lines[i], delimiter);
    const errors: string[] = [];
    const warnings: string[] = [];

    const fields: Partial<Record<KnownColumn, string>> = {};
    const translationFields: Record<string, string> = {};
    for (let c = 0; c < columnMap.length; c++) {
      const col = columnMap[c];
      if (!col) continue;
      const value = (raw[c] ?? "").trim();
      if (typeof col === "string" && col.startsWith("translations.")) {
        if (value) translationFields[col.slice("translations.".length)] = value;
      } else {
        fields[col as KnownColumn] = value;
      }
    }

    const danish = fields.danish ?? "";
    const english = fields.english ?? "";

    if (!danish && !english) {
      errors.push(t("bulkImport.rowValidationError"));
    }

    const rawType = fields.type ?? "";
    const type: EntryType = rawType
      ? normalizeEntryType(rawType.toLowerCase())
      : "word";

    if (rawType && !ENTRY_TYPES.includes(type)) {
      warnings.push(t("bulkImport.unknownType", { type: rawType }));
    }

    const grammarFields: Record<string, string> = {};
    const grammarKeys = [
      "article", "singularDefinite", "pluralIndefinite", "pluralDefinite",
      "present", "past", "perfect",
      "neuter", "definite", "plural", "comparative", "superlative",
    ] as const;
    for (const key of grammarKeys) {
      const v = fields[key as KnownColumn];
      if (v) grammarFields[key] = v;
    }

    const entry: LexisEntryInput = {
      danish,
      english,
      notes: fields.notes ?? "",
      type,
      ...(Object.keys(translationFields).length > 0 ? { translations: translationFields } : {}),
      ...(Object.keys(grammarFields).length > 0 ? { grammar: grammarFields } : {}),
    };

    rows.push({ rowIndex: i, raw, entry: errors.length === 0 ? entry : null, errors, warnings });
  }

  return { rows, headers };
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

type RowStatus = "valid" | "warning" | "error" | "imported" | "failed" | "updated";

function statusBadge(status: RowStatus) {
  switch (status) {
    case "valid":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("common.ok")}
        </span>
      );
    case "warning":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" /> {t("common.warning")}
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" /> {t("common.error")}
        </span>
      );
    case "imported":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("common.imported")}
        </span>
      );
    case "updated":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 font-medium">
          <RefreshCw className="h-3.5 w-3.5" /> {t("bulkImport.updated")}
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
          <XCircle className="h-3.5 w-3.5" /> {t("common.failed")}
        </span>
      );
  }
}

const EXAMPLE_INPUT = `danish,english,type,notes
hus,house,noun,
gå,to go,verb,
stor,big,adjective,
god morgen,good morning,expression,Hilsen om morgenen`;

const EXAMPLE_JSON = `[
  {
    "danish": "hus",
    "english": "house",
    "type": "noun",
    "notes": "En almindelig bolig",
    "translations": { "fr": "maison", "de": "Haus" },
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
      "plural": "store",
      "comparative": "større",
      "superlative": "størst"
    }
  },
  {
    "danish": "godmorgen",
    "english": "good morning",
    "type": "expression",
    "notes": "Hilsen om morgenen"
  }
]`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ImportStatus = "idle" | "parsed" | "importing" | "done";

interface RowResult {
  rowIndex: number;
  status: "imported" | "failed" | "updated";
  error?: string;
  retryCount?: number;
}

interface ImportSettings {
  maxRetries: number;
  retryDelay: number;
  updateDuplicates: boolean;
}

interface ProcessedDocument {
  entries: LexisEntryInput[];
  totalExtracted: number;
  newWords: number;
  processed: number;
  message?: string;
}

export default function BulkImport() {
  const navigate = useNavigate();
  const { addEntry, updateEntry, allEntries } = useLexicon();
  const { syncState, connect, disconnect } = useGoogleSheets();

  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; headers: string[] } | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [results, setResults] = useState<RowResult[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [importSettings, setImportSettings] = useState<ImportSettings>({
    maxRetries: 3,
    retryDelay: 1000,
    updateDuplicates: true,
  });
  const [showSettings, setShowSettings] = useState(false);

  // Document processing state
  const [isProcessingDocument, setIsProcessingDocument] = useState(false);
  const [processedDocument, setProcessedDocument] = useState<ProcessedDocument | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentProgress, setDocumentProgress] = useState<{ completed: number; total: number } | null>(null);

  // Enabled extra languages + Gemini key presence (re-read on settings-changed event)
  const [extraLangs, setExtraLangs] = useState<string[]>(() => getExtraLanguages());
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(() => !!getGeminiApiKey());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const refresh = () => {
      setExtraLangs(getExtraLanguages());
      setHasGeminiKey(!!getGeminiApiKey());
    };
    window.addEventListener("ordsamling:settings-changed", refresh);
    return () => window.removeEventListener("ordsamling:settings-changed", refresh);
  }, []);

  const handleProcessDocument = useCallback(async (file: File) => {
    setIsProcessingDocument(true);
    setProcessedDocument(null);
    setDocumentError(null);
    setDocumentProgress(null);

    try {
      const name = file.name.toLowerCase();
      let text: string;

      if (name.endsWith(".docx")) {
        try {
          const mammoth = await import("mammoth/mammoth.browser");
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value ?? "";
        } catch (err) {
          console.error("docx parse failed", err);
          alert(t("bulkImport.documentReadError"));
          return;
        }
      } else if (name.endsWith(".doc")) {
        alert(t("bulkImport.documentUnsupported"));
        return;
      } else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
        text = await file.text();
      } else {
        alert(t("bulkImport.documentUnsupported"));
        return;
      }

      if (!text.trim()) {
        alert(t("bulkImport.documentEmpty"));
        return;
      }

      const geminiKey = getGeminiApiKey();
      if (!geminiKey) {
        alert("Add a Gemini API key in Settings to use document processing.");
        return;
      }

      const extraLangs = getExtraLanguages();
      const result = await processDocument(
        text,
        extraLangs,
        allEntries.map((e) => e.danish),
        (progress) => setDocumentProgress(progress),
      );
      setProcessedDocument(result);

      // Feed processed entries directly into the preview (preserves translations/grammar)
      if (result.entries && result.entries.length > 0) {
        const rows: ParsedRow[] = result.entries.map((entry, i) => ({
          rowIndex: i + 1,
          raw: [],
          entry,
          errors: [],
          warnings: [],
        }));
        const headers = ["danish", "english", "type", "notes"];
        if (extraLangs.length > 0) {
          headers.push(...extraLangs.map((c) => `translations.${c}`));
        }
        setRawText(JSON.stringify(result.entries, null, 2));
        setParsed({ rows, headers });
        setImportStatus("parsed");
        setResults([]);
        setSelectedRows(new Set(rows.map((row) => row.rowIndex)));
      } else if (result.newWords > 0 && result.processed === 0) {
        setDocumentError(`${result.newWords} new words were found but could not be processed. Check your Gemini API key in Settings and try again.`);
      }
    } catch (error) {
      console.error("Document processing failed:", error);
      if (error instanceof GeminiRateLimitError) {
        const msg = error.isDailyQuota
          ? "Gemini free-tier daily quota exhausted. You can retry tomorrow (resets at midnight Pacific time), or add billing to your Google AI account to remove the limit."
          : error.retryAfterSeconds
          ? `Gemini rate limit hit. Retry in ${error.retryAfterSeconds} seconds.`
          : "Gemini rate limit hit. Please wait a minute and try again.";
        setDocumentError(msg);
      } else if (error instanceof GeminiKeyMissingError || error instanceof GeminiKeyInvalidError) {
        setDocumentError(error.message);
      } else {
        setDocumentError(error instanceof Error ? error.message : t("bulkImport.unknownError"));
      }
    } finally {
      setIsProcessingDocument(false);
    }
  }, [allEntries]);

  const handleParse = useCallback(async () => {
    // Yield to the browser so the button click registers before heavy parsing
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = parseInput(rawText);
    setParsed(result);
    setImportStatus("parsed");
    setResults([]);
    const validRowIndices = result.rows
      .filter((r) => r.entry !== null)
      .map((r) => r.rowIndex);
    setSelectedRows(new Set(validRowIndices));
  }, [rawText]);

  const validRows = parsed?.rows.filter((r) => r.entry !== null) ?? [];
  const errorRows = parsed?.rows.filter((r) => r.entry === null) ?? [];

  const selectedValidRows = validRows.filter((row) => selectedRows.has(row.rowIndex));
  const unselectedValidRows = validRows.filter((row) => !selectedRows.has(row.rowIndex));

  const existingKeys = new Set(
    allEntries.map((e) => e.danish.toLowerCase()),
  );

  const existingEntriesMap = new Map(
    allEntries.map((e) => [e.danish.toLowerCase(), e]),
  );

  function isDuplicate(row: ParsedRow): boolean {
    if (!row.entry) return false;
    const key = row.entry.danish.toLowerCase();
    return existingKeys.has(key);
  }

  function getExistingEntry(row: ParsedRow) {
    if (!row.entry) return null;
    const key = row.entry.danish.toLowerCase();
    return existingEntriesMap.get(key) || null;
  }

  const handleImport = useCallback(async () => {
    if (!parsed) return;
    setImportStatus("importing");
    const newResults: RowResult[] = [];

    const rowsToImport = parsed.rows.filter((row) => 
      row.entry !== null && selectedRows.has(row.rowIndex)
    );

    for (const row of rowsToImport) {
      if (!row.entry) continue;

      const existingEntry = getExistingEntry(row);
      const shouldUpdate = importSettings.updateDuplicates && existingEntry;

      let success = false;
      let lastError: string | undefined;
      let retryCount = 0;

      while (!success && retryCount <= importSettings.maxRetries) {
        try {
          if (shouldUpdate && existingEntry) {
            await updateEntry(existingEntry.id, row.entry);
            newResults.push({ 
              rowIndex: row.rowIndex, 
              status: "updated",
              retryCount 
            });
          } else {
            await addEntry(row.entry);
            newResults.push({ 
              rowIndex: row.rowIndex, 
              status: "imported",
              retryCount 
            });
          }
          success = true;
        } catch (err) {
          retryCount++;
          lastError = err instanceof Error ? err.message : t("bulkImport.unknownError");
          
          if (retryCount <= importSettings.maxRetries) {
            // Wait before retrying with exponential backoff
            await new Promise((r) => setTimeout(r, importSettings.retryDelay * Math.pow(2, retryCount - 1)));
          }
        }
      }

      if (!success) {
        newResults.push({
          rowIndex: row.rowIndex,
          status: "failed",
          error: lastError,
          retryCount: importSettings.maxRetries,
        });
      }

      // Small delay between rows to avoid overwhelming the server
      await new Promise((r) => setTimeout(r, 100));
    }

    setResults(newResults);
    setImportStatus("done");
  }, [parsed, selectedRows, importSettings, addEntry, updateEntry, getExistingEntry]);

  const handleRowSelection = (rowIndex: number, checked: boolean) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(rowIndex);
      } else {
        newSet.delete(rowIndex);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const allValidIndices = validRows.map((row) => row.rowIndex);
    setSelectedRows(new Set(allValidIndices));
  };

  const handleSelectNone = () => {
    setSelectedRows(new Set());
  };

  const handleReset = () => {
    setRawText("");
    setParsed(null);
    setImportStatus("idle");
    setResults([]);
    setSelectedRows(new Set());
  };

  const getRowResult = (rowIndex: number) => results.find((r) => r.rowIndex === rowIndex);

  const importedCount = results.filter((r) => r.status === "imported").length;
  const updatedCount = results.filter((r) => r.status === "updated").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader backTo="/app" pageLabel={t("bulkImport.title")} />

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-8">

        {/* Document upload — hero */}
        <section className="relative">
          {hasGeminiKey ? (
            <div
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file && !isProcessingDocument) handleProcessDocument(file);
              }}
              onClick={() => !isProcessingDocument && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !isProcessingDocument) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={[
                "group relative cursor-pointer rounded-2xl border-2 border-dashed bg-card px-6 py-10 sm:py-12 text-center transition-all",
                dragActive
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/60 hover:bg-muted/40",
                isProcessingDocument ? "cursor-wait opacity-90" : "",
              ].join(" ")}
              aria-label={t("bulkImport.documentUpload")}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessDocument(file);
                  e.target.value = "";
                }}
                disabled={isProcessingDocument}
                className="sr-only"
              />
              <div className="flex flex-col items-center gap-3">
                <div className={[
                  "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
                  dragActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
                ].join(" ")}>
                  {isProcessingDocument ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <FileUp className="h-6 w-6" />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-serif text-lg sm:text-xl tracking-tight">
                    {isProcessingDocument ? t("bulkImport.uploadProcessing") : t("bulkImport.uploadIntro")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("bulkImport.uploadHint")}
                  </p>
                </div>
                {!isProcessingDocument && (
                  <Button type="button" size="sm" variant="outline" tabIndex={-1} className="mt-1 pointer-events-none">
                    {t("bulkImport.uploadChooseFile")}
                  </Button>
                )}
              </div>

              {isProcessingDocument && documentProgress && (
                <div className="mt-6 space-y-1.5 text-left max-w-sm mx-auto">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {documentProgress.completed === 0
                        ? "Extracting words…"
                        : documentProgress.completed === documentProgress.total
                        ? "Done"
                        : `Processing chunk ${documentProgress.completed} of ${documentProgress.total - 1}…`}
                    </span>
                    <span>{Math.round((documentProgress.completed / documentProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${(documentProgress.completed / documentProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
              {/* Blurred preview of the dropzone */}
              <div aria-hidden className="pointer-events-none select-none px-6 py-10 sm:py-12 text-center blur-[6px] opacity-40">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <FileUp className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-serif text-lg sm:text-xl tracking-tight">{t("bulkImport.uploadIntro")}</p>
                  <p className="text-xs text-muted-foreground">{t("bulkImport.uploadHint")}</p>
                </div>
              </div>
              {/* Lock overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-card/60 backdrop-blur-sm">
                <div className="max-w-sm w-full px-6 text-center space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h3 className="font-serif text-lg tracking-tight flex items-center justify-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {t("bulkImport.keyMissingTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("bulkImport.keyMissingBody")}
                  </p>
                  <Button type="button" size="sm" onClick={() => setSettingsOpen(true)}>
                    {t("bulkImport.keyMissingCta")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {processedDocument && (
            <div className="mt-3 text-sm space-y-1">
              <p className="text-muted-foreground">
                {t("bulkImport.documentProcessed", {
                  extracted: processedDocument.totalExtracted,
                  new: processedDocument.newWords,
                  processed: processedDocument.processed,
                })}
              </p>
              {processedDocument.message && (
                <p className="text-amber-700 dark:text-amber-300">{processedDocument.message}</p>
              )}
            </div>
          )}
          {documentError && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span className="flex-1">{documentError}</span>
              <button
                type="button"
                onClick={() => setDocumentError(null)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        {/* Format reference (collapsible) */}
        <details className="group rounded-lg border border-border bg-card">
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold">{t("bulkImport.formatHelpToggle")}</span>
            <span className="ml-auto text-xs text-muted-foreground transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {t("bulkImport.formatDescription")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(["danish", "english", "type", "notes"] as const).map((col) => (
                <code key={col} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">
                  {col}
                </code>
              ))}
              {extraLangs.map((code) => (
                <code key={code} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">
                  translations.{code}
                </code>
              ))}
              <span className="text-[11px] text-muted-foreground self-center">{t("bulkImport.grammarFields")}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("bulkImport.validTypes")}{": "}
              {ENTRY_TYPES.map((et) => (
                <code key={et} className="font-mono">
                  {et}
                </code>
              )).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])}
              . {t("bulkImport.unknownTypeDefault")} <code className="font-mono">word</code>.
            </p>
          </div>
        </details>

        {/* Settings */}
        {parsed && parsed.rows.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
              <h2 className="text-sm font-semibold">{t("bulkImport.settings")}</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="ml-auto"
              >
                {showSettings ? t("common.close") : t("bulkImport.settings")}
              </Button>
            </div>
            {showSettings && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t("bulkImport.maxRetries")}</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={importSettings.maxRetries}
                      onChange={(e) => setImportSettings(prev => ({ ...prev, maxRetries: parseInt(e.target.value) || 0 }))}
                      className="w-full px-2 py-1 text-xs border border-border rounded"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t("bulkImport.retryDelay")}</label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      step="100"
                      value={importSettings.retryDelay}
                      onChange={(e) => setImportSettings(prev => ({ ...prev, retryDelay: parseInt(e.target.value) || 100 }))}
                      className="w-full px-2 py-1 text-xs border border-border rounded"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="updateDuplicates"
                      checked={importSettings.updateDuplicates}
                      onCheckedChange={(checked) => setImportSettings(prev => ({ ...prev, updateDuplicates: !!checked }))}
                    />
                    <label htmlFor="updateDuplicates" className="text-xs font-medium">
                      {t("bulkImport.updateDuplicates")}
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input area */}
        {(importStatus === "idle" || importStatus === "parsed") && (
          <section className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-3">
            <div className="space-y-1">
              <h2 className="font-serif text-base sm:text-lg tracking-tight">
                {t("bulkImport.pasteSectionTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("bulkImport.pasteSectionDescription")}
              </p>
            </div>
            <Textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                if (importStatus === "parsed") {
                  setParsed(null);
                  setImportStatus("idle");
                  setResults([]);
                }
              }}
              placeholder={EXAMPLE_INPUT}
              rows={10}
              className="font-mono text-xs resize-y"
              aria-label={t("bulkImport.csvLabel")}
            />
            <div className="rounded-lg border border-border bg-muted/70 p-3 text-[12px]">
              <p className="text-xs text-muted-foreground">
                {t("bulkImport.supportsJsonText")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {t("bulkImport.sampleJsonExamplesTitle")}
              </div>
              <pre className="overflow-x-auto rounded bg-background/90 p-3 text-[11px] font-mono text-muted-foreground">
                <code>{EXAMPLE_JSON}</code>
              </pre>
            </div>
            <div className="flex gap-2 justify-end">
              {rawText.trim() && (
                <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                  {t("common.clear")}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleParse}
                disabled={!rawText.trim()}
              >
                {t("bulkImport.analyze")}
              </Button>
            </div>
          </section>
        )}

        {/* Preview table */}
        {parsed && parsed.rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium">{t("bulkImport.rowsFound", { count: parsed.rows.length })}</span>
              {validRows.length > 0 && (
                <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800">
                  {t("bulkImport.validCount", { count: validRows.length })}
                </Badge>
              )}
              {errorRows.length > 0 && (
                <Badge variant="secondary" className="text-destructive bg-destructive/10 border-destructive/20">
                  {t("bulkImport.errorCount", { count: errorRows.length })}
                </Badge>
              )}
              {validRows.filter(isDuplicate).length > 0 && (
                <Badge variant="secondary" className="text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800">
                  {t("bulkImport.duplicateCount", { count: validRows.filter(isDuplicate).length })}
                </Badge>
              )}
              {selectedRows.size > 0 && (
                <Badge variant="secondary" className="text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800">
                  {t("bulkImport.selectedCount", { count: selectedRows.size })}
                </Badge>
              )}
            </div>

            {/* Selection controls */}
            {validRows.length > 0 && parsed && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t("bulkImport.selectRowsHint")}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
                    {t("bulkImport.selectAll")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectNone}>
                    {t("bulkImport.selectNone")}
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                    {parsed && validRows.length > 0 && (
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-16">
                        <div className="flex items-center gap-1">
                          <Checkbox
                            checked={selectedRows.size === validRows.length && validRows.length > 0}
                            onCheckedChange={(checked) => {
                              if (checked) handleSelectAll();
                              else handleSelectNone();
                            }}
                            aria-label={t("bulkImport.selectAll")}
                          />
                          <span className="text-[11px] text-muted-foreground">Vælg</span>
                        </div>
                      </th>
                    )}
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("bulkImport.tableDanish")}</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("bulkImport.tableEnglish")}</th>
                    {extraLangs.map((code) => (
                      <th key={code} className="text-left px-3 py-2 font-medium text-muted-foreground">
                        {getLanguageLabel(code)}
                      </th>
                    ))}
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("bulkImport.tableType")}</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("bulkImport.tableStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row) => {
                    const result = getRowResult(row.rowIndex);
                    const duplicate = isDuplicate(row);

                    let rowStatus: RowStatus;
                    if (result) {
                      rowStatus = result.status;
                    } else if (row.errors.length > 0) {
                      rowStatus = "error";
                    } else if (row.warnings.length > 0 || duplicate) {
                      rowStatus = "warning";
                    } else {
                      rowStatus = "valid";
                    }

                    return (
                      <tr
                        key={row.rowIndex}
                        className={`border-b border-border last:border-0 ${
                          rowStatus === "error"
                            ? "bg-destructive/5"
                            : rowStatus === "warning"
                            ? "bg-amber-50/60 dark:bg-amber-950/20"
                            : rowStatus === "imported"
                            ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                            : rowStatus === "updated"
                            ? "bg-blue-50/60 dark:bg-blue-950/20"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{row.rowIndex}</td>
                        {parsed && row.entry && (
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={selectedRows.has(row.rowIndex)}
                              onCheckedChange={(checked) => handleRowSelection(row.rowIndex, !!checked)}
                              disabled={importStatus !== "parsed"}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 font-medium max-w-[140px] truncate">
                          {row.entry?.danish || <span className="text-muted-foreground/50 italic">—</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                          {row.entry?.english || "—"}
                        </td>
                        {extraLangs.map((code) => (
                          <td key={code} className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                            {row.entry?.translations?.[code] || "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {row.entry ? (
                            <span className="text-muted-foreground">{entryTypeLabel(row.entry.type)}</span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 min-w-[110px]">
                          <div className="space-y-0.5">
                            {statusBadge(rowStatus)}
                            {duplicate && !result && (
                              <div className="text-[10px] text-amber-700 dark:text-amber-400">{t("bulkImport.possibleDuplicate")}</div>
                            )}
                            {row.errors.map((e, i) => (
                              <div key={i} className="text-[10px] text-destructive">{e}</div>
                            ))}
                            {row.warnings.map((w, i) => (
                              <div key={i} className="text-[10px] text-amber-700 dark:text-amber-400">{w}</div>
                            ))}
                            {result?.error && (
                              <div className="text-[10px] text-destructive">{result.error}</div>
                            )}
                            {result?.retryCount && result.retryCount > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                {t("bulkImport.retries", { count: result.retryCount })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {importStatus !== "done" && (
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                  {t("bulkImport.startOver")}
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setParsed(null);
                      setImportStatus("idle");
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleImport}
                    disabled={selectedRows.size === 0 || importStatus === "importing"}
                    className="gap-1.5"
                  >
                    {importStatus === "importing" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("bulkImport.importing")}
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        {t("bulkImport.importN", { count: selectedRows.size })}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {importStatus === "done" && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold">{t("bulkImport.importDone")}</h3>
                <div className="flex flex-wrap gap-3 text-sm">
                  {importedCount > 0 && (
                    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      {t("bulkImport.importedCount", { count: importedCount })}
                    </span>
                  )}
                  {updatedCount > 0 && (
                    <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                      <RefreshCw className="h-4 w-4" />
                      {t("bulkImport.updatedCount", { count: updatedCount })}
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <XCircle className="h-4 w-4" />
                      {t("bulkImport.failedCount", { count: failedCount })}
                    </span>
                  )}
                  {errorRows.length > 0 && (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      {t("bulkImport.skippedCount", { count: errorRows.length })}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                    {t("bulkImport.importMore")}
                  </Button>
                  <Button type="button" size="sm" onClick={() => navigate("/app")}>
                    {t("bulkImport.goToDict")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {parsed && parsed.rows.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground space-y-2">
            <AlertCircle className="h-8 w-8 mx-auto opacity-40" />
            <p className="text-sm">{t("bulkImport.noRowsFound")}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setImportStatus("idle")}>
              {t("common.retry")}
            </Button>
          </div>
        )}
      </main>
      <PageFooter />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        entries={allEntries}
        syncState={syncState}
        onConnect={connect}
        onDisconnect={disconnect}
      />
    </div>
  );
}
