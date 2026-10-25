/**
 * GoogleSheetsService — all read/write operations against the "Ordsamling Data"
 * Google Spreadsheet. Stateless: every method takes an accessToken parameter.
 *
 * All API calls use native fetch with exponential-backoff retry on 429 responses.
 */

import type { LexisEntry, EntryType } from '@/lib/lexicon';
import { normalizeEntryType } from '@/lib/lexicon';
import type { QuizSessionRecord, QuizAnswerRecord } from '@/lib/quizHistory';
import type { SheetSettings, StreakEvent } from '@/lib/sheetTypes';
import { LEXICON_HEADERS, QUIZ_HISTORY_HEADERS, SETTINGS_HEADERS, STREAK_HISTORY_HEADERS } from '@/lib/sheetTypes';
import { dedupeEntries } from '@/lib/syncMerge';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// ---------------------------------------------------------------------------
// withRetry helper (exported)
// ---------------------------------------------------------------------------

/**
 * Retry `fn` up to `maxAttempts` times on 429 rate-limit errors.
 * Uses exponential backoff with random jitter: 100ms, 200ms, 400ms + 0-50ms jitter.
 * Any non-429 error is re-thrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (err instanceof Error && 'requestHandled' in err) throw err;
      attempt++;
      const is429 =
        (err instanceof Error &&
          (err.message.includes('429') ||
            ('status' in err && (err as { status: number }).status === 429))) ||
        (typeof err === 'object' &&
          err !== null &&
          'status' in err &&
          (err as { status: number }).status === 429);

      if (!is429 || attempt >= maxAttempts) {
        throw err;
      }

      const baseDelay = 100 * Math.pow(2, attempt - 1); // 100, 200, 400
      const jitter = Math.floor(Math.random() * 51); // 0-50ms
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    }
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

interface SheetsError extends Error {
  status: number;
  requestHandled?: boolean;
}

async function sheetsRequest<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const method = options.method ?? 'GET';
  const safeToRetry = method === 'GET' || method === 'PUT' || url.includes('/values:batchUpdate');
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        ...options, headers, signal: options.signal ?? controller.signal,
      });
      if (response.ok) {
        // Some endpoints return empty body (e.g. clear)
        const text = await response.text();
        return text ? JSON.parse(text) as T : {} as T;
      }
      if (attempt < 2 && (response.status === 429 || (safeToRetry && response.status >= 500))) {
        const retryAfter = response.headers.get('Retry-After');
        const seconds = retryAfter ? Number(retryAfter) : NaN;
        const requestedDelay = Number.isFinite(seconds)
          ? seconds * 1000
          : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
        await new Promise(resolve => setTimeout(resolve,
          Math.min(30_000, Math.max(requestedDelay || 0, 500 * 2 ** attempt + Math.random() * 200))));
        continue;
      }
      const error = new Error(`Sheets API error ${response.status}: ${response.statusText}`) as SheetsError;
      error.status = response.status;
      throw error;
    } catch (error) {
      if (safeToRetry && attempt < 2 && error instanceof TypeError) {
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      throw Object.assign(error instanceof Error ? error : new Error('Sheets request failed'), { requestHandled: true });
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a LexisEntry to exactly 9 strings for the Lexicon sheet row.
 * Columns: [ID, Danish, English, Translations(JSON), Type, Grammar(JSON), Notes, CreatedAt, UpdatedAt]
 */
function serializeLexiconRow(entry: LexisEntry): string[] {
  return [
    entry.id,
    entry.danish,
    entry.english,
    entry.translations !== undefined ? JSON.stringify(entry.translations) : '',
    entry.type,
    entry.grammar !== undefined ? JSON.stringify(entry.grammar) : '',
    entry.notes,
    String(entry.createdAt),
    String(entry.updatedAt),
  ];
}

