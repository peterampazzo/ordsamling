import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useLexicon } from "@/hooks/useLexicon";
import { ENTRY_TYPES, entryTypeLabel, normalizeEntryType, type EntryType } from "@/lib/lexicon";
import type { LexisEntryInput } from "@/lib/lexicon";

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/** Split a single CSV line respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
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

/** Detect whether the text uses tabs or commas as delimiter. */
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
  "danish",
  "english",
  "italian",
  "type",
  "notes",
  // grammar fields
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

type KnownColumn = (typeof KNOWN_COLUMNS)[number];

/** Normalise a header string to a known column key, or null. */
function normalizeHeader(raw: string): KnownColumn | null {
  const s = raw.toLowerCase().replace(/[\s_-]/g, "");
  const map: Record<string, KnownColumn> = {
    danish: "danish",
    dansk: "danish",
    da: "danish",
    english: "english",
    engelsk: "english",
    en: "english",
    italian: "italian",
    italiano: "italian",
    it: "italian",
    type: "type",
    type_: "type",
    ordklasse: "type",
    notes: "notes",
    noter: "notes",
    note: "notes",
    comment: "notes",
    comments: "notes",
    // grammar
    article: "article",
    artikel: "article",
    singulardefinite: "singularDefinite",
    bestemtental: "singularDefinite",
    pluralindefinite: "pluralIndefinite",
    ubestemtflertal: "pluralIndefinite",
    pluraldefinite: "pluralDefinite",
    bestemtflertal: "pluralDefinite",
    present: "present",
    nutid: "present",
    past: "past",
    datid: "past",
    perfect: "perfect",
    perfektum: "perfect",
    neuter: "neuter",
    tform: "neuter",
    definite: "definite",
    bestemtform: "definite",
    plural: "plural",
    flertal: "plural",
    comparative: "comparative",
    komparativ: "comparative",
    superlative: "superlative",
    superlativ: "superlative",
  };
  return map[s] ?? null;
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

export interface ParsedRow {
  rowIndex: number; // 1-based (excluding header)
  raw: string[];
  entry: LexisEntryInput | null;
  errors: string[];
  warnings: string[];
}

function parseRows(text: string): { rows: ParsedRow[]; headers: string[] } {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) return { rows: [], headers: [] };

  const delimiter = detectDelimiter(text);
  const headerRaw = splitLine(lines[0], delimiter);
  const headers = headerRaw.map((h) => h.replace(/^["']|["']$/g, "").trim());

  const columnMap: (KnownColumn | null)[] = headers.map(normalizeHeader);

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = splitLine(lines[i], delimiter);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Build a field map
    const fields: Partial<Record<KnownColumn, string>> = {};
    for (let c = 0; c < columnMap.length; c++) {
      const col = columnMap[c];
      if (col) {
        fields[col] = (raw[c] ?? "").trim();
      }
    }

    const danish = fields.danish ?? "";
    const english = fields.english ?? "";
    const italian = fields.italian ?? "";

    if (!danish && !english && !italian) {
      errors.push("Mindst ét af felterne dansk, engelsk eller italiensk skal udfyldes.");
    }

    const rawType = fields.type ?? "";
    const type: EntryType = rawType
      ? normalizeEntryType(rawType.toLowerCase())
      : "word";

    if (rawType && !ENTRY_TYPES.includes(type)) {
      warnings.push(`Ukendt type «${rawType}» — sat til «ord».`);
    }

    // Grammar fields
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
      italian,
      notes: fields.notes ?? "",
      type,
      ...(Object.keys(grammarFields).length > 0 ? { grammar: grammarFields } : {}),
    };

    rows.push({ rowIndex: i, raw, entry: errors.length === 0 ? entry : null, errors, warnings });
  }

  return { rows, headers };
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

type RowStatus = "valid" | "warning" | "error" | "imported" | "failed";

function statusBadge(status: RowStatus) {
  switch (status) {
    case "valid":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> OK
        </span>
      );
    case "warning":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" /> Advarsel
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" /> Fejl
        </span>
      );
    case "imported":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" /> Importeret
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
          <XCircle className="h-3.5 w-3.5" /> Fejlede
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Example CSV shown in the placeholder
// ---------------------------------------------------------------------------

const EXAMPLE_CSV = `danish,english,italian,type,notes
hus,house,casa,noun,
gå,to go,andare,verb,
stor,big,grande,adjective,
god morgen,good morning,buongiorno,expression,Hilsen om morgenen`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ImportStatus = "idle" | "parsed" | "importing" | "done";

interface RowResult {
  rowIndex: number;
  status: "imported" | "failed";
  error?: string;
}

export default function BulkImport() {
  const navigate = useNavigate();
  const { addEntry, allEntries } = useLexicon();

  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; headers: string[] } | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [results, setResults] = useState<RowResult[]>([]);

  const handleParse = useCallback(() => {
    const result = parseRows(rawText);
    setParsed(result);
    setImportStatus("parsed");
    setResults([]);
  }, [rawText]);

  const validRows = parsed?.rows.filter((r) => r.entry !== null) ?? [];
  const errorRows = parsed?.rows.filter((r) => r.entry === null) ?? [];

  // Detect duplicates against existing entries
  const existingKeys = new Set(
    allEntries.map((e) => [e.danish, e.english, e.italian].join("|").toLowerCase()),
  );

  function isDuplicate(row: ParsedRow): boolean {
    if (!row.entry) return false;
    const key = [row.entry.danish, row.entry.english, row.entry.italian].join("|").toLowerCase();
    return existingKeys.has(key);
  }

  const handleImport = useCallback(async () => {
    if (!parsed) return;
    setImportStatus("importing");
    const newResults: RowResult[] = [];

    for (const row of validRows) {
      if (!row.entry) continue;
      try {
        await addEntry(row.entry);
        newResults.push({ rowIndex: row.rowIndex, status: "imported" });
      } catch (err) {
        newResults.push({
          rowIndex: row.rowIndex,
          status: "failed",
          error: err instanceof Error ? err.message : "Ukendt fejl",
        });
      }
    }

    setResults(newResults);
    setImportStatus("done");
  }, [parsed, validRows, addEntry]);

  const handleReset = () => {
    setRawText("");
    setParsed(null);
    setImportStatus("idle");
    setResults([]);
  };

  const getRowResult = (rowIndex: number) => results.find((r) => r.rowIndex === rowIndex);

  const importedCount = results.filter((r) => r.status === "imported").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-3xl mx-auto px-3 sm:px-4">
          <div className="flex items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Tilbage"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <Upload className="h-5 w-5 text-primary shrink-0" aria-hidden />
              <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">Masseimport</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-6 space-y-6">

        {/* Instructions */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold">Format</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Indsæt CSV-data eller tabulatorseparerede data (f.eks. kopieret fra et regneark). Første linje skal
            indeholde kolonnenavne.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(["danish", "english", "italian", "type", "notes"] as const).map((col) => (
              <code key={col} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">
                {col}
              </code>
            ))}
            <span className="text-[11px] text-muted-foreground self-center">+ grammatikfelter</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Gyldige typer:{" "}
            {ENTRY_TYPES.map((t) => (
              <code key={t} className="font-mono">
                {t}
              </code>
            )).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])}
            . Ukendte typer sættes til <code className="font-mono">word</code>.
          </p>
        </div>

        {/* Input area */}
        {importStatus === "idle" || importStatus === "parsed" ? (
          <div className="space-y-3">
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
              placeholder={EXAMPLE_CSV}
              rows={10}
              className="font-mono text-xs resize-y"
              aria-label="CSV-data"
            />
            <div className="flex gap-2 justify-end">
              {rawText.trim() && (
                <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                  Ryd
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleParse}
                disabled={!rawText.trim()}
              >
                Analysér
              </Button>
            </div>
          </div>
        ) : null}

        {/* Preview table */}
        {parsed && parsed.rows.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium">{parsed.rows.length} rækker fundet</span>
              {validRows.length > 0 && (
                <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800">
                  {validRows.length} gyldige
                </Badge>
              )}
              {errorRows.length > 0 && (
                <Badge variant="secondary" className="text-destructive bg-destructive/10 border-destructive/20">
                  {errorRows.length} fejl
                </Badge>
              )}
              {validRows.filter(isDuplicate).length > 0 && (
                <Badge variant="secondary" className="text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800">
                  {validRows.filter(isDuplicate).length} mulige dubletter
                </Badge>
              )}
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Dansk</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Engelsk</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Italiensk</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
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
                            : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{row.rowIndex}</td>
                        <td className="px-3 py-2 font-medium max-w-[140px] truncate">
                          {row.entry?.danish || <span className="text-muted-foreground/50 italic">—</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                          {row.entry?.english || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                          {row.entry?.italian || "—"}
                        </td>
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
                              <div className="text-[10px] text-amber-700 dark:text-amber-400">Mulig dublet</div>
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
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Import actions */}
            {importStatus !== "done" && (
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                  Start forfra
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
                    Rediger
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleImport}
                    disabled={validRows.length === 0 || importStatus === "importing"}
                    className="gap-1.5"
                  >
                    {importStatus === "importing" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Importerer…
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Importér {validRows.length} {validRows.length === 1 ? "ord" : "ord"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Done summary */}
            {importStatus === "done" && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold">Import afsluttet</h3>
                <div className="flex flex-wrap gap-3 text-sm">
                  {importedCount > 0 && (
                    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      {importedCount} importeret
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <XCircle className="h-4 w-4" />
                      {failedCount} fejlede
                    </span>
                  )}
                  {errorRows.length > 0 && (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      {errorRows.length} sprunget over (valideringsfejl)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                    Importér flere
                  </Button>
                  <Button type="button" size="sm" onClick={() => navigate("/")}>
                    Gå til ordbogen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty parse result */}
        {parsed && parsed.rows.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground space-y-2">
            <AlertCircle className="h-8 w-8 mx-auto opacity-40" />
            <p className="text-sm">Ingen rækker fundet. Kontrollér at første linje indeholder kolonnenavne.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setImportStatus("idle")}>
              Prøv igen
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
