import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { runMigration, AccountSwitchRequired } from './migration';
import { GoogleSheetsService } from '@/services/GoogleSheetsService';
import * as oauth from './googleOAuth';
import { getStorageConfig, setStorageConfig } from './storageConfig';
import { DATA_OWNER_KEY, HISTORY_KEY, readArray, readQueue, scopeId } from './syncQueue';
import { REAL_STORAGE_KEY } from './demo';
import { entry, installLocks, scope, session } from '@/test/syncFixture';

describe('Connecting and reconnecting to Google Sheets', () => {
  beforeEach(() => {
    localStorage.clear();
    installLocks();
    vi.spyOn(oauth, 'getStoredEmail').mockReturnValue(scope.email);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ files: [{ id: scope.spreadsheetId }] }))));
    vi.spyOn(GoogleSheetsService.prototype, 'ensureTabsExist').mockResolvedValue();
    vi.spyOn(GoogleSheetsService.prototype, 'createSpreadsheet').mockResolvedValue(scope.spreadsheetId);
    vi.spyOn(GoogleSheetsService.prototype, 'readLexicon').mockResolvedValue([]);
    vi.spyOn(GoogleSheetsService.prototype, 'readQuizHistory').mockResolvedValue([]);
    vi.spyOn(GoogleSheetsService.prototype, 'readSettings').mockResolvedValue({ extraLanguages: [], present: false });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('retains an offline local copy and durably queues uploads on first connection', async () => {
    await runMigration('token', [entry()], [session()]);
    expect(readArray(REAL_STORAGE_KEY)).toEqual([entry()]);
    expect(readArray(HISTORY_KEY)).toHaveLength(1);
    expect(readQueue(scope).map(op => op.type)).toEqual(['lexicon', 'quiz_history', 'settings']);
    expect(getStorageConfig().storageSource).toBe('google_sheets');
  });

  it('preserves remote-only vocabulary and history on reconnect', async () => {
    vi.mocked(GoogleSheetsService.prototype.readLexicon).mockResolvedValue([entry('remote')]);
    vi.mocked(GoogleSheetsService.prototype.readQuizHistory).mockResolvedValue([session('remote')]);
    await runMigration('token', [entry('local')], [session('local')]);
    expect(readArray<{ id: string }>(REAL_STORAGE_KEY).map(item => item.id).sort()).toEqual(['local', 'remote']);
    expect(readArray<{ id: string }>(HISTORY_KEY).map(item => item.id).sort()).toEqual(['local', 'remote']);
    expect(GoogleSheetsService.prototype.createSpreadsheet).not.toHaveBeenCalled();
  });

  it('retains differing same-ID local records for conflict resolution, without writing over the sheet', async () => {
    vi.mocked(GoogleSheetsService.prototype.readLexicon).mockResolvedValue([entry('entry', 'remote')]);
    await runMigration('token', [entry('entry', 'local')], []);
    expect(readArray(REAL_STORAGE_KEY)).toEqual([entry('entry', 'local')]);
    expect(readQueue(scope).find(op => op.type === 'lexicon')?.baseline).toBeUndefined();
  });

  it('does not change local data or config if the remote read fails', async () => {
    localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify([entry()]));
    vi.mocked(GoogleSheetsService.prototype.readLexicon).mockRejectedValue(new Error('Offline'));
    await expect(runMigration('token', [entry()], [])).rejects.toThrow('Offline');
    expect(readArray(REAL_STORAGE_KEY)).toEqual([entry()]);
    expect(getStorageConfig().storageSource).toBe('local');
  });

  it('requests an explicit decision before importing another account’s data', async () => {
    localStorage.setItem(DATA_OWNER_KEY, JSON.stringify({ ...scope, email: 'previous@example.com' }));
    await expect(runMigration('token', [entry()], [])).rejects.toBeInstanceOf(AccountSwitchRequired);
    expect(GoogleSheetsService.prototype.ensureTabsExist).not.toHaveBeenCalled();
  });

  it('archives the previous account and does not replay its journal into the new one', async () => {
    const old = { ...scope, email: 'previous@example.com' };
    localStorage.setItem(DATA_OWNER_KEY, JSON.stringify(old));
    localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify([entry('previous')]));
    await runMigration('token', [entry('previous')], [], 'separate');
    expect(readArray(REAL_STORAGE_KEY)).toEqual([]);
    expect(readQueue(scope).some(op => op.type === 'lexicon')).toBe(false);
    expect(JSON.parse(localStorage.getItem(`ordsamling-account-backup:${scopeId(old)}`)!)).toMatchObject({
      entries: [entry('previous')],
    });
  });

  it('does not duplicate the queued operations on a second reconnect', async () => {
    await runMigration('token', [entry()], [session()]);
    const count = readQueue(scope).length;
    await runMigration('token', [entry()], [session()]);
    expect(readQueue(scope)).toHaveLength(count);
  });

  it('keeps a pending deletion absent during reconnect', async () => {
    setStorageConfig({ storageSource: 'google_sheets', spreadsheetId: scope.spreadsheetId, connectedEmail: scope.email, oauthTokenExpiry: null });
    localStorage.setItem('ordsamling-dirty-queue', JSON.stringify([
      { id: 'delete', type: 'lexicon', operation: 'delete', payload: 'entry', timestamp: 1 },
    ]));
    vi.mocked(GoogleSheetsService.prototype.readLexicon).mockResolvedValue([entry()]);
    await runMigration('token', [], []);
    expect(readArray(REAL_STORAGE_KEY)).toEqual([]);
    expect(readQueue(scope).some(op => op.operation === 'delete')).toBe(true);
  });
});