/**
 * Deserialize a Lexicon sheet row back to a LexisEntry.
 * Returns null if row[0] is empty/missing (blank row).
 * Gracefully handles malformed JSON in columns 3 (translations) and 5 (grammar).
 * createdAt falls back to Date.now() if column 7 is not a valid number.
 * updatedAt falls back to createdAt if column 8 is missing (for backward compatibility).
 */
function deserializeLexiconRow(row: string[]): LexisEntry | null {
  if (!row || !row[0]) return null;

  const id = row[0];
  const danish = row[1] ?? '';
  const english = row[2] ?? '';

  let translations: Record<string, string> | undefined;
  const translationsRaw = row[3] ?? '';
  if (translationsRaw) {
    try {
      const parsed = JSON.parse(translationsRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        translations = parsed as Record<string, string>;
      }
    } catch {
      // malformed JSON → undefined
    }
  }

  const type: EntryType = normalizeEntryType(row[4] ?? '');

  let grammar: LexisEntry['grammar'];
  const grammarRaw = row[5] ?? '';
  if (grammarRaw) {
    try {
      const parsed = JSON.parse(grammarRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        grammar = parsed as LexisEntry['grammar'];
      }
    } catch {
      // malformed JSON → undefined
    }
  }

  const notes = row[6] ?? '';

  const createdAtRaw = row[7] ?? '';
  const createdAtNum = Number(createdAtRaw);
  const createdAt = Number.isFinite(createdAtNum) && createdAtNum > 0 ? createdAtNum : Date.now();

  // updatedAt: fall back to createdAt for backward compatibility with old entries
  const updatedAtRaw = row[8] ?? '';
  const updatedAtNum = Number(updatedAtRaw);
  const updatedAt = Number.isFinite(updatedAtNum) && updatedAtNum > 0 ? updatedAtNum : createdAt;

  return { id, danish, english, translations, type, grammar, notes, createdAt, updatedAt };
}

/**
 * Serialize a QuizSessionRecord to exactly 8 strings for the QuizHistory sheet row.
 * Columns: [ID, Date, Mode, FromLabel, ToLabel, Score, Total, Answers(JSON)]
 */
function serializeQuizHistoryRow(session: QuizSessionRecord): string[] {
  return [
    session.id,
    String(session.date),
    session.mode,
    session.fromLabel,
    session.toLabel,
    String(session.score),
    String(session.total),
    JSON.stringify(session.answers),
    ...(session.exercise ? [session.exercise] : []),
  ];
}

function serializeStreakEventRow(event: StreakEvent): string[] {
  return [
    String(event.timestamp),
    event.type,
    event.deviceId ?? '',
    event.notes ?? '',
    ...(event.id ? [event.id] : []),
  ];
}

/**
 * Deserialize a QuizHistory sheet row back to a QuizSessionRecord.
 * Returns null if row[0] is empty/missing.
 * Gracefully handles malformed JSON in the answers column.
 */
function deserializeQuizHistoryRow(row: string[]): QuizSessionRecord | null {
  if (!row || !row[0]) return null;

  const id = row[0];
  const date = Number(row[1] ?? '0') || 0;
  const mode = (row[2] ?? 'choice') as QuizSessionRecord['mode'];
  const fromLabel = row[3] ?? '';
  const toLabel = row[4] ?? '';
  const score = Number(row[5] ?? '0') || 0;
  const total = Number(row[6] ?? '0') || 0;

  let answers: QuizAnswerRecord[] = [];
  const answersRaw = row[7] ?? '';
  if (answersRaw) {
    try {
      const parsed = JSON.parse(answersRaw);
      if (Array.isArray(parsed)) {
        answers = parsed as QuizAnswerRecord[];
      }
    } catch {
      // malformed JSON → empty array
    }
  }

  const exercise = row[8] as QuizSessionRecord['exercise'];
  return {
    id, date, mode, fromLabel, toLabel, score, total, answers,
    ...(['vocabulary', 'verbs', 'numbers', 'articles'].includes(exercise) ? { exercise } : {}),
  };
}

