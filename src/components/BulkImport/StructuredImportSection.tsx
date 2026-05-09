import { useState, useRef, DragEvent } from 'react';
import { FileUp, Upload, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { StructuredImportSectionProps, StructuredImportState } from './types';
import { parseInput, detectFormat, normalizeHeader, type DetectedFormat } from './parseUtils';
import type { ParsedRow } from './types';

// Allowed file types for upload
const ALLOWED_FILE_TYPES = ['.csv', '.json', '.jsonl', '.txt'];
const ALLOWED_MIME_TYPES = ['text/csv', 'application/json', 'text/plain', 'text/jsonl'];

// Format badge styling
const FORMAT_BADGE_VARIANTS: Record<DetectedFormat, { label: string; className: string }> = {
  csv: { label: 'CSV', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  json: { label: 'JSON', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  jsonl: { label: 'JSONL', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
};

// ---------------------------------------------------------------------------
// CSV Column Mapping Table
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  danish: 'Danish word',
  english: 'English translation',
  type: 'Entry type',
  notes: 'Notes',
  article: 'Article',
  singularDefinite: 'Singular definite',
  pluralIndefinite: 'Plural indefinite',
  pluralDefinite: 'Plural definite',
  present: 'Present tense',
  past: 'Past tense',
  perfect: 'Perfect tense',
  neuter: 'Neuter form',
  definite: 'Definite form',
  plural: 'Plural form',
  comparative: 'Comparative',
  superlative: 'Superlative',
};

function fieldLabel(mappedKey: string): string {
  if (mappedKey.startsWith('translations.')) {
    const code = mappedKey.slice('translations.'.length);
    return `Translation (${code.toUpperCase()})`;
  }
  return FIELD_LABELS[mappedKey] ?? mappedKey;
}

function CsvColumnMappingTable({ rawHeaders }: { rawHeaders: string[] }) {
  return (
    <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
      <p className="text-sm font-medium">Column mapping:</p>
      <p className="text-xs text-muted-foreground">Unrecognized columns are ignored during import.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1 pr-4 font-medium text-muted-foreground">CSV column</th>
              <th className="text-left py-1 font-medium text-muted-foreground">Mapped to</th>
              <th className="text-left py-1 pl-4 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rawHeaders.map((header) => {
              const mapped = normalizeHeader(header);
              const recognized = mapped !== null;
              return (
                <tr key={header} className="border-b border-border/50 last:border-0">
                  <td className="py-1 pr-4 font-mono">{header}</td>
                  <td className="py-1 text-muted-foreground">
                    {recognized ? fieldLabel(mapped) : <span className="italic text-muted-foreground/60">—</span>}
                  </td>
                  <td className="py-1 pl-4">
                    {recognized ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Recognized
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3" />
                        Unrecognized
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StructuredImportSection({
  extraLanguages,
  onEntriesParsed,
  onError,
}: StructuredImportSectionProps) {
  // State management for StructuredImportState
  const [state, setState] = useState<StructuredImportState>({
    rawInput: '',
    fileFormat: null,
    columnMapping: new Map<string, string>(),
  });

  // Detected format (live, before Analyze is clicked)
  const [detectedFormat, setDetectedFormat] = useState<DetectedFormat | null>(null);

  // Parse results
  const [parseResults, setParseResults] = useState<{
    rows: ParsedRow[];
    headers: string[];
    format: DetectedFormat | null;
  } | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (value: string) => {
    setState(prev => ({
      ...prev,
      rawInput: value,
      fileFormat: null,
    }));
    setLocalError(null);
    setUploadSuccess(false);
    setParseResults(null);

    // Live format detection
    const fmt = detectFormat(value);
    setDetectedFormat(fmt);
  };

  const validateFileType = (file: File): boolean => {
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    if (!ALLOWED_FILE_TYPES.includes(fileExtension)) {
      return false;
    }

    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return false;
    }

    return true;
  };

  const processFile = async (file: File) => {
    setIsLoading(true);
    setLocalError(null);
    setUploadSuccess(false);
    setParseResults(null);

    try {
      if (!validateFileType(file)) {
        throw new Error(
          `Invalid file type. Please upload a file with one of these extensions: ${ALLOWED_FILE_TYPES.join(', ')}`
        );
      }

      const text = await file.text();

      if (!text.trim()) {
        throw new Error('File is empty. Please upload a file with content.');
      }

      const fmt = detectFormat(text);
      setDetectedFormat(fmt);

      setState(prev => ({
        ...prev,
        rawInput: text,
        fileFormat: fmt,
      }));

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to read file';
      setLocalError(errorMsg);
      onError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await processFile(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    if (files.length > 1) {
      const errorMsg = 'Please drop only one file at a time';
      setLocalError(errorMsg);
      onError(errorMsg);
      return;
    }

    await processFile(files[0]);
  };

  const handleAnalyze = () => {
    if (!state.rawInput.trim()) {
      const errorMsg = 'Please provide data to analyze';
      setLocalError(errorMsg);
      onError(errorMsg);
      return;
    }

    setLocalError(null);
    setIsParsing(true);

    // Use a microtask to allow the "Parsing..." state to render before the
    // synchronous parse work blocks the main thread.
    setTimeout(() => {
      try {
        doAnalyze();
      } finally {
        setIsParsing(false);
      }
    }, 0);
  };

  const doAnalyze = () => {
    try {
      const result = parseInput(state.rawInput);
      setParseResults(result);

      // Update state with detected format
      setState(prev => ({
        ...prev,
        fileFormat: result.format,
      }));

      const validEntries = result.rows
        .filter(r => r.entry !== null)
        .map(r => r.entry!);

      if (validEntries.length === 0 && result.rows.length === 0) {
        const errorMsg = 'No data found. Make sure the first line contains column names for CSV.';
        setLocalError(errorMsg);
        onError(errorMsg);
        return;
      }

      if (validEntries.length > 0) {
        onEntriesParsed(validEntries);
      } else {
        // All rows have errors — show them inline but don't call onEntriesParsed
        const errorMsg = `All ${result.rows.length} rows have validation errors. Please fix them and try again.`;
        setLocalError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to parse data';
      setLocalError(errorMsg);
      onError(errorMsg);
    }
  };

  const handleClear = () => {
    setState(prev => ({ ...prev, rawInput: '', fileFormat: null }));
    setLocalError(null);
    setUploadSuccess(false);
    setParseResults(null);
    setDetectedFormat(null);
    setShowAllErrors(false);
  };

  // Derived values for display
  const validRows = parseResults?.rows.filter(r => r.entry !== null) ?? [];
  const errorRows = parseResults?.rows.filter(r => r.entry === null) ?? [];
  const warningRows = parseResults?.rows.filter(r => r.entry !== null && r.warnings.length > 0) ?? [];

  const displayFormat = parseResults?.format ?? detectedFormat;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileUp className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Import Structured Data</CardTitle>
          {displayFormat && (
            <Badge
              variant="secondary"
              className={FORMAT_BADGE_VARIANTS[displayFormat].className}
            >
              {FORMAT_BADGE_VARIANTS[displayFormat].label}
            </Badge>
          )}
        </div>
        <CardDescription>
          Upload or paste pre-formatted CSV, JSON, or JSONL files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drag-and-Drop Zone */}
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-6 transition-all duration-200
            ${isDragging
              ? 'border-primary bg-primary/5 scale-[1.02]'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }
            ${isLoading ? 'opacity-50 pointer-events-none' : ''}
          `}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className={`
              p-3 rounded-full transition-colors
              ${isDragging ? 'bg-primary/10' : 'bg-muted'}
            `}>
              <Upload className={`h-6 w-6 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isDragging ? 'Drop file here' : 'Drag and drop a file here'}
              </p>
              <p className="text-xs text-muted-foreground">
                or click the button below to browse
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {isLoading ? 'Loading...' : 'Browse Files'}
            </Button>

            <p className="text-xs text-muted-foreground">
              Supported formats: {ALLOWED_FILE_TYPES.join(', ')}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_FILE_TYPES.join(',')}
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Success Feedback */}
        {uploadSuccess && (
          <Alert className="border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-600">
              File uploaded successfully! You can now analyze the data.
            </AlertDescription>
          </Alert>
        )}

        {/* Error Display */}
        {localError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription className="flex items-start justify-between gap-2">
              <span>{localError}</span>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setLocalError(null)}
                className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-destructive-foreground"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Text Area for Manual Paste */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Or paste your data directly:</label>
          <Textarea
            value={state.rawInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="danish,english,type,notes&#10;hus,house,noun,&#10;gå,to go,verb,"
            className="min-h-[200px] font-mono text-sm"
            disabled={isLoading}
          />
        </div>

        {/* Analyze Button */}
        <div className="flex gap-2">
          <Button
            onClick={handleAnalyze}
            disabled={!state.rawInput.trim() || isLoading || isParsing}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              'Processing...'
            ) : isParsing ? (
              <>
                <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent inline-block" aria-hidden />
                Parsing…
              </>
            ) : (
              'Analyze Data'
            )}
          </Button>
          {state.rawInput.trim() && (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={isParsing}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Parse Results Summary */}
        {parseResults && parseResults.rows.length > 0 && (
          <div className="space-y-3">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium">
                {parseResults.rows.length} row{parseResults.rows.length !== 1 ? 's' : ''} found
              </span>
              {validRows.length > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validRows.length} valid
                </Badge>
              )}
              {warningRows.length > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {warningRows.length} warning{warningRows.length !== 1 ? 's' : ''}
                </Badge>
              )}
              {errorRows.length > 0 && (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  {errorRows.length} error{errorRows.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {/* CSV Column Mapping UI */}
            {parseResults.format === 'csv' && parseResults.headers.length > 0 && (
              <CsvColumnMappingTable rawHeaders={parseResults.headers} />
            )}

            {/* Inline parse errors */}
            {errorRows.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">
                  Row errors ({errorRows.length}):
                </p>
                <div className="space-y-1">
                  {(showAllErrors ? errorRows : errorRows.slice(0, 3)).map((row) => (
                    <div key={row.rowIndex} className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1.5">
                      <div className="flex items-start gap-1">
                        <span className="font-medium shrink-0">Row {row.rowIndex}:</span>
                        <span>{row.errors.join('; ')}</span>
                      </div>
                      {row.raw.length > 0 && (
                        <div className="mt-0.5 font-mono text-[10px] text-destructive/70 truncate">
                          {row.raw.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {errorRows.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllErrors((v) => !v)}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
                  >
                    {showAllErrors
                      ? 'Show fewer errors'
                      : `Show all ${errorRows.length} errors`}
                  </button>
                )}
              </div>
            )}

            {/* Inline warnings */}
            {warningRows.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Warnings:</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {warningRows.map((row) => (
                    <div key={row.rowIndex} className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1">
                      <span className="font-medium">Row {row.rowIndex}:</span>{' '}
                      {row.warnings.join('; ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Success message */}
            {validRows.length > 0 && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-600">
                  {validRows.length} valid entr{validRows.length !== 1 ? 'ies' : 'y'} ready for review below.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Format Information */}
        <Alert>
          <AlertDescription className="text-sm">
            <strong>ℹ️ Supports:</strong> CSV, JSON, JSONL
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show Format Examples ▾
              </summary>
              <div className="mt-2 space-y-2 text-xs">
                <div>
                  <strong>CSV:</strong>
                  <pre className="mt-1 p-2 bg-muted rounded">
danish,english,type,notes{'\n'}
hus,house,noun,{'\n'}
gå,to go,verb,
                  </pre>
                </div>
                <div>
                  <strong>JSON:</strong>
                  <pre className="mt-1 p-2 bg-muted rounded">
{`[
  {
    "danish": "hus",
    "english": "house",
    "type": "noun"
  }
]`}
                  </pre>
                </div>
                <div>
                  <strong>JSONL:</strong>
                  <pre className="mt-1 p-2 bg-muted rounded">
{`{"danish": "hus", "english": "house", "type": "noun"}
{"danish": "gå", "english": "to go", "type": "verb"}`}
                  </pre>
                </div>
              </div>
            </details>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
