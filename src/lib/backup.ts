/**
 * Local backup snapshots + full export.
 * A snapshot is written before each Google (re)connection so a bad first merge
 * stays recoverable; Settings also offers a downloadable full backup.
 */

import type { LexisEntry } from '@/lib/lexicon';
import type { QuizSessionRecord } from '@/lib/quizHistory';
import { REAL_STORAGE_KEY } from '@/lib/demo';
import { HISTORY_KEY, readArray } from '@/lib/syncQueue';

const BACKUP_PREFIX = 'ordsamling-backup-';
const MAX_BACKUPS = 2;

interface LocalBackup {
  savedAt: number;
  reason: string;
  entries: LexisEntry[];
  quizHistory: QuizSessionRecord[];
}

function readBackupKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(BACKUP_PREFIX)) keys.push(k);
  }
  return keys.sort();
}

/** Persist a snapshot of durable local data; retains at most MAX_BACKUPS. */
export function snapshotLocalData(reason: string): void {
  try {
    const payload: LocalBackup = {
      savedAt: Date.now(),
      reason,
      entries: readArray<LexisEntry>(REAL_STORAGE_KEY),
      quizHistory: readArray<QuizSessionRecord>(HISTORY_KEY),
    };
    localStorage.setItem(`${BACKUP_PREFIX}${payload.savedAt}`, JSON.stringify(payload));
    const stale = readBackupKeys();
    for (const key of stale.slice(0, Math.max(0, stale.length - MAX_BACKUPS))) {
      localStorage.removeItem(key);
    }
  } catch {
    // Best-effort: quota or serialization failures must not break sign-in.
  }
}
