/**
 * Shared storage configuration types and localStorage accessors.
 * All accessors use try/catch for safety against JSON parse errors or
 * environments where localStorage is unavailable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StorageSource = 'local' | 'google_sheets';

/** Persisted at key 'ordsamling-storage-config' */
export interface StorageConfig {
  storageSource: StorageSource;
  spreadsheetId: string | null;
  connectedEmail: string | null;
  /** Epoch ms — the access token itself is never stored in plain text here */
  oauthTokenExpiry: number | null;
}

export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.5-flash-preview-04-17';

/** Persisted at key 'ordsamling-ai-config' */
export interface AiConfig {
  geminiApiKey: string;
  geminiModel: GeminiModel;
}

/** Persisted at key 'ordsamling-dirty-queue' */
export interface DirtyOperation {
  /** UUID for deduplication */
  id: string;
  type: 'lexicon' | 'quiz_history';
  operation: 'add' | 'update' | 'delete';
  /** LexisEntry | QuizSessionRecord | string (id for delete) */
  payload: unknown;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_CONFIG_KEY = 'ordsamling-storage-config';
const AI_CONFIG_KEY = 'ordsamling-ai-config';
const DIRTY_QUEUE_KEY = 'ordsamling-dirty-queue';

// ---------------------------------------------------------------------------
// StorageConfig accessors
// ---------------------------------------------------------------------------

const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  storageSource: 'local',
  spreadsheetId: null,
  connectedEmail: null,
  oauthTokenExpiry: null,
};

export function getStorageConfig(): StorageConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_STORAGE_CONFIG };
    const parsed = JSON.parse(raw) as Partial<StorageConfig>;
    return { ...DEFAULT_STORAGE_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_STORAGE_CONFIG };
  }
}

export function setStorageConfig(config: StorageConfig): void {
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Silently ignore write failures (e.g. private browsing quota exceeded)
  }
}

// ---------------------------------------------------------------------------
// AiConfig accessors
// ---------------------------------------------------------------------------

const DEFAULT_AI_CONFIG: AiConfig = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash',
};

export function getAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_AI_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return { ...DEFAULT_AI_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export function setAiConfig(config: AiConfig): void {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Silently ignore write failures
  }
}

// ---------------------------------------------------------------------------
// DirtyQueue accessors
// ---------------------------------------------------------------------------

export function getDirtyQueue(): DirtyOperation[] {
  try {
    const raw = localStorage.getItem(DIRTY_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DirtyOperation[];
  } catch {
    return [];
  }
}

export function setDirtyQueue(queue: DirtyOperation[]): void {
  try {
    localStorage.setItem(DIRTY_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Silently ignore write failures
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Returns true when the user has enabled Google Sheets cloud sync. */
export function isCloudSyncEnabled(): boolean {
  return getStorageConfig().storageSource === 'google_sheets';
}