export interface LexiconSnapshot {
  rows: string[][];
  entries: LexisEntry[];
}

export interface LexiconChange {
  id: string;
  entry: LexisEntry | null;
}

// ---------------------------------------------------------------------------
// GoogleSheetsService class
// ---------------------------------------------------------------------------

export class GoogleSheetsService {
  // -------------------------------------------------------------------------
  // Spreadsheet lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a new "Ordsamling Data" spreadsheet.
   * Returns the new spreadsheetId.
   */
  async createSpreadsheet(accessToken: string): Promise<string> {
    return withRetry(async () => {
      // Create the spreadsheet — Google always adds a default "Sheet1"
      const body = {
        properties: { title: 'Ordsamling Data' },
      };
      const result = await sheetsRequest<{ spreadsheetId: string; sheets: Array<{ properties: { sheetId: number; title: string } }> }>(
        SHEETS_BASE,
        accessToken,
        { method: 'POST', body: JSON.stringify(body) }
      );
      const spreadsheetId = result.spreadsheetId;

      // Rename the default Sheet1 to "About" and write a notice
      const sheet1 = result.sheets?.[0];
      if (sheet1) {
        const sheetId = sheet1.properties.sheetId;
        await sheetsRequest(
          `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
          accessToken,
          {
            method: 'POST',
            body: JSON.stringify({
              requests: [
                {
                  updateSheetProperties: {
                    properties: { sheetId, title: 'About' },
                    fields: 'title',
                  },
                },
              ],
            }),
          }
        );

        const now = new Date().toISOString().slice(0, 10);
        const notice = [
          ['This spreadsheet is managed by Ordsamling (https://ordsamling.peterampazzo.com).'],
          ['Do not edit the Lexicon, QuizHistory, or Settings tabs manually — changes may be overwritten.'],
          [''],
          [`Created: ${now}`],
          ['Source: https://github.com/peterampazzo/ordsamling'],
        ];
        await sheetsRequest(
          `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('About!A1')}?valueInputOption=RAW`,
          accessToken,
          { method: 'PUT', body: JSON.stringify({ values: notice }) }
        );
      }

      return spreadsheetId;
    });
  }

  /**
   * Ensure the three required tabs (Lexicon, QuizHistory, Settings) exist.
   * For each missing tab: adds the sheet, then writes the header row.
   */
  async ensureTabsExist(spreadsheetId: string, accessToken: string): Promise<void> {
    return withRetry(async () => {
      // Fetch existing sheet metadata
      const meta = await sheetsRequest<{
        sheets: Array<{ properties: { title: string } }>;
      }>(`${SHEETS_BASE}/${spreadsheetId}`, accessToken);

      const existingTitles = new Set(
        (meta.sheets ?? []).map((s) => s.properties.title)
      );

      const tabsToCreate: Array<{
        title: string;
        headers: readonly string[];
      }> = [];

      tabsToCreate.push(
        { title: 'Lexicon', headers: LEXICON_HEADERS },
        { title: 'QuizHistory', headers: QUIZ_HISTORY_HEADERS },
        { title: 'StreakHistory', headers: STREAK_HISTORY_HEADERS },
        { title: 'Settings', headers: SETTINGS_HEADERS },
      );

      for (const tab of tabsToCreate) {
        // Add the sheet
        if (!existingTitles.has(tab.title)) await sheetsRequest(
          `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
          accessToken,
          {
            method: 'POST',
            body: JSON.stringify({
              requests: [{ addSheet: { properties: { title: tab.title } } }],
            }),
          }
        );

        // Write header row
        await sheetsRequest(
          `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(tab.title + '!A1')}?valueInputOption=RAW`,
          accessToken,
          {
            method: 'PUT',
            body: JSON.stringify({ values: [tab.headers] }),
          }
        );
      }
    });
  }

  // -------------------------------------------------------------------------
  // Lexicon tab
  // -------------------------------------------------------------------------

  /**
   * Read all entries from the Lexicon tab (A2:H, skipping header row).
   */
  async readLexicon(spreadsheetId: string, accessToken: string): Promise<LexisEntry[]> {
    return (await this.readLexiconSnapshot(spreadsheetId, accessToken)).entries;
  }

  async readLexiconSnapshot(spreadsheetId: string, accessToken: string): Promise<LexiconSnapshot> {
    const result = await sheetsRequest<{ values?: string[][] }>(
      `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Lexicon!A2:I')}`, accessToken,
    );
    const rows = result.values ?? [];
    return {
      rows,
      entries: dedupeEntries(rows.map(deserializeLexiconRow).filter((entry): entry is LexisEntry => entry !== null)),
    };
  }

  async applyLexiconChanges(
    spreadsheetId: string,
    changes: LexiconChange[],
    accessToken: string,
    snapshot?: LexiconSnapshot,
  ): Promise<void> {
    const { rows } = snapshot ?? await this.readLexiconSnapshot(spreadsheetId, accessToken);
    const updates: Array<{ range: string; values: string[][] }> = [];
    const additions: string[][] = [];
    for (const change of changes) {
      const indices = rows.flatMap((row, index) => row[0] === change.id ? [index] : []);
      if (indices.length === 0 && change.entry) additions.push(serializeLexiconRow(change.entry));
      for (let i = 0; i < indices.length; i++) {
        updates.push({
          range: `Lexicon!A${indices[i] + 2}:I${indices[i] + 2}`,
          values: [i === 0 && change.entry ? serializeLexiconRow(change.entry) : Array(9).fill('')],
        });
      }
    }
    if (updates.length) {
      await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, accessToken, {
        method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
      });
    }
    if (additions.length) {
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(`Lexicon!A${rows.length + 2}:I`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        accessToken, { method: 'POST', body: JSON.stringify({ values: additions }) },
      );
    }
  }

  /**
   * Reconcile a set of entries without clearing remote-only rows.
   */
  async batchWriteLexicon(
    spreadsheetId: string,
    entries: LexisEntry[],
    accessToken: string
  ): Promise<void> {
    await this.applyLexiconChanges(spreadsheetId, entries.map(entry => ({ id: entry.id, entry })), accessToken);
  }

  /**
   * Append a single entry to the Lexicon tab (INSERT_ROWS).
   */
  async writeLexiconRow(
    spreadsheetId: string,
    entry: LexisEntry,
    accessToken: string
  ): Promise<void> {
    await this.applyLexiconChanges(spreadsheetId, [{ id: entry.id, entry }], accessToken);
  }

  /**
   * Find the row for entry.id and update it in place.
   */
  async updateLexiconRow(
    spreadsheetId: string,
    entry: LexisEntry,
    accessToken: string
  ): Promise<void> {
    await this.applyLexiconChanges(spreadsheetId, [{ id: entry.id, entry }], accessToken);
  }

  /**
   * Clear rows for entryId without shifting other entries' row positions.
   */
  async deleteLexiconRow(
    spreadsheetId: string,
    entryId: string,
    accessToken: string
  ): Promise<void> {
    await this.applyLexiconChanges(spreadsheetId, [{ id: entryId, entry: null }], accessToken);
  }

  // -------------------------------------------------------------------------
  // QuizHistory tab
  // -------------------------------------------------------------------------

  /**
   * Read all sessions from the QuizHistory tab (A2:H, skipping header row).
   */
  async readQuizHistory(
    spreadsheetId: string,
    accessToken: string
  ): Promise<QuizSessionRecord[]> {
    return withRetry(async () => {
      const result = await sheetsRequest<{ values?: string[][] }>(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('QuizHistory!A2:I')}`,
        accessToken
      );
      const rows = result.values ?? [];
      return rows
        .map(deserializeQuizHistoryRow)
        .filter((s): s is QuizSessionRecord => s !== null);
    });
  }

  /**
   * Append a single quiz session to the QuizHistory tab.
   */
  async appendQuizSession(
    spreadsheetId: string,
    session: QuizSessionRecord,
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      const existing = await this.readQuizHistory(spreadsheetId, accessToken);
      if (existing.some(item => item.id === session.id)) return;
      const values = [serializeQuizHistoryRow(session)];
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('QuizHistory!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        accessToken,
        { method: 'POST', body: JSON.stringify({ values }) }
      );
    });
  }

  async appendStreakEvent(
    spreadsheetId: string,
    event: StreakEvent,
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      const existing = await sheetsRequest<{ values?: string[][] }>(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('StreakHistory!A2:E')}`, accessToken,
      );
      if ((existing.values ?? []).some(row => event.id
        ? row[4] === event.id
        : row[0] === String(event.timestamp) && row[1] === event.type && (row[2] || '') === (event.deviceId || ''))) return;
      const values = [serializeStreakEventRow(event)];
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('StreakHistory!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        accessToken,
        { method: 'POST', body: JSON.stringify({ values }) }
      );
    });
  }

  /**
   * Append sessions that are not already present, preserving remote history.
   */
  async batchWriteQuizHistory(
    spreadsheetId: string,
    sessions: QuizSessionRecord[],
    accessToken: string
  ): Promise<void> {
    const existingIds = new Set((await this.readQuizHistory(spreadsheetId, accessToken)).map(session => session.id));
    const values = sessions.filter(session => !existingIds.has(session.id)).map(serializeQuizHistoryRow);
    if (values.length) {
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('QuizHistory!A2:I')}:append?valueInputOption=RAW`,
        accessToken, { method: 'POST', body: JSON.stringify({ values }) },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Settings tab
  // -------------------------------------------------------------------------

  /**
   * Read Settings!A2:B and parse key-value rows into a SheetSettings object.
   * Returns defaults for missing keys.
   */
  async readSettings(spreadsheetId: string, accessToken: string): Promise<SheetSettings> {
    return withRetry(async () => {
      const result = await sheetsRequest<{ values?: string[][] }>(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Settings!A2:B')}`,
        accessToken
      );
      const rows = result.values ?? [];

      const map = new Map<string, string>();
      for (const row of rows) {
        if (row[0]) map.set(row[0], row[1] ?? '');
      }

      // Parse extraLanguages
      let extraLanguages: string[] = [];
      const extraLangRaw = map.get('extraLanguages');
      if (extraLangRaw) {
        try {
          const parsed = JSON.parse(extraLangRaw);
          if (Array.isArray(parsed)) extraLanguages = parsed as string[];
        } catch {
          // ignore malformed
        }
      }

      return {
        extraLanguages,
        present: map.has('extraLanguages'),
        ...(map.has('uiLang') ? { uiLang: map.get('uiLang') } : {}),
      };
    });
  }

  /**
   * Update known settings while preserving other keys.
   */
  async writeSettings(
    spreadsheetId: string,
    settings: SheetSettings,
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      const existing = await sheetsRequest<{ values?: string[][] }>(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Settings!A2:B')}`, accessToken,
      );
      const rows = existing.values ?? [];
      const values = new Map(rows.filter(row => row[0]).map(row => [row[0], row[1] ?? '']));
      values.set('extraLanguages', JSON.stringify(settings.extraLanguages));
      if (settings.uiLang !== undefined) values.set('uiLang', settings.uiLang);
      const nextRows = [...values.entries()];
      while (nextRows.length < rows.length) nextRows.push(['', '']);
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Settings!A2')}?valueInputOption=RAW`,
        accessToken,
        { method: 'PUT', body: JSON.stringify({ values: nextRows }) }
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { serializeLexiconRow, deserializeLexiconRow };
export { serializeQuizHistoryRow, deserializeQuizHistoryRow };
export { serializeStreakEventRow };

export default GoogleSheetsService;
