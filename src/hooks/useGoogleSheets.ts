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
import type { SheetSettings, StreakEvent } from '@/lib/sheetTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncState {
  status: 'idle' | 'syncing' | 'dirty' | 'error' | 'conflict' | 'disconnected';
  lastSyncAt: number | null;
  spreadsheetId: string | null;
  connectedEmail: string | null;
  errorMessage: string | null;
  /** Number of operations waiting in the local dirty queue. */
  pendingCount: number;
  /** True when getValidAccessToken returned null while cloud sync was enabled. */
  sessionExpired: boolean;
}

const SESSION_EXPIRED = 'session_expired';

/**
 * Pure conflict detection. A conflict exists when we have unsynced local
 * changes (`localDirty`) AND the remote sheet was updated after we last
 * pulled from it (`remoteUpdatedAt > lastSyncAt`). If we have never synced
 * (`lastSyncAt === null`) we cannot prove the remote is newer, so no conflict.
 *
 * Pure function — no side effects, fully unit-testable.
 */
export function detectConflict(
  localDirty: boolean,
  remoteUpdatedAt: number | null,
  lastSyncAt: number | null,
): boolean {
  if (!localDirty) return false;
  if (remoteUpdatedAt == null || lastSyncAt == null) return false;
  return remoteUpdatedAt > lastSyncAt;
}

