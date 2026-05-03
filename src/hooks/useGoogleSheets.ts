/**
 * useGoogleSheets — SyncEngine hook.
 *
 * Orchestrates the local-first sync lifecycle:
 * - Reads from Sheets on mount and merges into localStorage
 * - Pushes changes after writes (debounced per entry ID)
 * - Tracks dirty state and retries on reconnect
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { LexisEntry } from '@/lib/lexicon';
import type { QuizSessionRecord } from '@/lib/quizHistory';
import { getEntriesStorageKey } from '@/lib/demo';
import { GoogleSheetsService } from '@/services/GoogleSheetsService';
import {
  getValidAccessToken,
  initiateOAuthFlow,
  revokeOAuthToken,
  clearStoredTokens,
} from '@/lib/googleOAuth';
import {
  getStorageConfig,
  setStorageConfig,
  getDirtyQueue,
  setDirtyQueue,
  isCloudSyncEnabled,
  type DirtyOperation,
} from '@/lib/storageConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncState {
  status: 'idle' | 'syncing' | 'dirty' | 'error' | 'disconnected';
  lastSyncAt: number | null;
  spreadsheetId: string | null;
  connectedEmail: string | null;
  errorMessage: string | null;
}

export interface UseGoogleSheetsReturn {
  syncState: SyncState;
  connect: () => void;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  pushEntry: (entry: LexisEntry, op: 'add' | 'update' | 'delete') => void;
  pushQuizSession: (session: QuizSessionRecord) => void;
}

// ---------------------------------------------------------------------------
// Module-level singleton service
// ---------------------------------------------------------------------------

const sheetsService = new GoogleSheetsService();

// ---------------------------------------------------------------------------
// Pure merge algorithm (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Merge sheet entries into local entries using a last-write-wins strategy
 * based on `createdAt` timestamp.
 *
 * Rules:
 * - Local-only entry (not in sheet): preserved
 * - Sheet-only entry (not in local): added
 * - Both exist: sheet version wins if its createdAt is strictly greater
 */
