/**
 * Bug Condition Exploration Test for Settings Sync
 * 
 * Property 1: Bug Condition - Settings Sync Failure
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples that demonstrate the settings sync bug exists.
 * 
 * Bug Condition 1 (from design):
 * - User modifies extra languages via setExtraLanguages()
 * - "ordsamling:settings-dirty" event is dispatched
 * - Settings are NOT pushed to Google Sheets (no writeSettings call)
 * - On sync from another device, local settings are overwritten by empty/outdated sheet settings
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGoogleSheets } from './useGoogleSheets';
import { setExtraLanguages, getExtraLanguages } from '@/lib/settings';
import { GoogleSheetsService } from '@/services/GoogleSheetsService';
import * as googleOAuth from '@/lib/googleOAuth';
import * as storageConfig from '@/lib/storageConfig';

// Mock dependencies
vi.mock('@/services/GoogleSheetsService');
vi.mock('@/lib/googleOAuth');
vi.mock('@/lib/storageConfig');
vi.mock('@/lib/demo', () => ({
  getEntriesStorageKey: () => 'test-entries-key',
}));

describe('Bug Condition Exploration: Settings Sync Failure', () => {
  let mockWriteSettings: ReturnType<typeof vi.fn>;
  let mockReadSettings: ReturnType<typeof vi.fn>;
  let mockReadLexicon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
    
    // Setup mocks
    mockWriteSettings = vi.fn().mockResolvedValue(undefined);
    mockReadSettings = vi.fn().mockResolvedValue({ extraLanguages: [] });
    mockReadLexicon = vi.fn().mockResolvedValue([]);

    vi.mocked(GoogleSheetsService).mockImplementation(() => ({
      writeSettings: mockWriteSettings,
      readSettings: mockReadSettings,
      readLexicon: mockReadLexicon,
      writeLexiconRow: vi.fn(),
      updateLexiconRow: vi.fn(),
      deleteLexiconRow: vi.fn(),
      appendQuizSession: vi.fn(),
    } as unknown as GoogleSheetsService));

    vi.mocked(googleOAuth.getValidAccessToken).mockResolvedValue('mock-token');
    
    vi.mocked(storageConfig.getStorageConfig).mockReturnValue({
      storageSource: 'google_sheets',
      spreadsheetId: 'test-sheet-id',
      connectedEmail: 'test@example.com',
      oauthTokenExpiry: null,
    });

    vi.mocked(storageConfig.isCloudSyncEnabled).mockReturnValue(true);
    vi.mocked(storageConfig.getDirtyQueue).mockReturnValue([]);
    vi.mocked(storageConfig.setDirtyQueue).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Bug Condition 1.1: setExtraLanguages dispatches event but writeSettings is NOT called', async () => {
    // Render the hook to initialize sync
    renderHook(() => useGoogleSheets());

    // Wait for initial sync to complete
    await waitFor(() => {
      expect(mockReadLexicon).toHaveBeenCalled();
    });

    // Reset mock call counts after initial sync
    mockWriteSettings.mockClear();

    // User adds Italian to extra languages
    setExtraLanguages(['it']);

    // Wait for debounce period (2 seconds + buffer)
    await new Promise(resolve => setTimeout(resolve, 2500));

    // EXPECTED TO FAIL ON UNFIXED CODE:
    // writeSettings should be called after debounce, but it won't be because
    // there's no listener for "ordsamling:settings-dirty" event
    expect(mockWriteSettings).toHaveBeenCalledWith(
      'test-sheet-id',
      { extraLanguages: ['it'] },
      'mock-token'
    );
  });

  it('Bug Condition 1.2: Local extraLanguages overwritten by empty sheet settings on load', async () => {
    // Setup: User has Italian and French configured locally
    localStorage.setItem('ordsamling-extra-languages', JSON.stringify(['it', 'fr']));

    // Mock sheet returns empty settings
    mockReadSettings.mockResolvedValue({ extraLanguages: [] });

    // Render hook - this triggers syncOnLoad
    renderHook(() => useGoogleSheets());

    // Wait for sync to complete
    await waitFor(() => {
      expect(mockReadSettings).toHaveBeenCalled();
    });

    // EXPECTED TO FAIL ON UNFIXED CODE:
    // Local settings should be preserved or merged, but they're overwritten
    // because sheet wins on load without considering which is newer
    const localSettings = getExtraLanguages();
    expect(localSettings).toEqual(['it', 'fr']); // Should preserve local settings
  });

  it('Bug Condition 1.3: "ordsamling:settings-dirty" event has no listener', async () => {
    // Render the hook
    renderHook(() => useGoogleSheets());

    // Wait for initial sync
    await waitFor(() => {
      expect(mockReadLexicon).toHaveBeenCalled();
    });

    mockWriteSettings.mockClear();

    // Manually dispatch the event that setExtraLanguages fires
    window.dispatchEvent(new CustomEvent('ordsamling:settings-dirty', {
      detail: { extraLanguages: ['de', 'es'] }
    }));

    // Wait for potential debounce
    await new Promise(resolve => setTimeout(resolve, 2500));

    // EXPECTED TO FAIL ON UNFIXED CODE:
    // No listener exists for this event, so writeSettings is never called
    expect(mockWriteSettings).toHaveBeenCalled();
  });

  it('Bug Condition: Rapid changes to extraLanguages should debounce to single writeSettings call', async () => {
    renderHook(() => useGoogleSheets());

    await waitFor(() => {
      expect(mockReadLexicon).toHaveBeenCalled();
    });

    mockWriteSettings.mockClear();

    // Rapid changes
    setExtraLanguages(['it']);
    await new Promise(resolve => setTimeout(resolve, 500));
    setExtraLanguages(['it', 'fr']);
    await new Promise(resolve => setTimeout(resolve, 500));
    setExtraLanguages(['it', 'fr', 'de']);

    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 2500));

    // EXPECTED TO FAIL ON UNFIXED CODE:
    // Should have exactly 1 call with final state, but will have 0 calls
    expect(mockWriteSettings).toHaveBeenCalledTimes(1);
    expect(mockWriteSettings).toHaveBeenCalledWith(
      'test-sheet-id',
      { extraLanguages: ['it', 'fr', 'de'] },
      'mock-token'
    );
  });
});
