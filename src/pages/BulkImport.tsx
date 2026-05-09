import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Sparkles, FileUp, ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageFooter } from "@/components/layout";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useLexicon } from "@/hooks/useLexicon";
import { useGoogleSheets } from "@/hooks/useGoogleSheets";
import { t } from "@/i18n";
import { getExtraLanguages, getGeminiApiKey } from "@/lib/settings";
import { ENTRY_TYPES } from "@/lib/lexicon";
import type { LexisEntryInput } from "@/lib/lexicon";
import {
  PromptGeneratorSection,
  StructuredImportSection,
  UnifiedReviewSection,
} from "@/components/BulkImport";
import type { ParsedRow, RowResult, ImportSettings, ImportStatus } from "@/components/BulkImport/types";

// ---------------------------------------------------------------------------
// Format reference examples (restored from original)
// ---------------------------------------------------------------------------

const EXAMPLE_JSON = `[
  {
    "danish": "hus",
    "english": "house",
    "type": "noun",
    "notes": "En almindelig bolig",
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
// Method picker card
// ---------------------------------------------------------------------------

type ImportMethod = "ai" | "structured";

interface MethodCardProps {
  id: string;
  name: string;
  value: ImportMethod;
  checked: boolean;
  onChange: (v: ImportMethod) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  accentClass: string;
}

function MethodCard({
  id,
  name,
  value,
  checked,
  onChange,
  icon,
  title,
  description,
  badge,
  accentClass,
}: MethodCardProps) {
  return (
    <label
      htmlFor={id}
      className={[
        "relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 p-5 transition-all duration-200 select-none",
        "hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        checked
          ? "border-primary bg-accent/60 shadow-sm"
          : "border-border bg-card hover:border-primary/40",
      ].join(" ")}
    >
      {/* Visually hidden radio */}
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />

      {/* Selected indicator dot */}
      <span
        aria-hidden
        className={[
          "absolute right-4 top-4 h-4 w-4 rounded-full border-2 transition-all duration-200",
          checked
            ? "border-primary bg-primary"
            : "border-muted-foreground/30 bg-transparent",
        ].join(" ")}
      >
        {checked && (
          <span className="absolute inset-0.5 rounded-full bg-primary-foreground" />
        )}
      </span>

      {/* Icon */}
      <div
        className={[
          "flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200",
          checked ? accentClass : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        {icon}
      </div>

      {/* Text */}
      <div className="space-y-1 pr-6">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm leading-tight">{title}</span>
          {badge && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BulkImport() {
  const navigate = useNavigate();
  const { addEntry, updateEntry, allEntries } = useLexicon();
  const { syncState, connect, disconnect } = useGoogleSheets();

  const [extraLangs, setExtraLangs] = useState<string[]>(() => getExtraLanguages());
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(() => !!getGeminiApiKey());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Wizard state — null means nothing selected yet
  const [method, setMethod] = useState<ImportMethod | null>(null);
  const workflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      setExtraLangs(getExtraLanguages());
      setHasGeminiKey(!!getGeminiApiKey());
    };
    window.addEventListener("ordsamling:settings-changed", refresh);
    return () => window.removeEventListener("ordsamling:settings-changed", refresh);
  }, []);

  // Scroll workflow into view when method is first selected
  const handleMethodChange = useCallback((v: ImportMethod) => {
    setMethod(v);
    setTimeout(() => {
      workflowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }, []);

  // ---------------------------------------------------------------------------
  // Shared review state
  // ---------------------------------------------------------------------------
  const [reviewRows, setReviewRows] = useState<ParsedRow[]>([]);
  const [reviewHeaders, setReviewHeaders] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [results, setResults] = useState<RowResult[]>([]);
  const [importSettings, setImportSettings] = useState<ImportSettings>({
    maxRetries: 3,
    retryDelay: 1000,
    updateDuplicates: true,
    useDirectProcessing: true,
  });
  const [importProgress, setImportProgress] = useState<
    { current: number; total: number } | undefined
  >(undefined);

  const handleEntriesParsed = useCallback(
    (entries: LexisEntryInput[]) => {
      const rows: ParsedRow[] = entries.map((entry, i) => ({
        rowIndex: i + 1,
        raw: [],
        entry,
        errors: [],
        warnings: [],
      }));
      const headers = ["danish", "english", "type", "notes"];
      if (extraLangs.length > 0) headers.push(...extraLangs.map((c) => `translations.${c}`));
      setReviewRows(rows);
      setReviewHeaders(headers);
      setImportStatus("parsed");
      setResults([]);
      setSelectedRows(new Set(rows.map((r) => r.rowIndex)));
    },
    [extraLangs],
  );

  const handleRowSelectionChange = useCallback((rowIndex: number, selected: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (selected) next.add(rowIndex);
      else next.delete(rowIndex);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedRows(new Set(reviewRows.filter((r) => r.entry !== null).map((r) => r.rowIndex)));
  }, [reviewRows]);

  const handleSelectNone = useCallback(() => setSelectedRows(new Set()), []);

  const handleReset = useCallback(() => {
    setReviewRows([]);
    setReviewHeaders([]);
    setSelectedRows(new Set());
    setImportStatus("idle");
    setResults([]);
    setImportProgress(undefined);
  }, []);

  const existingEntriesMap = useMemo(
    () => new Map(allEntries.map((e) => [e.danish.toLowerCase(), e])),
    [allEntries],
  );

  const handleImport = useCallback(async () => {
    if (reviewRows.length === 0) return;
    setImportStatus("importing");
    const newResults: RowResult[] = [];
    const rowsToImport = reviewRows.filter(
      (row) => row.entry !== null && selectedRows.has(row.rowIndex),
    );
    setImportProgress({ current: 0, total: rowsToImport.length });

    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      if (!row.entry) continue;
      const existingEntry = existingEntriesMap.get(row.entry.danish.toLowerCase()) ?? null;
      const shouldUpdate = importSettings.updateDuplicates && existingEntry;
      let success = false;
      let lastError: string | undefined;
      let retryCount = 0;

      while (!success && retryCount <= importSettings.maxRetries) {
        try {
          if (shouldUpdate && existingEntry) {
            await updateEntry(existingEntry.id, row.entry);
            newResults.push({ rowIndex: row.rowIndex, status: "updated", retryCount });
          } else {
            await addEntry(row.entry);
            newResults.push({ rowIndex: row.rowIndex, status: "imported", retryCount });
          }
          success = true;
        } catch (err) {
          retryCount++;
          lastError = err instanceof Error ? err.message : t("bulkImport.unknownError");
          if (retryCount <= importSettings.maxRetries) {
            await new Promise((r) =>
              setTimeout(r, importSettings.retryDelay * Math.pow(2, retryCount - 1)),
            );
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

      setImportProgress({ current: i + 1, total: rowsToImport.length });
      await new Promise((r) => setTimeout(r, 100));
    }

    setResults(newResults);
    setImportStatus("done");
    setImportProgress(undefined);
  }, [reviewRows, selectedRows, importSettings, addEntry, updateEntry, existingEntriesMap]);

  const handleViewLexicon = useCallback(() => navigate("/app"), [navigate]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageHeader
        backTo="/app"
        pageLabel={t("bulkImport.title")}
        actions={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("settings.title")}
          >
            <Settings className="h-4 w-4" aria-hidden />
          </Button>
        }
      />

      <main id="main" className="flex-1 max-w-2xl mx-auto w-full px-3 sm:px-4 py-8 sm:py-12 space-y-10">

        {/* ── Intro ─────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight">
            {t("bulkImport.wizardHeading")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
            {t("bulkImport.wizardSubheading")}
          </p>
        </div>

        {/* ── Method picker (accessible radiogroup) ─────────────────────── */}
        <fieldset className="space-y-4 border-none p-0 m-0">
          <legend className="text-sm font-semibold text-foreground mb-3">
            {t("bulkImport.wizardPickerLabel")}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MethodCard
              id="method-ai"
              name="import-method"
              value="ai"
              checked={method === "ai"}
              onChange={handleMethodChange}
              icon={<Sparkles className="h-5 w-5" />}
              title={t("bulkImport.wizardAiTitle")}
              description={t("bulkImport.wizardAiDesc")}
              badge={t("bulkImport.wizardAiBadge")}
              accentClass="bg-primary/15 text-primary"
            />
            <MethodCard
              id="method-structured"
              name="import-method"
              value="structured"
              checked={method === "structured"}
              onChange={handleMethodChange}
              icon={<FileUp className="h-5 w-5" />}
              title={t("bulkImport.wizardStructuredTitle")}
              description={t("bulkImport.wizardStructuredDesc")}
              accentClass="bg-secondary text-secondary-foreground"
            />
          </div>
        </fieldset>

        {/* ── Active workflow (expands after selection) ──────────────────── */}
        <div
          ref={workflowRef}
          aria-live="polite"
          aria-label={t("bulkImport.wizardWorkflowRegion")}
          className={method ? "space-y-6" : ""}
        >
          {method === "ai" && (
            <div className="animate-in fade-in-0 slide-in-from-top-3 duration-300">
              <PromptGeneratorSection
                hasGeminiKey={hasGeminiKey}
                extraLanguages={extraLangs}
                existingWords={allEntries.map((e) => e.danish)}
                onEntriesParsed={handleEntriesParsed}
                onError={() => {}}
              />
            </div>
          )}
          {method === "structured" && (
            <div className="animate-in fade-in-0 slide-in-from-top-3 duration-300">
              <StructuredImportSection
                extraLanguages={extraLangs}
                onEntriesParsed={handleEntriesParsed}
                onError={() => {}}
              />
            </div>
          )}
        </div>

        {/* ── Format reference (collapsible, always accessible) ─────────── */}
        <details className="group rounded-xl border border-border bg-card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 [&::-webkit-details-marker]:hidden hover:bg-muted/40 transition-colors">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            <span className="text-sm font-semibold flex-1">{t("bulkImport.formatHelpToggle")}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-border px-4 pb-5 pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("bulkImport.formatDescription")}
            </p>

            {/* Column names */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("bulkImport.formatColumnsLabel")}
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
                <span className="text-[11px] text-muted-foreground self-center">
                  {t("bulkImport.grammarFields")}
                </span>
              </div>
            </div>

            {/* Valid types */}
            <p className="text-xs text-muted-foreground">
              {t("bulkImport.validTypes")}:{" "}
              {ENTRY_TYPES.map((et, i) => (
                <span key={et}>
                  {i > 0 && ", "}
                  <code className="font-mono">{et}</code>
                </span>
              ))}
              {". "}{t("bulkImport.unknownTypeDefault")}{" "}
              <code className="font-mono">word</code>.
            </p>

            {/* JSON example */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("bulkImport.sampleJsonExamplesTitle")}
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted/70 p-3 text-[11px] font-mono text-muted-foreground leading-relaxed border border-border">
                <code>{EXAMPLE_JSON}</code>
              </pre>
            </div>
          </div>
        </details>

        {/* ── Review & Import ────────────────────────────────────────────── */}
        {reviewRows.length > 0 && (
          <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-3 duration-300">
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t("bulkImport.reviewSeparatorLabel")}
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
            <UnifiedReviewSection
              rows={reviewRows}
              headers={reviewHeaders}
              selectedRows={selectedRows}
              existingEntries={allEntries}
              importStatus={importStatus}
              results={results}
              settings={importSettings}
              importProgress={importProgress}
              onRowSelectionChange={handleRowSelectionChange}
              onSelectAll={handleSelectAll}
              onSelectNone={handleSelectNone}
              onSettingsChange={setImportSettings}
              onImport={handleImport}
              onReset={handleReset}
              onViewLexicon={handleViewLexicon}
            />
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
