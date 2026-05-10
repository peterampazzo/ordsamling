/**
 * useGoogleSheets — SyncEngine hook.
 *
 * Orchestrates the local-first sync lifecycle:
 * - Reads from Sheets on mount and merges into localStorage
 * - Pushes changes after writes (debounced per entry ID)
 * - Tracks dirty state and retries on reconnect
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { getExtraLanguages, setExtraLanguages } from '@/lib/settings';
import type { SheetSettings } from '@/lib/sheetTypes';

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
// Module-level singleton service (lazy — replaced in tests via vi.mock)
// ---------------------------------------------------------------------------

// NOTE: Instantiated inside the hook (see below) so that vi.mock() in tests
// can replace the constructor before the first render.

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
  // Instantiate service inside the hook so vi.mock() in tests can replace the
  // constructor before the first render. useMemo ensures a single instance per
  // hook lifecycle (not recreated on every render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sheetsService = useMemo(() => new GoogleSheetsService(), []);

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
  // Settings push debounce + suppression flag for incoming sheet→local updates
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressSettingsDirty = useRef(false);

  // ---------------------------------------------------------------------------
  // Retry dirty queue operations
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
        } else if (op.type === 'settings') {
          await sheetsService.writeSettings(
            spreadsheetId,
            op.payload as SheetSettings,
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
  // Sync on load
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

        // Pull settings from sheet (extraLanguages) — sheet wins on load,
        // but only if the sheet has a non-empty list. An empty sheet list
        // likely means the sheet was created before settings sync was added,
        // so we preserve the user's local settings in that case.
        try {
          const sheetSettings = await sheetsService.readSettings(spreadsheetId!, accessToken);
          if (Array.isArray(sheetSettings.extraLanguages) && sheetSettings.extraLanguages.length > 0) {
            const local = getExtraLanguages();
            const sameOrder =
              local.length === sheetSettings.extraLanguages.length &&
              local.every((c, i) => c === sheetSettings.extraLanguages[i]);
            if (!sameOrder) {
              suppressSettingsDirty.current = true;
              setExtraLanguages(sheetSettings.extraLanguages);
              // release on next microtask so the dirty event we just fired is ignored
              queueMicrotask(() => { suppressSettingsDirty.current = false; });
            }
          }
        } catch (err) {
          console.warn('readSettings failed (non-fatal):', err);
        }

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
  // Online event listener
  // ---------------------------------------------------------------------------

  useEffect(() => {
    window.addEventListener('online', retryDirtyQueue);
    return () => {
      window.removeEventListener('online', retryDirtyQueue);
    };
  }, [retryDirtyQueue]);

  // ---------------------------------------------------------------------------
  // Settings sync — listen for "ordsamling:settings-dirty" events
  // ---------------------------------------------------------------------------

  const pushSettings = useCallback(async (extraLanguages: string[]) => {
    if (!isCloudSyncEnabled()) return;
    if (suppressSettingsDirty.current) return;

    // Clear existing timer
    if (settingsTimer.current !== null) {
      clearTimeout(settingsTimer.current);
    }

    // Set new debounced timer (2 seconds)
    settingsTimer.current = setTimeout(async () => {
      settingsTimer.current = null;

      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        addToDirtyQueue({ type: 'settings', operation: 'update', payload: { extraLanguages } });
        setSyncState((prev) => ({ ...prev, status: 'dirty' }));
        return;
      }

      const currentConfig = getStorageConfig();
      const spreadsheetId = currentConfig.spreadsheetId;
      if (!spreadsheetId) return;

      try {
        await sheetsService.writeSettings(spreadsheetId, { extraLanguages }, accessToken);
      } catch (err) {
        console.error('pushSettings failed:', err);
        addToDirtyQueue({ type: 'settings', operation: 'update', payload: { extraLanguages } });
        setSyncState((prev) => ({ ...prev, status: 'dirty' }));
      }
    }, 2000);
  }, []);

  useEffect(() => {
    function handleSettingsDirty(event: Event) {
      const customEvent = event as CustomEvent<{ extraLanguages: string[] }>;
      const extraLanguages = customEvent.detail?.extraLanguages ?? getExtraLanguages();
      void pushSettings(extraLanguages);
    }

    window.addEventListener('ordsamling:settings-dirty', handleSettingsDirty);
    return () => {
      window.removeEventListener('ordsamling:settings-dirty', handleSettingsDirty);
    };
  }, [pushSettings]);

  // ---------------------------------------------------------------------------
  // OAuth complete listener
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
  // Disconnect from Google Sheets
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
  // Manual full sync
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
  // Push lexicon entry (debounced per entry ID)
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
  // Push quiz session
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
      
      // Clear settings timer
      if (settingsTimer.current !== null) {
        clearTimeout(settingsTimer.current);
        settingsTimer.current = null;
      }
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
