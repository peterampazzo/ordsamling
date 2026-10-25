/**
 * migration.ts — Connect local data to Google Sheets without discarding either copy.
 */

import type { LexisEntry } from '@/lib/lexicon';
import type { QuizSessionRecord } from '@/lib/quizHistory';
import { GoogleSheetsService } from '@/services/GoogleSheetsService';
import { getStoredEmail } from '@/lib/googleOAuth';
import { getStorageConfig, setStorageConfig } from '@/lib/storageConfig';
import { getExtraLanguages } from '@/lib/settings';
import { REAL_STORAGE_KEY } from '@/lib/demo';
import { sameContent } from './syncMerge';
import {
  DATA_OWNER_KEY, HISTORY_KEY, enqueue, migrateLegacyQueue, readArray, readBaseline, readJson,
  readQueue, scopeId, withStorageLock, writeBaseline, type SyncScope,
} from './syncQueue';

export class AccountSwitchRequired extends Error {
  constructor(public readonly previousEmail: string, public readonly nextEmail: string) {
    super(`Choose whether to import local data from ${previousEmail} into ${nextEmail}.`);
  }
}

// ---------------------------------------------------------------------------
// Drive file search
// ---------------------------------------------------------------------------

/**
 * Search the user's Drive for an existing "Ordsamling Data" spreadsheet.
 * Returns the first matching file's id, or null if none found.
 * Throws on non-2xx response.
 */
export async function findExistingSpreadsheet(accessToken: string): Promise<string | null> {
  const url =
    "https://www.googleapis.com/drive/v3/files" +
    "?q=name%3D'Ordsamling+Data'+and+mimeType%3D'application%2Fvnd.google-apps.spreadsheet'+and+trashed%3Dfalse" +
    "&fields=files(id,name)" +
    "&spaces=drive";

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Drive API error ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as { files?: Array<{ id: string; name: string }> };
  const files = data.files ?? [];
  return files.length > 0 ? files[0].id : null;
}

// ---------------------------------------------------------------------------
// Main migration function
// ---------------------------------------------------------------------------

/**
 * Reuse an existing spreadsheet and queue local differences for reconciliation.
 */
