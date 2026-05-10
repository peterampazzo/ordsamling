import React, { useMemo } from 'react';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Loader2, BookOpen, Trash2, SkipForward } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ENTRY_TYPES, entryTypeLabel, type EntryType } from '@/lib/lexicon';
import { t } from '@/i18n';
import type { UnifiedReviewSectionProps, ParsedRow } from './types';

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

type RowStatus = 'valid' | 'warning' | 'error' | 'duplicate' | 'imported' | 'updated' | 'failed' | 'skipped';

function statusBadge(status: RowStatus) {
  switch (status) {
    case 'valid':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {t('common.ok')}
        </span>
      );
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {t('common.warning')}
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" aria-hidden /> {t('common.error')}
        </span>
      );
    case 'duplicate':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {t('bulkImport.possibleDuplicate')}
        </span>
      );
    case 'imported':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {t('common.imported')}
        </span>
      );
    case 'updated':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 font-medium">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {t('bulkImport.updated')}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
          <XCircle className="h-3.5 w-3.5" aria-hidden /> {t('common.failed')}
        </span>
      );
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
          <SkipForward className="h-3.5 w-3.5" aria-hidden /> {t('bulkImport.skipped')}
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnifiedReviewSection({
  rows,
  headers,
  selectedRows,
  existingEntries,
  importStatus,
  results,
  settings,
  importProgress,
  onRowSelectionChange,
  onSelectAll,
  onSelectNone,
  onSettingsChange,
  onImport,
  onReset,
  onEditRow,
  onRemoveRow,
  onViewLexicon,
}: UnifiedReviewSectionProps) {
  const [showSettings, setShowSettings] = React.useState(false);

  // Build a set of existing Danish words for duplicate detection
  // Must be called unconditionally (before any early return) to satisfy Rules of Hooks
  const existingDanishKeys = useMemo(
    () => new Set(existingEntries.map((e) => e.danish.toLowerCase())),
    [existingEntries],
  );

  // Component should only render when rows.length > 0
  if (rows.length === 0) {
    return null;
  }

  function isDuplicate(row: ParsedRow): boolean {
    if (!row.entry) return false;
    return existingDanishKeys.has(row.entry.danish.toLowerCase());
  }

  function getRowResult(rowIndex: number) {
    return results.find((r) => r.rowIndex === rowIndex);
  }

  // Calculate summary statistics
  const validRows = rows.filter((row) => row.entry !== null && row.errors.length === 0);
  const warningRows = rows.filter((row) => row.entry !== null && row.warnings.length > 0);
  const errorRows = rows.filter((row) => row.entry === null || row.errors.length > 0);
  const duplicateRows = validRows.filter(isDuplicate);

  // Detect extra language columns from headers
  const extraLangCodes = headers
    .filter((h) => h.startsWith('translations.'))
    .map((h) => h.slice('translations.'.length));

  const validRowCount = validRows.length;
  const allValidSelected =
    validRowCount > 0 &&
    validRows.every((row) => selectedRows.has(row.rowIndex));

  // Select only non-error, non-duplicate rows
  function handleSelectValidOnly() {
    const validNonDuplicateIndices = validRows
      .filter((row) => !isDuplicate(row))
      .map((row) => row.rowIndex);
    // Deselect all first, then select valid-only
    onSelectNone();
    // We need to call onRowSelectionChange for each valid row
    // Use a small trick: call onSelectAll then deselect errors/duplicates
    // Actually, we'll use onRowSelectionChange per row
    validNonDuplicateIndices.forEach((idx) => onRowSelectionChange(idx, true));
  }

  const validNonDuplicateCount = validRows.filter((row) => !isDuplicate(row)).length;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Review &amp; Import</CardTitle>
        <CardDescription>
          Review parsed entries and select which ones to import
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary Statistics */}
        <div className="flex flex-wrap items-center gap-4 text-sm" aria-live="polite">
          <span className="font-medium">Found: {rows.length} rows</span>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-green-600">✓ {validRows.length} valid</span>
          {warningRows.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-yellow-600">⚠ {warningRows.length} warnings</span>
            </>
          )}
          {errorRows.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-red-600">✗ {errorRows.length} errors</span>
            </>
          )}
          {duplicateRows.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-blue-600">⟳ {duplicateRows.length} duplicates</span>
            </>
          )}
        </div>

        {/* Duplicate preview banner — surfaces the Skip/Update choice to the main flow */}
        {duplicateRows.length > 0 && importStatus !== 'done' && (
          <div
            className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 px-4 py-3"
            role="region"
            aria-live="polite"
            aria-label={t('bulkImport.duplicatePreviewSummary', { count: duplicateRows.length, total: validRows.length })}
          >
            <p className="text-sm text-foreground">
              {t('bulkImport.duplicatePreviewSummary', { count: duplicateRows.length, total: validRows.length })}
            </p>
            <fieldset className="mt-2.5 flex flex-wrap gap-2 border-0 p-0 m-0">
              <legend className="sr-only">{t('bulkImport.duplicatePreviewLegend')}</legend>
              <label className={[
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors',
                !settings.updateDuplicates
                  ? 'border-primary bg-primary/10 text-foreground font-medium'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
              ].join(' ')}>
                <input
                  type="radio"
                  name="duplicate-strategy"
                  className="sr-only"
                  checked={!settings.updateDuplicates}
                  onChange={() => onSettingsChange({ ...settings, updateDuplicates: false })}
                  disabled={importStatus === 'importing'}
                />
                {t('bulkImport.skipDuplicates')}
              </label>
              <label className={[
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors',
                settings.updateDuplicates
                  ? 'border-primary bg-primary/10 text-foreground font-medium'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
              ].join(' ')}>
                <input
                  type="radio"
                  name="duplicate-strategy"
                  className="sr-only"
                  checked={settings.updateDuplicates}
                  onChange={() => onSettingsChange({ ...settings, updateDuplicates: true })}
                  disabled={importStatus === 'importing'}
                />
                {t('bulkImport.updateDuplicatesShort')}
              </label>
            </fieldset>
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={importStatus === 'importing'}
            title="Ctrl+A"
          >
            {t('bulkImport.selectAll')}
            <span className="ml-1.5 text-[10px] text-muted-foreground hidden sm:inline">Ctrl+A</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectNone}
            disabled={importStatus === 'importing'}
          >
            {t('bulkImport.selectNone')}
          </Button>
          {validNonDuplicateCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectValidOnly}
              disabled={importStatus === 'importing'}
            >
              Select Valid Only
              <span className="ml-1.5 text-[10px] text-muted-foreground">({validNonDuplicateCount})</span>
            </Button>
          )}
          <span className="ml-auto text-sm text-muted-foreground">
            {selectedRows.size} of {validRowCount} valid selected
          </span>
        </div>

        {/* Review Table */}
        <div
          className="rounded-lg border border-border overflow-x-auto max-h-[480px] overflow-y-auto"
          aria-live="polite"
          aria-label="Parsed entries for review"
        >
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/50">
                {/* Checkbox header — select all valid rows */}
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10">
                  <Checkbox
                    checked={allValidSelected}
                    onCheckedChange={(checked) => {
                      if (checked) onSelectAll();
                      else onSelectNone();
                    }}
                    disabled={importStatus === 'importing' || validRowCount === 0}
                    aria-label={t('bulkImport.selectAll')}
                  />
                </th>
                {/* Row number */}
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10">#</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  {t('bulkImport.tableDanish')}
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  {t('bulkImport.tableEnglish')}
                </th>
                {extraLangCodes.map((code) => (
                  <th key={code} className="text-left px-3 py-2 font-medium text-muted-foreground">
                    {code.toUpperCase()}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">
                  {t('bulkImport.tableType')}
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  {t('bulkImport.tableStatus')}
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10">
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const result = getRowResult(row.rowIndex);
                const duplicate = isDuplicate(row);
                const hasError = row.errors.length > 0 || row.entry === null;

                let rowStatus: RowStatus;
                if (result) {
                  rowStatus = result.status;
                } else if (hasError) {
                  rowStatus = 'error';
                } else if (duplicate) {
                  rowStatus = 'duplicate';
                } else if (row.warnings.length > 0) {
                  rowStatus = 'warning';
                } else {
                  rowStatus = 'valid';
                }

                const isSelectable = row.entry !== null && !hasError;
                const isChecked = selectedRows.has(row.rowIndex);

                return (
                  <tr
                    key={row.rowIndex}
                    className={[
                      'border-b border-border last:border-0 transition-colors',
                      hasError
                        ? 'opacity-50 bg-destructive/5'
                        : rowStatus === 'warning'
                        ? 'bg-amber-50/60 dark:bg-amber-950/20'
                        : rowStatus === 'duplicate'
                        ? 'bg-blue-50/40 dark:bg-blue-950/20'
                        : rowStatus === 'imported'
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                        : rowStatus === 'updated'
                        ? 'bg-blue-50/60 dark:bg-blue-950/20'
                        : '',
                    ].join(' ')}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2">
                      {isSelectable ? (
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) =>
                            onRowSelectionChange(row.rowIndex, !!checked)
                          }
                          disabled={importStatus === 'importing'}
                          aria-label={`Select row ${row.rowIndex}`}
                        />
                      ) : (
                        <Checkbox checked={false} disabled aria-label={`Row ${row.rowIndex} has errors`} />
                      )}
                    </td>
                    {/* Row number */}
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {row.rowIndex}
                    </td>
                    {/* Danish (editable) */}
                    <td className="px-2 py-1.5 max-w-[160px]">
                      {isEditable ? (
                        <Input
                          value={row.entry?.danish ?? ''}
                          onChange={(e) => onEditRow(row.rowIndex, { danish: e.target.value })}
                          className="h-8 text-xs"
                          aria-label={t('bulkImport.editDanishAria', { row: row.rowIndex })}
                        />
                      ) : (
                        <span className="font-medium truncate block">
                          {row.entry?.danish || (
                            <span className="text-muted-foreground/50 italic">—</span>
                          )}
                        </span>
                      )}
                    </td>
                    {/* English (editable) */}
                    <td className="px-2 py-1.5 max-w-[160px]">
                      {isEditable ? (
                        <Input
                          value={row.entry?.english ?? ''}
                          onChange={(e) => onEditRow(row.rowIndex, { english: e.target.value })}
                          className="h-8 text-xs"
                          aria-label={t('bulkImport.editEnglishAria', { row: row.rowIndex })}
                        />
                      ) : (
                        <span className="text-muted-foreground truncate block">
                          {row.entry?.english || '—'}
                        </span>
                      )}
                    </td>
                    {/* Extra language columns */}
                    {extraLangCodes.map((code) => (
                      <td
                        key={code}
                        className="px-2 py-1.5 max-w-[140px]"
                      >
                        {isEditable ? (
                          <Input
                            value={row.entry?.translations?.[code] ?? ''}
                            onChange={(e) => {
                              const next = { ...(row.entry?.translations ?? {}) };
                              if (e.target.value.trim()) next[code] = e.target.value;
                              else delete next[code];
                              onEditRow(row.rowIndex, { translations: next });
                            }}
                            className="h-8 text-xs"
                            aria-label={t('bulkImport.editTranslationAria', { row: row.rowIndex, lang: code })}
                          />
                        ) : (
                          <span className="text-muted-foreground truncate block">
                            {row.entry?.translations?.[code] || '—'}
                          </span>
                        )}
                      </td>
                    ))}
                    {/* Type (editable) */}
                    <td className="px-2 py-1.5">
                      {isEditable && row.entry ? (
                        <Select
                          value={row.entry.type}
                          onValueChange={(v) => onEditRow(row.rowIndex, { type: v as EntryType })}
                        >
                          <SelectTrigger
                            className="h-8 text-xs"
                            aria-label={t('bulkImport.editTypeAria', { row: row.rowIndex })}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ENTRY_TYPES.map((tp) => (
                              <SelectItem key={tp} value={tp} className="text-xs">
                                {entryTypeLabel(tp)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : row.entry ? (
                        <span className="text-muted-foreground">
                          {entryTypeLabel(row.entry.type)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2 min-w-[120px]">
                      <div className="space-y-0.5">
                        {statusBadge(rowStatus)}
                        {row.errors.map((e, i) => (
                          <div key={i} className="text-[10px] text-destructive">
                            {e}
                          </div>
                        ))}
                        {row.warnings.map((w, i) => (
                          <div key={i} className="text-[10px] text-amber-700 dark:text-amber-400">
                            {w}
                          </div>
                        ))}
                        {result?.error && (
                          <div className="text-[10px] text-destructive">{result.error}</div>
                        )}
                        {result?.retryCount != null && result.retryCount > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            {t('bulkImport.retries', { count: result.retryCount })}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Remove row */}
                    <td className="px-2 py-1.5">
                      {importStatus !== 'done' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveRow(row.rowIndex)}
                          disabled={importStatus === 'importing'}
                          aria-label={t('bulkImport.removeRowAria', { row: row.rowIndex })}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Import Settings */}
        <div className="border rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
            aria-expanded={showSettings}
          >
            <span>Import Settings</span>
            {showSettings ? (
              <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
            ) : (
              <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            )}
          </button>
          {showSettings && (
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border bg-muted/20">
              {/* Update duplicates */}
              <div className="flex items-center gap-3">
                <Checkbox
                  id="update-duplicates"
                  checked={settings.updateDuplicates}
                  onCheckedChange={(checked) =>
                    onSettingsChange({ ...settings, updateDuplicates: !!checked })
                  }
                  disabled={importStatus === 'importing'}
                />
                <label htmlFor="update-duplicates" className="text-sm cursor-pointer select-none">
                  Update duplicates
                  <span className="block text-xs text-muted-foreground">
                    Overwrite existing entries that match by Danish word
                  </span>
                </label>
              </div>

              {/* Max retries */}
              <div className="space-y-1">
                <label htmlFor="max-retries" className="text-sm font-medium">
                  Max retries
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="max-retries"
                    type="number"
                    min={0}
                    max={10}
                    value={settings.maxRetries}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        maxRetries: Math.min(10, Math.max(0, Number(e.target.value))),
                      })
                    }
                    disabled={importStatus === 'importing'}
                    className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <span className="text-xs text-muted-foreground">retries per row (0–10)</span>
                </div>
              </div>

              {/* Retry delay */}
              <div className="space-y-1">
                <label htmlFor="retry-delay" className="text-sm font-medium">
                  Retry delay
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="retry-delay"
                    type="number"
                    min={0}
                    step={100}
                    value={settings.retryDelay}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        retryDelay: Math.max(0, Number(e.target.value)),
                      })
                    }
                    disabled={importStatus === 'importing'}
                    className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <span className="text-xs text-muted-foreground">ms between retries</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Summary — shown after import completes, replaces the import button */}
        {importStatus === 'done' && results.length > 0 && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <div className="px-4 py-3 border-b border-emerald-200 dark:border-emerald-800">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Import Complete
              </h3>
            </div>
            <div className="px-4 py-4 space-y-4">
              {/* Count chips */}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const importedCount = results.filter((r) => r.status === 'imported').length;
                  const updatedCount = results.filter((r) => r.status === 'updated').length;
                  const failedCount = results.filter((r) => r.status === 'failed').length;
                  return (
                    <>
                      {importedCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          {importedCount} imported
                        </span>
                      )}
                      {updatedCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/50 px-3 py-1 text-sm font-semibold text-blue-800 dark:text-blue-200">
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          {updatedCount} updated
                        </span>
                      )}
                      {failedCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900/50 px-3 py-1 text-sm font-semibold text-red-800 dark:text-red-200">
                          <XCircle className="h-3.5 w-3.5" aria-hidden />
                          {failedCount} failed
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Primary CTA: View Lexicon, secondary: Start New Import */}
              <div className="flex flex-wrap gap-2">
                {onViewLexicon && (
                  <Button onClick={onViewLexicon} className="gap-1.5">
                    <BookOpen className="h-4 w-4" aria-hidden />
                    View Lexicon
                  </Button>
                )}
                <Button variant="outline" onClick={onReset} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Start New Import
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Import button — hidden once import is done */}
        {importStatus !== 'done' && (
          <div className="flex items-center gap-2">
            <Button
              onClick={onImport}
              disabled={selectedRows.size === 0 || importStatus === 'importing'}
              className="flex-1 gap-1.5"
            >
              {importStatus === 'importing' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {importProgress
                    ? `Importing ${importProgress.current} of ${importProgress.total}…`
                    : 'Importing…'}
                </>
              ) : (
                `Import Selected (${selectedRows.size} entries)`
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