export interface UseGoogleSheetsReturn {
  syncState: SyncState;
  connect: () => void;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  pushEntry: (entry: LexisEntry, op: 'add' | 'update' | 'delete') => void;
  pushQuizSession: (session: QuizSessionRecord) => void;
  pushStreakEvent: (event: StreakEvent) => void;
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
 * based on `updatedAt` timestamp (modification time, not creation time).
 *
 * Rules:
 * - Local-only entry (not in sheet): preserved
 * - Sheet-only entry (not in local): added
 * - Both exist: sheet version wins if its updatedAt is strictly greater
 * - If updatedAt is equal, local version wins (deterministic tie-breaker)
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
    } else if (sheetVersion.updatedAt > localEntry.updatedAt) {
      // Sheet is newer by updatedAt
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
  // Coalesce: drop any earlier queued lexicon update/add for the same entry id
  // so the queue never grows with obsolete edits of the same row. Deletes are
  // kept (a delete supersedes earlier adds/updates).
  if (op.type === 'lexicon' && (op.operation === 'add' || op.operation === 'update')) {
    const incomingEntry = op.payload as LexisEntry;
    const incomingId = incomingEntry?.id;
    if (incomingId) {
      for (let i = queue.length - 1; i >= 0; i--) {
        const existing = queue[i];
        if (existing.type !== 'lexicon') continue;
        if (existing.operation === 'delete') continue;
        const existingEntry = existing.payload as LexisEntry;
        if (existingEntry?.id === incomingId) {
          queue.splice(i, 1);
        }
      }
    }
  }
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
   
  const sheetsService = useMemo(() => new GoogleSheetsService(), []);

  const refreshRemoteEntries = useCallback(
    async (spreadsheetId: string, accessToken: string) => {
      const sheetEntries = await sheetsService.readLexicon(spreadsheetId, accessToken);
      const localRaw = localStorage.getItem(getEntriesStorageKey());
      const localEntries: LexisEntry[] = localRaw ? (JSON.parse(localRaw) as LexisEntry[]) : [];
      const merged = mergeSheetsIntoLocal(localEntries, sheetEntries);
      if (JSON.stringify(merged) !== JSON.stringify(localEntries)) {
        localStorage.setItem(getEntriesStorageKey(), JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent('ordsamling:entries-synced'));
      }
    },
    [sheetsService]
  );

  // ---------------------------------------------------------------------------
  // Retry dirty queue operations
  const retryDirtyQueue = useCallback(async () => {
    const queue = getDirtyQueue();
    if (queue.length === 0) return;
    if (!navigator.onLine) return;

    const accessToken = await getValidAccessToken();
    if (!accessToken) return;

    const currentConfig = getStorageConfig();
    const spreadsheetId = currentConfig.spreadsheetId;
    if (!spreadsheetId) return;

    try {
      await refreshRemoteEntries(spreadsheetId, accessToken);
    } catch (err) {
      console.warn('retryDirtyQueue refresh failed:', err);
      return;
    }

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
        } else if (op.type === 'streak_event') {
          await sheetsService.appendStreakEvent(
            spreadsheetId,
            op.payload as StreakEvent,
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

    const finalCount = getDirtyQueue().length;
    if (finalCount === 0) {
      setSyncState((prev) => ({ ...prev, status: 'idle', errorMessage: null, pendingCount: 0 }));
    } else {
      setSyncState((prev) => ({ ...prev, pendingCount: finalCount }));
    }
  }, [refreshRemoteEntries, sheetsService]);

  const syncBeforeWrite = useCallback(
    async (spreadsheetId: string, accessToken: string): Promise<boolean> => {
      if (!navigator.onLine) return false;

      try {
        await retryDirtyQueue();
      } catch (err) {
        console.warn('syncBeforeWrite.retryDirtyQueue failed:', err);
      }

      try {
        await refreshRemoteEntries(spreadsheetId, accessToken);
        return true;
      } catch (err) {
        console.warn('syncBeforeWrite failed:', err);
        return false;
      }
    },
    [refreshRemoteEntries, retryDirtyQueue]
  );

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
    pendingCount: getDirtyQueue().length,
    sessionExpired: false,
  });

  // Keep `pendingCount` and `sessionExpired` in the state object whenever the
  // dirty queue or auth status changes.
  const refreshPendingCount = useCallback(() => {
    setSyncState((prev) => {
      const count = getDirtyQueue().length;
      if (prev.pendingCount === count) return prev;
      return { ...prev, pendingCount: count };
    });
  }, []);

  // Debounce timer map: entry.id → timer handle
  const debounceMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Settings push debounce + suppression flag for incoming sheet→local updates
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressSettingsDirty = useRef(false);

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
            errorMessage: SESSION_EXPIRED,
            sessionExpired: true,
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
            sessionExpired: false,
            pendingCount: getDirtyQueue().length,
          }));
          // Flush any operations queued while we were offline / pre-load.
          void retryDirtyQueue();
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
    const handler = () => {
      void retryDirtyQueue().then(refreshPendingCount);
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isCloudSyncEnabled()) return;
      // Check token health when the user returns to the tab. If expired, surface
      // it immediately so the banner appears before any new edits go out.
      void (async () => {
        const token = await getValidAccessToken();
        if (!token) {
          setSyncState((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: SESSION_EXPIRED,
            sessionExpired: true,
          }));
          return;
        }
        setSyncState((prev) =>
          prev.sessionExpired ? { ...prev, sessionExpired: false, errorMessage: null } : prev,
        );
        void retryDirtyQueue().then(refreshPendingCount);
      })();
    };
    window.addEventListener('online', handler);
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [retryDirtyQueue, refreshPendingCount]);

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
  }, [sheetsService]);

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
        pendingCount: getDirtyQueue().length,
        sessionExpired: false,
      });
      // Flush anything queued while auth was missing.
      void retryDirtyQueue().then(refreshPendingCount);
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
      pendingCount: 0,
      sessionExpired: false,
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
      await retryDirtyQueue();
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
  }, [retryDirtyQueue, sheetsService]);

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

      const queuePayload = op === 'delete' ? entry.id : entry;
      const markDirty = () => {
        addToDirtyQueue({ type: 'lexicon', operation: op, payload: queuePayload });
        setSyncState((prev) => ({
          ...prev,
          status: 'dirty',
          pendingCount: getDirtyQueue().length,
        }));
      };

      const timer = setTimeout(async () => {
        debounceMap.current.delete(entry.id);

        const accessToken = await getValidAccessToken();
        if (!accessToken) {
          // Queue + flag the session as expired so the banner can prompt reconnect.
          addToDirtyQueue({ type: 'lexicon', operation: op, payload: queuePayload });
          setSyncState((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: SESSION_EXPIRED,
            sessionExpired: true,
            pendingCount: getDirtyQueue().length,
          }));
          return;
        }

        const currentConfig = getStorageConfig();
        const spreadsheetId = currentConfig.spreadsheetId;
        if (!spreadsheetId) return;

        const ready = await syncBeforeWrite(spreadsheetId, accessToken);
        if (!ready) {
          markDirty();
          return;
        }

        // Stale-write guard — after syncBeforeWrite merged in the remote rows,
        // compare the merged local row to the pending payload. If the merged
        // version is newer (another device updated this row), drop the push.
        if (op !== 'delete') {
          try {
            const localRaw = localStorage.getItem(getEntriesStorageKey());
            const localEntries: LexisEntry[] = localRaw ? (JSON.parse(localRaw) as LexisEntry[]) : [];
            const merged = localEntries.find((e) => e.id === entry.id);
            if (merged && merged.updatedAt > entry.updatedAt) {
              // Remote is newer — our payload is stale. Skip the write.
              setSyncState((prev) => ({ ...prev, pendingCount: getDirtyQueue().length }));
              return;
            }
          } catch {
            // best-effort guard — fall through to write
          }
        } else {
          // Delete guard: if remote has a newer version, don't delete it.
          try {
            const localRaw = localStorage.getItem(getEntriesStorageKey());
            const localEntries: LexisEntry[] = localRaw ? (JSON.parse(localRaw) as LexisEntry[]) : [];
            const merged = localEntries.find((e) => e.id === entry.id);
            if (merged && merged.updatedAt > entry.updatedAt) {
              setSyncState((prev) => ({ ...prev, pendingCount: getDirtyQueue().length }));
              return;
            }
          } catch {
            // fall through
          }
        }

        try {
          if (op === 'add') {
            await sheetsService.writeLexiconRow(spreadsheetId, entry, accessToken);
          } else if (op === 'update') {
            await sheetsService.updateLexiconRow(spreadsheetId, entry, accessToken);
          } else if (op === 'delete') {
            await sheetsService.deleteLexiconRow(spreadsheetId, entry.id, accessToken);
          }
          setSyncState((prev) => ({
            ...prev,
            pendingCount: getDirtyQueue().length,
            sessionExpired: false,
          }));
        } catch (err) {
          console.error('pushEntry failed:', err);
          markDirty();
        }
      }, 1000);

      debounceMap.current.set(entry.id, timer);
    },
    [syncBeforeWrite, sheetsService]
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
        setSyncState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: SESSION_EXPIRED,
          sessionExpired: true,
          pendingCount: getDirtyQueue().length,
        }));
        return;
      }

      const currentConfig = getStorageConfig();
      const spreadsheetId = currentConfig.spreadsheetId;
      if (!spreadsheetId) return;

      try {
        await retryDirtyQueue();
        await sheetsService.appendQuizSession(spreadsheetId, session, accessToken);
        setSyncState((prev) => ({
          ...prev,
          pendingCount: getDirtyQueue().length,
          sessionExpired: false,
        }));
      } catch (err) {
        console.error('pushQuizSession failed:', err);
        addToDirtyQueue({ type: 'quiz_history', operation: 'add', payload: session });
        setSyncState((prev) => ({
          ...prev,
          status: 'dirty',
          pendingCount: getDirtyQueue().length,
        }));
      }
    })();
  }, [retryDirtyQueue, sheetsService]);

  const pushStreakEvent = useCallback((event: StreakEvent) => {
    if (!isCloudSyncEnabled()) return;

    void (async () => {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        addToDirtyQueue({ type: 'streak_event', operation: 'add', payload: event });
        setSyncState((prev) => ({ ...prev, status: 'dirty' }));
        return;
      }

      const currentConfig = getStorageConfig();
      const spreadsheetId = currentConfig.spreadsheetId;
      if (!spreadsheetId) return;

      try {
        await retryDirtyQueue();
        await sheetsService.appendStreakEvent(spreadsheetId, event, accessToken);
      } catch (err) {
        console.error('pushStreakEvent failed:', err);
        addToDirtyQueue({ type: 'streak_event', operation: 'add', payload: event });
        setSyncState((prev) => ({ ...prev, status: 'dirty' }));
      }
    })();
  }, [retryDirtyQueue, sheetsService]);

  // ---------------------------------------------------------------------------
  // Cleanup debounce timers on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const timers = debounceMap.current;

    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      
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
    pushStreakEvent,
  };
}