export async function runMigration(
  accessToken: string,
  entries: LexisEntry[],
  history: QuizSessionRecord[],
  accountSwitch?: 'import' | 'separate',
): Promise<{ spreadsheetId: string; email: string }> {
  const sheetsService = new GoogleSheetsService();

  // Step 1: Fetch user email
  let email = getStoredEmail();
  if (!email) {
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoResponse.ok) {
      throw new Error(`Failed to fetch user info: ${userInfoResponse.status}`);
    }
    const userInfo = (await userInfoResponse.json()) as { email: string };
    email = userInfo.email;
  }

  if (!email) throw new Error('Google did not return an account email.');
  const config = getStorageConfig();
  const owner = readJson<SyncScope | null>(DATA_OWNER_KEY, null) ??
    (config.connectedEmail && config.spreadsheetId ? { email: config.connectedEmail, spreadsheetId: config.spreadsheetId } : null);
  if (owner && owner.email !== email && !accountSwitch) throw new AccountSwitchRequired(owner.email, email);

  // Step 2: Search Drive for existing spreadsheet
  let spreadsheetId = await findExistingSpreadsheet(accessToken);

  // Step 3: Create new spreadsheet if not found
  if (!spreadsheetId) {
    spreadsheetId = await sheetsService.createSpreadsheet(accessToken);
  }

  // Step 4: Ensure tabs exist
  await sheetsService.ensureTabsExist(spreadsheetId, accessToken);

  const scope: SyncScope = { spreadsheetId, email };
  const reconcile = async () => {
    const remoteEntries = await sheetsService.readLexicon(spreadsheetId, accessToken);
    const remoteHistory = await sheetsService.readQuizHistory(spreadsheetId, accessToken);
    const remoteSettings = await sheetsService.readSettings(spreadsheetId, accessToken);
    await withStorageLock(() => {
      let localEntries = localStorage.getItem(REAL_STORAGE_KEY) ? readArray<LexisEntry>(REAL_STORAGE_KEY) : entries;
      let localHistory = localStorage.getItem(HISTORY_KEY) ? readArray<QuizSessionRecord>(HISTORY_KEY) : history;
      let extraLanguages = getExtraLanguages();
      if (owner && scopeId(owner) !== scopeId(scope)) {
        localStorage.setItem(`ordsamling-account-backup:${scopeId(owner)}`, JSON.stringify({
          entries: localEntries, history: localHistory, extraLanguages,
        }));
        if (accountSwitch === 'separate') {
          const archived = readJson(`ordsamling-account-backup:${scopeId(scope)}`, {
            entries: [] as LexisEntry[], history: [] as QuizSessionRecord[], extraLanguages: [] as string[],
          });
          localEntries = archived.entries;
          localHistory = archived.history;
          extraLanguages = archived.extraLanguages;
        }
      } else migrateLegacyQueue(scope);
      const pending = readQueue(scope);
      const pendingIds = new Set(pending.filter(op => op.type === 'lexicon')
        .map(op => typeof op.payload === 'string' ? op.payload : (op.payload as LexisEntry).id));
      const baseline = readBaseline(scope);
      const merged = new Map(remoteEntries.map(entry => [entry.id, entry]));
      for (const entry of localEntries) {
        const remote = merged.get(entry.id);
        if (pendingIds.has(entry.id)) merged.set(entry.id, entry);
        else if (!sameContent(entry, remote) && !sameContent(entry, baseline.entries[entry.id])) {
          enqueue(scope, {
            type: 'lexicon', operation: remote ? 'update' : 'add', payload: entry,
            baseline: baseline.entries[entry.id] ?? (remote ? undefined : null),
          });
          pendingIds.add(entry.id);
          merged.set(entry.id, entry);
        }
      }
      for (const operation of pending.filter(op => op.type === 'lexicon')) {
        if (operation.operation === 'delete') merged.delete(typeof operation.payload === 'string' ? operation.payload : (operation.payload as LexisEntry).id);
        else {
          const entry = operation.payload as LexisEntry;
          merged.set(entry.id, entry);
        }
      }
      const remoteSessionIds = new Set(remoteHistory.map(session => session.id));
      const queuedSessionIds = new Set(pending.filter(op => op.type === 'quiz_history').map(op => (op.payload as QuizSessionRecord).id));
      for (const session of localHistory) {
        if (!remoteSessionIds.has(session.id) && !queuedSessionIds.has(session.id)) {
          enqueue(scope, { type: 'quiz_history', operation: 'add', payload: session });
        }
      }
      if (remoteSettings.present === false && !pending.some(op => op.type === 'settings')) {
        enqueue(scope, { type: 'settings', operation: 'update', payload: { extraLanguages }, baseline: null });
      }
      for (const entry of remoteEntries) {
        if (!pendingIds.has(entry.id)) baseline.entries[entry.id] = entry;
      }
      if (!pending.some(op => op.type === 'settings')) baseline.settings = remoteSettings.present === false ? null : remoteSettings;
      const historyById = new Map([...localHistory, ...remoteHistory].map(session => [session.id, session]));
      localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify([...merged.values()]));
      localStorage.setItem(HISTORY_KEY, JSON.stringify([...historyById.values()].sort((a, b) => b.date - a.date).slice(0, 50)));
      writeBaseline(scope, baseline);
      localStorage.setItem(DATA_OWNER_KEY, JSON.stringify(scope));
      setStorageConfig({
        storageSource: 'google_sheets', spreadsheetId, connectedEmail: email, oauthTokenExpiry: null,
      });
    });
  };
  if (navigator.locks) await navigator.locks.request(`ordsamling-sync:${scopeId(scope)}`, reconcile);
  else await reconcile();

  return { spreadsheetId, email };
}
