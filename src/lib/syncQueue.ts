import type { LexisEntry } from './lexicon';
import type { DirtyOperation } from './storageConfig';
import type { SheetSettings } from './sheetTypes';

export interface SyncScope {
  spreadsheetId: string;
  email: string;
}

export interface QueuedOperation extends DirtyOperation {
  scope: SyncScope;
  baseline?: LexisEntry | SheetSettings | null;
}

export interface SyncBaseline {
  entries: Record<string, LexisEntry>;
  settings?: SheetSettings | null;
}

export const DATA_OWNER_KEY = 'ordsamling-data-owner';
export const HISTORY_KEY = 'lexikon-quiz-history';
const QUEUE_PREFIX = 'ordsamling-journal:';
const BASELINE_PREFIX = 'ordsamling-baseline:';
const LEGACY_QUEUE_KEY = 'ordsamling-dirty-queue';

export function scopeId(scope: SyncScope): string {
  return encodeURIComponent(JSON.stringify([scope.email, scope.spreadsheetId]));
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Stored data is unreadable (${key.split(':')[0]}). Export or recover it before continuing.`);
  }
}

export function readArray<T>(key: string): T[] {
  const value = readJson<unknown>(key, []);
  if (!Array.isArray(value)) throw new Error(`Stored data is not a list (${key}).`);
  return value as T[];
}

export async function withStorageLock<T>(action: () => T | Promise<T>): Promise<T> {
  if (navigator.locks) return await navigator.locks.request('ordsamling-local-storage', action);
  return await action();
}

function operationKey(scope: SyncScope, id: string): string {
  return `${QUEUE_PREFIX}${scopeId(scope)}:${id}`;
}

export function readQueue(scope: SyncScope): QueuedOperation[] {
  const prefix = `${QUEUE_PREFIX}${scopeId(scope)}:`;
  const queue: QueuedOperation[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const operation = readJson<QueuedOperation | null>(key, null);
    if (!operation || typeof operation.id !== 'string' || !Number.isFinite(operation.timestamp) ||
      !['lexicon', 'quiz_history', 'streak_event', 'settings'].includes(operation.type)) {
      throw new Error('A pending sync operation is unreadable. It has been retained for recovery.');
    }
    queue.push(operation);
  }
  return queue.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

export function enqueue(
  scope: SyncScope,
  input: Omit<QueuedOperation, 'scope' | 'id' | 'timestamp'>,
): QueuedOperation {
  const queue = readQueue(scope);
  const operation: QueuedOperation = {
    ...input,
    scope,
    id: crypto.randomUUID(),
    timestamp: Math.max(Date.now(), (queue[queue.length - 1]?.timestamp ?? 0) + 1),
  };
  localStorage.setItem(operationKey(scope, operation.id), JSON.stringify(operation));
  return operation;
}

export function acknowledge(operations: QueuedOperation[]): void {
  for (const operation of operations) {
    localStorage.removeItem(operationKey(operation.scope, operation.id));
  }
}

export function replaceOperation(operation: QueuedOperation): void {
  localStorage.setItem(operationKey(operation.scope, operation.id), JSON.stringify(operation));
}

export function readBaseline(scope: SyncScope): SyncBaseline {
  const baseline = readJson<SyncBaseline>(`${BASELINE_PREFIX}${scopeId(scope)}`, { entries: {} });
  if (!baseline?.entries || typeof baseline.entries !== 'object' || Array.isArray(baseline.entries)) {
    throw new Error('The sync baseline is unreadable. Local data has been retained.');
  }
  return baseline;
}

export function writeBaseline(scope: SyncScope, baseline: SyncBaseline): void {
  localStorage.setItem(`${BASELINE_PREFIX}${scopeId(scope)}`, JSON.stringify(baseline));
}

export function migrateLegacyQueue(scope: SyncScope): void {
  const legacy = readArray<DirtyOperation>(LEGACY_QUEUE_KEY);
  for (const operation of legacy) {
    if (!operation?.id || !operation.type || !operation.operation) {
      throw new Error('An older pending sync operation is unreadable and has been retained.');
    }
    const key = operationKey(scope, operation.id);
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify({ ...operation, scope }));
    }
  }
  localStorage.removeItem(LEGACY_QUEUE_KEY);
}
