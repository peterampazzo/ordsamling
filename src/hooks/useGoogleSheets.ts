/**
 * useGoogleSheets — SyncEngine hook.
 *
 * Orchestrates the local-first sync lifecycle:
 * - Reads from Sheets on mount and merges into localStorage
 * - Debounces network writes after recording durable local operations
 * - Tracks dirty state and retries on reconnect
 */

import { useContext, useSyncExternalStore } from 'react';
import { GoogleSheetsContext } from '@/lib/syncContext';

export { detectConflict, mergeSheetsIntoLocal } from '@/lib/syncMerge';
export type { MergeOptions } from '@/lib/syncMerge';
export type { SyncState, PullResult } from '@/services/SyncEngine';

export function useGoogleSheets() {
  const engine = useContext(GoogleSheetsContext);
  if (!engine) throw new Error('useGoogleSheets must be used inside GoogleSheetsProvider.');
  const syncState = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  return {
    syncState,
    connect: engine.connect,
    disconnect: engine.disconnect,
    syncNow: engine.syncNow,
    pushEntry: engine.pushEntry,
    pushQuizSession: engine.pushQuizSession,
    pushStreakEvent: engine.pushStreakEvent,
    resolveConflict: engine.resolveConflict,
  };
}
