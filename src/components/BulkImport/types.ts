import type { LexisEntry, LexisEntryInput, EntryType } from "@/lib/lexicon";

// ============================================================================
// BYOK Workflow State
// ============================================================================

export interface BYOKState {
  inputMethod: "upload" | "paste" | null;
  documentText: string;
  generatedPrompt: string;
  showPrompt: boolean;
  aiResponse: string;
  showResponseArea: boolean;
}

// ============================================================================
// Structured Import Workflow State
// ============================================================================

export interface StructuredImportState {
  rawInput: string;
  fileFormat: "csv" | "json" | "jsonl" | null;
  columnMapping: Map<string, string>;
}

// ============================================================================
// Shared Review State
// ============================================================================

export interface ReviewState {
  parsedRows: ParsedRow[];
  selectedRows: Set<number>;
  importStatus: ImportStatus;
  results: RowResult[];
}

// ============================================================================
// Processing State (for direct API calls)
// ============================================================================

export interface ProcessingState {
  isProcessing: boolean;
  progress: { completed: number; total: number } | null;
  error: string | null;
  abortController: AbortController | null;
}

// ============================================================================
// Settings State
// ============================================================================

export interface SettingsState {
  maxRetries: number;
  retryDelay: number;
  updateDuplicates: boolean;
  useDirectProcessing: boolean; // User preference
}

// Alias for consistency with design document
export type ImportSettings = SettingsState;

// ============================================================================
// Component Props Interfaces
// ============================================================================

export interface PromptGeneratorSectionProps {
  hasGeminiKey: boolean;
  extraLanguages: string[];
  existingWords: string[];
  onEntriesParsed: (entries: LexisEntryInput[]) => void;
  onError: (error: string) => void;
}

export interface StructuredImportSectionProps {
  extraLanguages: string[];
  onEntriesParsed: (entries: LexisEntryInput[]) => void;
  onError: (error: string) => void;
}

export interface UnifiedReviewSectionProps {
  rows: ParsedRow[];
  headers: string[];
  selectedRows: Set<number>;
  existingEntries: LexisEntry[];
  importStatus: ImportStatus;
  results: RowResult[];
  settings: ImportSettings;
  /** Optional progress during import: how many rows have been processed so far */
  importProgress?: { current: number; total: number };
  onRowSelectionChange: (rowIndex: number, selected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSettingsChange: (settings: ImportSettings) => void;
  onImport: () => Promise<void>;
  onReset: () => void;
  /** Inline-edit a parsed row before commit. Partial merge into entry. */
  onEditRow: (rowIndex: number, patch: Partial<LexisEntryInput>) => void;
  /** Remove a parsed row from the import set. */
  onRemoveRow: (rowIndex: number) => void;
  /** Optional navigation callback for "View Lexicon" button after import */
  onViewLexicon?: () => void;
}

export interface ProcessingIndicatorProps {
  progress: { completed: number; total: number };
  onCancel: () => void;
}

export interface PromptPreviewDialogProps {
  prompt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// Data Model Interfaces
// ============================================================================

export interface ParsedRow {
  rowIndex: number;
  raw: string[]; // Original CSV fields (empty for JSON)
  entry: LexisEntryInput | null; // null if validation failed
  errors: string[]; // Validation errors
  warnings: string[]; // Non-blocking warnings
}

export interface RowResult {
  rowIndex: number;
  status: "imported" | "updated" | "failed" | "skipped";
  error?: string;
  retryCount?: number;
}

export type ImportStatus = "idle" | "parsed" | "importing" | "done";

// ============================================================================
// Re-export types from lexicon for convenience
// ============================================================================

export type { LexisEntry, LexisEntryInput, EntryType };