export function mergeSheetsIntoLocal(
  localEntries: LexisEntry[],
  sheetEntries: LexisEntry[]
): LexisEntry[] {
  const sheetMap = new Map<string, LexisEntry>();
  for (const entry of sheetEntries) {
    sheetMap.set(entry.id, entry);
  }

  const localMap = new Map<string, LexisEntry>();
  for (const entry of localEntries) {
    localMap.set(entry.id, entry);
  }

  const merged: LexisEntry[] = [];

  // Process all local entries
  for (const localEntry of localEntries) {
    const sheetVersion = sheetMap.get(localEntry.id);
    if (sheetVersion === undefined) {
      // Local-only: keep
      merged.push(localEntry);
    } else if (sheetVersion.createdAt > localEntry.createdAt) {
      // Sheet is newer
      merged.push(sheetVersion);
    } else {
      // Local is same or newer
      merged.push(localEntry);
    }
  }

  // Add sheet-only entries
  for (const sheetEntry of sheetEntries) {
    if (!localMap.has(sheetEntry.id)) {
      merged.push(sheetEntry);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Dirty queue helpers
// ---------------------------------------------------------------------------

function addToDirtyQueue(op: Omit<DirtyOperation, 'id' | 'timestamp'>): void {
  const queue = getDirtyQueue();
  queue.push({ ...op, id: crypto.randomUUID(), timestamp: Date.now() });
  setDirtyQueue(queue);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGoogleSheets(): UseGoogleSheetsReturn {
  // Initialize state from StorageConfig
  const config = getStorageConfig();
  const initialStatus =
    config.storageSource === 'google_sheets' ? 'idle' : 'disconnected';

  const [syncState, setSyncState] = useState<SyncState>({
    status: initialStatus,
    lastSyncAt: null,
    spreadsheetId: config.spreadsheetId,
    connectedEmail: config.connectedEmail,
    errorMessage: null,
  });

  // Debounce timer map: entry.id → timer handle
  const debounceMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ---------------------------------------------------------------------------
  // Task 4.5 — retryDirtyQueue
  // ---------------------------------------------------------------------------

  const retryDirtyQueue = useCallback(async () => {
    const queue = getDirtyQueue();
    if (queue.length === 0) return;
    if (!navigator.onLine) return;

    const accessToken = await getValidAccessToken();
    if (!accessToken) return;

    const currentConfig = getStorageConfig();
    const spreadsheetId = currentConfig.spreadsheetId;
    if (!spreadsheetId) return;

    // Sort by timestamp ASC
    const sorted = [...queue].sort((a, b) => a.timestamp - b.timestamp);
    const remaining = [...sorted];

    for (let i = 0; i < sorted.length; i++) {
      const op = sorted[i];
      try {
        if (op.type === 'lexicon') {
          if (op.operation === 'add') {
            await sheetsService.writeLexiconRow(spreadsheetId, op.payload as LexisEntry, accessToken);
          } else if (op.operation === 'update') {
            await sheetsService.updateLexiconRow(spreadsheetId, op.payload as LexisEntry, accessToken);
          } else if (op.operation === 'delete') {
            await sheetsService.deleteLexiconRow(spreadsheetId, op.payload as string, accessToken);
          }
        } else if (op.type === 'quiz_history') {
          await sheetsService.appendQuizSession(
            spreadsheetId,
            op.payload as QuizSessionRecord,
            accessToken
          );
        }
        // Success: remove from remaining
        remaining.splice(remaining.findIndex((r) => r.id === op.id), 1);
        setDirtyQueue(remaining);
      } catch (err) {
        console.error('Retry failed for op', op.id, err);
        // Stop processing on first failure
        break;
      }
    }

    if (getDirtyQueue().length === 0) {
      setSyncState((prev) => ({ ...prev, status: 'idle', errorMessage: null }));
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Task 4.2 — syncOnLoad
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const currentConfig = getStorageConfig();
    if (currentConfig.storageSource !== 'google_sheets') return;

    const spreadsheetId = currentConfig.spreadsheetId;
    if (!spreadsheetId) return;

    let cancelled = false;

    async function syncOnLoad() {
      setSyncState((prev) => ({ ...prev, status: 'syncing', errorMessage: null }));

      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        if (!cancelled) {
          setSyncState((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: 'Session expired. Please reconnect.',
          }));
        }
        return;
      }

      try {
        const sheetEntries = await sheetsService.readLexicon(spreadsheetId!, accessToken);

        if (cancelled) return;

        // Read local entries
        const localRaw = localStorage.getItem(getEntriesStorageKey());
        const localEntries: LexisEntry[] = localRaw ? (JSON.parse(localRaw) as LexisEntry[]) : [];

        const merged = mergeSheetsIntoLocal(localEntries, sheetEntries);

        localStorage.setItem(getEntriesStorageKey(), JSON.stringify(merged));

        // Notify React Query to invalidate
        window.dispatchEvent(new CustomEvent('ordsamling:entries-synced'));

        if (!cancelled) {
          setSyncState((prev) => ({
            ...prev,
            status: 'idle',
            lastSyncAt: Date.now(),
            errorMessage: null,
          }));
        }
      } catch (err) {
        console.error('syncOnLoad failed:', err);
        if (!cancelled) {
          setSyncState((prev) => ({ ...prev, status: 'dirty', errorMessage: null }));
        }
      }
    }

    void syncOnLoad();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Task 4.6 — online event listener
  // ---------------------------------------------------------------------------

  useEffect(() => {
    window.addEventListener('online', retryDirtyQueue);
    return () => {
      window.removeEventListener('online', retryDirtyQueue);
    };
  }, [retryDirtyQueue]);

  // ---------------------------------------------------------------------------
  // Task 4.7 — connect() + oauth-complete listener
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleOAuthComplete() {
      const updatedConfig = getStorageConfig();
      setSyncState({
        status: updatedConfig.storageSource === 'google_sheets' ? 'idle' : 'disconnected',
        lastSyncAt: null,
        spreadsheetId: updatedConfig.spreadsheetId,
        connectedEmail: updatedConfig.connectedEmail,
        errorMessage: null,
      });
    }

    window.addEventListener('ordsamling:oauth-complete', handleOAuthComplete);
    return () => {
      window.removeEventListener('ordsamling:oauth-complete', handleOAuthComplete);
    };
  }, []);

  const connect = useCallback(() => {
    void initiateOAuthFlow();
  }, []);

  // ---------------------------------------------------------------------------
  // Task 4.8 — disconnect()
  // ---------------------------------------------------------------------------

  const disconnect = useCallback(async () => {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      await revokeOAuthToken(accessToken);
    }
    clearStoredTokens();

    const currentConfig = getStorageConfig();
    setStorageConfig({
      ...currentConfig,
      storageSource: 'local',
      spreadsheetId: null,
      connectedEmail: null,
      oauthTokenExpiry: null,
    });

    setSyncState({
      status: 'disconnected',
      lastSyncAt: null,
      spreadsheetId: null,
      connectedEmail: null,
      errorMessage: null,
    });
  }, []);

  // ---------------------------------------------------------------------------
  // syncNow — manual full sync
  // ---------------------------------------------------------------------------

  const syncNow = useCallback(async () => {
    if (!isCloudSyncEnabled()) return;

    const currentConfig = getStorageConfig();
    const spreadsheetId = currentConfig.spreadsheetId;
    if (!spreadsheetId) return;

    setSyncState((prev) => ({ ...prev, status: 'syncing', errorMessage: null }));

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      setSyncState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: 'Session expired. Please reconnect.',
      }));
      return;
    }

    try {
      const sheetEntries = await sheetsService.readLexicon(spreadsheetId, accessToken);
      const localRaw = localStorage.getItem(getEntriesStorageKey());
      const localEntries: LexisEntry[] = localRaw ? (JSON.parse(localRaw) as LexisEntry[]) : [];
      const merged = mergeSheetsIntoLocal(localEntries, sheetEntries);
      localStorage.setItem(getEntriesStorageKey(), JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('ordsamling:entries-synced'));

      setSyncState((prev) => ({
        ...prev,
        status: 'idle',
        lastSyncAt: Date.now(),
        errorMessage: null,
      }));
    } catch (err) {
      console.error('syncNow failed:', err);
      setSyncState((prev) => ({
        ...prev,
        status: 'dirty',
        errorMessage: err instanceof Error ? err.message : 'Sync failed',
      }));
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Task 4.3 + 4.9 — pushEntry (debounced per entry ID)
  // ---------------------------------------------------------------------------

  const pushEntry = useCallback(
    (entry: LexisEntry, op: 'add' | 'update' | 'delete') => {
      if (!isCloudSyncEnabled()) return;

      // Clear any existing debounce timer for this entry
      const existing = debounceMap.current.get(entry.id);
      if (existing !== undefined) {
        clearTimeout(existing);
      }

      const timer = setTimeout(async () => {
        debounceMap.current.delete(entry.id);

        const accessToken = await getValidAccessToken();
        if (!accessToken) {
          addToDirtyQueue({ type: 'lexicon', operation: op, payload: op === 'delete' ? entry.id : entry });
          setSyncState((prev) => ({ ...prev, status: 'dirty' }));
          return;
        }

        const currentConfig = getStorageConfig();
        const spreadsheetId = currentConfig.spreadsheetId;
        if (!spreadsheetId) return;

        try {
          if (op === 'add') {
            await sheetsService.writeLexiconRow(spreadsheetId, entry, accessToken);
          } else if (op === 'update') {
            await sheetsService.updateLexiconRow(spreadsheetId, entry, accessToken);
          } else if (op === 'delete') {
            await sheetsService.deleteLexiconRow(spreadsheetId, entry.id, accessToken);
          }
        } catch (err) {
          console.error('pushEntry failed:', err);
          addToDirtyQueue({ type: 'lexicon', operation: op, payload: op === 'delete' ? entry.id : entry });
          setSyncState((prev) => ({ ...prev, status: 'dirty' }));
        }
      }, 1000);

      debounceMap.current.set(entry.id, timer);
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Task 4.4 — pushQuizSession
  // ---------------------------------------------------------------------------

  const pushQuizSession = useCallback((session: QuizSessionRecord) => {
    if (!isCloudSyncEnabled()) return;

    void (async () => {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        addToDirtyQueue({ type: 'quiz_history', operation: 'add', payload: session });
        setSyncState((prev) => ({ ...prev, status: 'dirty' }));
        return;
      }

      const currentConfig = getStorageConfig();
      const spreadsheetId = currentConfig.spreadsheetId;
      if (!spreadsheetId) return;

      try {
        await sheetsService.appendQuizSession(spreadsheetId, session, accessToken);
      } catch (err) {
        console.error('pushQuizSession failed:', err);
        addToDirtyQueue({ type: 'quiz_history', operation: 'add', payload: session });
        setSyncState((prev) => ({ ...prev, status: 'dirty' }));
      }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Cleanup debounce timers on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      for (const timer of debounceMap.current.values()) {
        clearTimeout(timer);
      }
      debounceMap.current.clear();
    };
  }, []);

  return {
    syncState,
    connect,
    disconnect,
    syncNow,
    pushEntry,
    pushQuizSession,
  };
}
