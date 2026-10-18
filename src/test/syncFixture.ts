import { vi } from 'vitest';
import { SyncEngine } from '@/services/SyncEngine';
import { GoogleSheetsService, type LexiconChange } from '@/services/GoogleSheetsService';
import { setStorageConfig } from '@/lib/storageConfig';
import * as oauth from '@/lib/googleOAuth';
import type { LexisEntry } from '@/lib/lexicon';
import type { QuizSessionRecord } from '@/lib/quizHistory';
import type { SheetSettings } from '@/lib/sheetTypes';

export const scope = { spreadsheetId: 'sheet-id', email: 'user@example.com' };

export function entry(id = 'entry', danish = 'hund'): LexisEntry {
  return { id, danish, english: 'dog', notes: '', type: 'noun', createdAt: 1000, updatedAt: 1000 };
}

export function session(id = 'session'): QuizSessionRecord {
  return { id, date: Date.now(), mode: 'choice', fromLabel: 'Danish', toLabel: 'English', score: 1, total: 1, answers: [] };
}

export function installLocks(): void {
  const locks = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: <T>(name: string, action: () => T | Promise<T>): Promise<T> => {
        const next = (locks.get(name) ?? Promise.resolve()).then(action, action);
        locks.set(name, next.catch(() => {}));
        return next;
      },
    },
  });
}

export function createSyncFixture() {
  localStorage.clear();
  installLocks();
  vi.useFakeTimers();
  vi.spyOn(oauth, 'getValidAccessToken').mockResolvedValue('token');
  vi.spyOn(oauth, 'initiateOAuthFlow').mockResolvedValue();
  vi.spyOn(oauth, 'revokeOAuthToken').mockResolvedValue();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  setStorageConfig({
    storageSource: 'google_sheets', spreadsheetId: scope.spreadsheetId, connectedEmail: scope.email, oauthTokenExpiry: null,
  });
  const sheets = new GoogleSheetsService();
  let remote: LexisEntry[] = [];
  let settings: SheetSettings = { extraLanguages: [], present: false };
  const read = vi.spyOn(sheets, 'readLexiconSnapshot').mockImplementation(async () => ({
    rows: [], entries: [...remote],
  }));
  const write = vi.spyOn(sheets, 'applyLexiconChanges').mockImplementation(async (_id, changes: LexiconChange[]) => {
    const values = new Map(remote.map(value => [value.id, value]));
    for (const change of changes) {
      if (change.entry) values.set(change.id, change.entry);
      else values.delete(change.id);
    }
    remote = [...values.values()];
  });
  const readSettings = vi.spyOn(sheets, 'readSettings').mockImplementation(async () => settings);
  const writeSettings = vi.spyOn(sheets, 'writeSettings').mockImplementation(async (_id, next) => {
    settings = { ...next, present: true };
  });
  const appendQuiz = vi.spyOn(sheets, 'appendQuizSession').mockResolvedValue();
  const appendStreak = vi.spyOn(sheets, 'appendStreakEvent').mockResolvedValue();
  const engine = new SyncEngine(sheets);
  engine.setEnabled(true);
  const stop = engine.start();
  return {
    engine, sheets, read, write, readSettings, writeSettings, appendQuiz, appendStreak, stop,
    setRemote: (entries: LexisEntry[]) => { remote = entries; },
    getRemote: () => remote,
    setSettings: (next: SheetSettings) => { settings = next; },
    dispose: () => { stop(); vi.restoreAllMocks(); vi.useRealTimers(); },
  };
}
