/**
 * Unit tests for src/lib/migration.ts
 *
 * Tests cover:
 * 1. Successful migration sequence
 * 2. Partial failure rollback (batchWriteLexicon throws)
 * 3. Idempotent reconnect with existing spreadsheet
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock function references for GoogleSheetsService methods.
// These are declared at module scope so they can be referenced inside the
// vi.mock factory (which is hoisted) AND in test bodies.
// We use vi.hoisted() to ensure they are available before the factory runs.
// ---------------------------------------------------------------------------

const {
  mockCreateSpreadsheet,
  mockEnsureTabsExist,
  mockBatchWriteLexicon,
  mockBatchWriteQuizHistory,
  mockWriteSettings,
} = vi.hoisted(() => ({
  mockCreateSpreadsheet: vi.fn(),
  mockEnsureTabsExist: vi.fn(),
  mockBatchWriteLexicon: vi.fn(),
  mockBatchWriteQuizHistory: vi.fn(),
  mockWriteSettings: vi.fn(),
}));

vi.mock('@/services/GoogleSheetsService', () => ({
  GoogleSheetsService: vi.fn().mockImplementation(() => ({
    createSpreadsheet: mockCreateSpreadsheet,
    ensureTabsExist: mockEnsureTabsExist,
    batchWriteLexicon: mockBatchWriteLexicon,
    batchWriteQuizHistory: mockBatchWriteQuizHistory,
    writeSettings: mockWriteSettings,
  })),
}));

const { mockGetStoredEmail } = vi.hoisted(() => ({
  mockGetStoredEmail: vi.fn<() => string | null>(),
}));

vi.mock('@/lib/googleOAuth', () => ({
  getStoredEmail: mockGetStoredEmail,
}));

const { mockSetStorageConfig } = vi.hoisted(() => ({
  mockSetStorageConfig: vi.fn(),
}));

vi.mock('@/lib/storageConfig', () => ({
  setStorageConfig: mockSetStorageConfig,
}));

vi.mock('@/lib/settings', () => ({
  getExtraLanguages: vi.fn(() => []),
  getGeminiModel: vi.fn(() => 'gemini-1.5-flash'),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { runMigration } from './migration';
import type { LexisEntry } from '@/lib/lexicon';
import type { QuizSessionRecord } from '@/lib/quizHistory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(id: string): LexisEntry {
  return {
    id,
    danish: 'hund',
    english: 'dog',
    notes: '',
    type: 'noun',
    createdAt: Date.now(),
  };
}

function makeSession(id: string): QuizSessionRecord {
  return {
    id,
    date: Date.now(),
    mode: 'choice',
    fromLabel: 'Danish',
    toLabel: 'English',
    score: 5,
    total: 10,
    answers: [],
  };
}

const ACCESS_TOKEN = 'test-access-token';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: no existing spreadsheet found in Drive
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ files: [] }),
  });

  // Default: email available from stored tokens
  mockGetStoredEmail.mockReturnValue('test@example.com');

  // Default: all service methods resolve successfully
  mockCreateSpreadsheet.mockResolvedValue('sheet-123');
  mockEnsureTabsExist.mockResolvedValue(undefined);
  mockBatchWriteLexicon.mockResolvedValue(undefined);
  mockBatchWriteQuizHistory.mockResolvedValue(undefined);
  mockWriteSettings.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Test 1: Successful migration sequence
// ---------------------------------------------------------------------------

describe('runMigration — successful migration', () => {
  it('creates spreadsheet, writes data, cuts over, and cleans up localStorage', async () => {
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

    const entries = [makeEntry('entry-1')];
    const history = [makeSession('session-1')];

    const result = await runMigration(ACCESS_TOKEN, entries, history);

    // Returns correct shape
    expect(result).toEqual({ spreadsheetId: 'sheet-123', email: 'test@example.com' });

    // createSpreadsheet was called (no existing sheet)
    expect(mockCreateSpreadsheet).toHaveBeenCalledWith(ACCESS_TOKEN);

    // ensureTabsExist called with new spreadsheet id
    expect(mockEnsureTabsExist).toHaveBeenCalledWith('sheet-123', ACCESS_TOKEN);

    // batchWriteLexicon called with entries
    expect(mockBatchWriteLexicon).toHaveBeenCalledWith('sheet-123', entries, ACCESS_TOKEN);

    // batchWriteQuizHistory called with history
    expect(mockBatchWriteQuizHistory).toHaveBeenCalledWith('sheet-123', history, ACCESS_TOKEN);

    // writeSettings called
    expect(mockWriteSettings).toHaveBeenCalledWith(
      'sheet-123',
      expect.objectContaining({ uiLang: 'en' }),
      ACCESS_TOKEN
    );

    // setStorageConfig called with google_sheets
    expect(mockSetStorageConfig).toHaveBeenCalledWith(
      expect.objectContaining({ storageSource: 'google_sheets', spreadsheetId: 'sheet-123' })
    );

    // localStorage cleanup
    expect(removeItemSpy).toHaveBeenCalledWith('lexikon-entries');
    expect(removeItemSpy).toHaveBeenCalledWith('lexikon-quiz-history');

    removeItemSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Partial failure rollback
// ---------------------------------------------------------------------------

describe('runMigration — partial failure rollback', () => {
  it('does not cut over or clean up when batchWriteLexicon throws', async () => {
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

    const entries = [makeEntry('entry-1')];
    const history = [makeSession('session-1')];

    // Make batchWriteLexicon throw
    mockBatchWriteLexicon.mockRejectedValue(new Error('Upload failed'));

    await expect(runMigration(ACCESS_TOKEN, entries, history)).rejects.toThrow('Upload failed');

    // setStorageConfig must NOT have been called with google_sheets
    expect(mockSetStorageConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({ storageSource: 'google_sheets' })
    );

    // localStorage must NOT have been cleaned up
    expect(removeItemSpy).not.toHaveBeenCalledWith('lexikon-entries');
    expect(removeItemSpy).not.toHaveBeenCalledWith('lexikon-quiz-history');

    removeItemSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Test 3: Idempotent reconnect with existing spreadsheet
// ---------------------------------------------------------------------------

describe('runMigration — idempotent reconnect', () => {
  it('reuses existing spreadsheet and does not call createSpreadsheet', async () => {
    // Drive returns an existing spreadsheet
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: [{ id: 'existing-sheet-id', name: 'Ordsamling Data' }],
      }),
    });

    const result = await runMigration(ACCESS_TOKEN, [], []);

    expect(result).toMatchObject({ spreadsheetId: 'existing-sheet-id' });

    // createSpreadsheet must NOT be called
    expect(mockCreateSpreadsheet).not.toHaveBeenCalled();

    // ensureTabsExist called with the existing id
    expect(mockEnsureTabsExist).toHaveBeenCalledWith('existing-sheet-id', ACCESS_TOKEN);

    // batchWriteLexicon and batchWriteQuizHistory NOT called (empty arrays)
    expect(mockBatchWriteLexicon).not.toHaveBeenCalled();
    expect(mockBatchWriteQuizHistory).not.toHaveBeenCalled();
  });
});
