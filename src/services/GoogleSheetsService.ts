/**
 * GoogleSheetsService — all read/write operations against the "Ordsamling Data"
 * Google Spreadsheet. Stateless: every method takes an accessToken parameter.
 *
 * All API calls use native fetch with exponential-backoff retry on 429 responses.
 */

import type { LexisEntry, EntryType } from '@/lib/lexicon';
import { normalizeEntryType } from '@/lib/lexicon';
import type { QuizSessionRecord, QuizAnswerRecord } from '@/lib/quizHistory';
import type { SheetSettings } from '@/lib/sheetTypes';
import { LEXICON_HEADERS, QUIZ_HISTORY_HEADERS, SETTINGS_HEADERS } from '@/lib/sheetTypes';
import type { GeminiModel } from '@/lib/storageConfig';

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

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const err = new Error(
      `Sheets API error ${response.status}: ${response.statusText}`
    ) as SheetsError;
    err.status = response.status;
    throw err;
  }

  // Some endpoints return empty body (e.g. clear)
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a LexisEntry to exactly 8 strings for the Lexicon sheet row.
 * Columns: [ID, Danish, English, Translations(JSON), Type, Grammar(JSON), Notes, CreatedAt]
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
  ];
}

/**
 * Deserialize a Lexicon sheet row back to a LexisEntry.
 * Returns null if row[0] is empty/missing (blank row).
 * Gracefully handles malformed JSON in columns 3 (translations) and 5 (grammar).
 * createdAt falls back to Date.now() if column 7 is not a valid number.
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

  return { id, danish, english, translations, type, grammar, notes, createdAt };
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

  return { id, date, mode, fromLabel, toLabel, score, total, answers };
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
          ['This spreadsheet is managed by Ordsamling (https://ordsamling.pages.dev).'],
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

      if (!existingTitles.has('Lexicon')) {
        tabsToCreate.push({ title: 'Lexicon', headers: LEXICON_HEADERS });
      }
      if (!existingTitles.has('QuizHistory')) {
        tabsToCreate.push({ title: 'QuizHistory', headers: QUIZ_HISTORY_HEADERS });
      }
      if (!existingTitles.has('Settings')) {
        tabsToCreate.push({ title: 'Settings', headers: SETTINGS_HEADERS });
      }

      for (const tab of tabsToCreate) {
        // Add the sheet
        await sheetsRequest(
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
    return withRetry(async () => {
      const result = await sheetsRequest<{ values?: string[][] }>(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Lexicon!A2:H')}`,
        accessToken
      );
      const rows = result.values ?? [];
      return rows.map(deserializeLexiconRow).filter((e): e is LexisEntry => e !== null);
    });
  }

  /**
   * Clear Lexicon!A2:H and write all entries in one values.update call.
   */
  async batchWriteLexicon(
    spreadsheetId: string,
    entries: LexisEntry[],
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      // 1. Clear existing data
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Lexicon!A2:H')}:clear`,
        accessToken,
        { method: 'POST', body: JSON.stringify({}) }
      );

      // 2. Write all rows if any
      if (entries.length > 0) {
        const values = entries.map(serializeLexiconRow);
        await sheetsRequest(
          `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Lexicon!A2')}?valueInputOption=RAW`,
          accessToken,
          { method: 'PUT', body: JSON.stringify({ values }) }
        );
      }
    });
  }

  /**
   * Append a single entry to the Lexicon tab (INSERT_ROWS).
   */
  async writeLexiconRow(
    spreadsheetId: string,
    entry: LexisEntry,
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      const values = [serializeLexiconRow(entry)];
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Lexicon!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        accessToken,
        { method: 'POST', body: JSON.stringify({ values }) }
      );
    });
  }

  /**
   * Find the row for entry.id and update it in place.
   */
  async updateLexiconRow(
    spreadsheetId: string,
    entry: LexisEntry,
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      const result = await sheetsRequest<{ values?: string[][] }>(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Lexicon!A2:H')}`,
        accessToken
      );
      const rows = result.values ?? [];
      const rowIndex = rows.findIndex((r) => r[0] === entry.id);
      if (rowIndex === -1) {
        // Entry not found — append instead
        await this.writeLexiconRow(spreadsheetId, entry, accessToken);
        return;
      }
      // Sheet row number: data starts at row 2, so rowIndex 0 → row 2
      const sheetRow = rowIndex + 2;
      const values = [serializeLexiconRow(entry)];
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(`Lexicon!A${sheetRow}`)}?valueInputOption=RAW`,
        accessToken,
        { method: 'PUT', body: JSON.stringify({ values }) }
      );
    });
  }

  /**
   * Find the row for entryId and delete it via batchUpdate deleteDimension.
   */
  async deleteLexiconRow(
    spreadsheetId: string,
    entryId: string,
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      // Need the sheet's numeric sheetId for deleteDimension
      const meta = await sheetsRequest<{
        sheets: Array<{ properties: { title: string; sheetId: number } }>;
      }>(`${SHEETS_BASE}/${spreadsheetId}`, accessToken);

      const lexiconSheet = (meta.sheets ?? []).find(
        (s) => s.properties.title === 'Lexicon'
      );
      if (!lexiconSheet) return;
      const sheetId = lexiconSheet.properties.sheetId;

      const result = await sheetsRequest<{ values?: string[][] }>(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Lexicon!A2:A')}`,
        accessToken
      );
      const idColumn = result.values ?? [];
      const rowIndex = idColumn.findIndex((r) => r[0] === entryId);
      if (rowIndex === -1) return; // not found, nothing to delete

      // Sheet row index (0-based): data starts at row 2 (index 1), so rowIndex 0 → sheet index 1
      const startIndex = rowIndex + 1; // 0-based sheet row index
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex,
                    endIndex: startIndex + 1,
                  },
                },
              },
            ],
          }),
        }
      );
    });
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
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('QuizHistory!A2:H')}`,
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
      const values = [serializeQuizHistoryRow(session)];
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('QuizHistory!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        accessToken,
        { method: 'POST', body: JSON.stringify({ values }) }
      );
    });
  }

  /**
   * Clear QuizHistory!A2:H and write all sessions in one values.update call.
   */
  async batchWriteQuizHistory(
    spreadsheetId: string,
    sessions: QuizSessionRecord[],
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('QuizHistory!A2:H')}:clear`,
        accessToken,
        { method: 'POST', body: JSON.stringify({}) }
      );

      if (sessions.length > 0) {
        const values = sessions.map(serializeQuizHistoryRow);
        await sheetsRequest(
          `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('QuizHistory!A2')}?valueInputOption=RAW`,
          accessToken,
          { method: 'PUT', body: JSON.stringify({ values }) }
        );
      }
    });
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

      return { extraLanguages };
    });
  }

  /**
   * Clear Settings!A2:B and write all settings as key-value rows.
   */
  async writeSettings(
    spreadsheetId: string,
    settings: SheetSettings,
    accessToken: string
  ): Promise<void> {
    return withRetry(async () => {
      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Settings!A2:B')}:clear`,
        accessToken,
        { method: 'POST', body: JSON.stringify({}) }
      );

      const values: string[][] = [
        ['extraLanguages', JSON.stringify(settings.extraLanguages)],
      ];

      await sheetsRequest(
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent('Settings!A2')}?valueInputOption=RAW`,
        accessToken,
        { method: 'PUT', body: JSON.stringify({ values }) }
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { serializeLexiconRow, deserializeLexiconRow };
export { serializeQuizHistoryRow, deserializeQuizHistoryRow };

export default GoogleSheetsService;
