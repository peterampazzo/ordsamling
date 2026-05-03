/**
 * Unit tests for useGoogleSheets — focused on the pure mergeSheetsIntoLocal function.
 *
 * The hook itself uses browser APIs (localStorage, window events, fetch) so we
 * test the pure merge algorithm in isolation by importing the exported helper.
 */

import { describe, it, expect } from 'vitest';
import { mergeSheetsIntoLocal } from './useGoogleSheets';
import type { LexisEntry } from '@/lib/lexicon';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<LexisEntry> & { id: string }): LexisEntry {
  return {
    danish: 'hund',
    english: 'dog',
    notes: '',
    type: 'noun',
    createdAt: 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mergeSheetsIntoLocal', () => {
  it('sheet entry newer than local → sheet version wins', () => {
    const local = makeEntry({ id: 'a', createdAt: 1000, danish: 'local' });
    const sheet = makeEntry({ id: 'a', createdAt: 2000, danish: 'sheet' });

    const result = mergeSheetsIntoLocal([local], [sheet]);

    expect(result).toHaveLength(1);
    expect(result[0].danish).toBe('sheet');
  });

  it('local entry newer than sheet → local version wins', () => {
    const local = makeEntry({ id: 'b', createdAt: 3000, danish: 'local-newer' });
    const sheet = makeEntry({ id: 'b', createdAt: 1000, danish: 'sheet-older' });

    const result = mergeSheetsIntoLocal([local], [sheet]);

    expect(result).toHaveLength(1);
    expect(result[0].danish).toBe('local-newer');
  });

  it('local entry same createdAt as sheet → local version wins', () => {
    const local = makeEntry({ id: 'c', createdAt: 1500, danish: 'local-same' });
    const sheet = makeEntry({ id: 'c', createdAt: 1500, danish: 'sheet-same' });

    const result = mergeSheetsIntoLocal([local], [sheet]);

    expect(result).toHaveLength(1);
    expect(result[0].danish).toBe('local-same');
  });

  it('local-only entry (not in sheet) → preserved in merged result', () => {
    const local = makeEntry({ id: 'local-only', danish: 'only-local' });
    const sheet = makeEntry({ id: 'other', danish: 'other' });

    const result = mergeSheetsIntoLocal([local], [sheet]);

    const ids = result.map((e) => e.id);
    expect(ids).toContain('local-only');
  });

  it('sheet-only entry (not in local) → added to merged result', () => {
    const local = makeEntry({ id: 'existing', danish: 'existing' });
    const sheetOnly = makeEntry({ id: 'sheet-only', danish: 'only-in-sheet' });

    const result = mergeSheetsIntoLocal([local], [sheetOnly]);

    const ids = result.map((e) => e.id);
    expect(ids).toContain('sheet-only');
  });

  it('merge is idempotent: merging same sheet data twice = same result as once', () => {
    const local = makeEntry({ id: 'x', createdAt: 1000, danish: 'local' });
    const sheet = makeEntry({ id: 'x', createdAt: 2000, danish: 'sheet' });
    const sheetExtra = makeEntry({ id: 'y', createdAt: 500, danish: 'extra' });

    const firstMerge = mergeSheetsIntoLocal([local], [sheet, sheetExtra]);
    const secondMerge = mergeSheetsIntoLocal(firstMerge, [sheet, sheetExtra]);

    // Same length
    expect(secondMerge).toHaveLength(firstMerge.length);

    // Same IDs
    const firstIds = firstMerge.map((e) => e.id).sort();
    const secondIds = secondMerge.map((e) => e.id).sort();
    expect(secondIds).toEqual(firstIds);

    // Same content for each entry
    for (const entry of firstMerge) {
      const match = secondMerge.find((e) => e.id === entry.id);
      expect(match).toBeDefined();
      expect(match!.danish).toBe(entry.danish);
      expect(match!.createdAt).toBe(entry.createdAt);
    }
  });

  it('empty local + non-empty sheet → all sheet entries returned', () => {
    const sheet1 = makeEntry({ id: 's1', danish: 'sheet1' });
    const sheet2 = makeEntry({ id: 's2', danish: 'sheet2' });

    const result = mergeSheetsIntoLocal([], [sheet1, sheet2]);

    expect(result).toHaveLength(2);
    const ids = result.map((e) => e.id);
    expect(ids).toContain('s1');
    expect(ids).toContain('s2');
  });

  it('non-empty local + empty sheet → all local entries returned', () => {
    const local1 = makeEntry({ id: 'l1', danish: 'local1' });
    const local2 = makeEntry({ id: 'l2', danish: 'local2' });

    const result = mergeSheetsIntoLocal([local1, local2], []);

    expect(result).toHaveLength(2);
    const ids = result.map((e) => e.id);
    expect(ids).toContain('l1');
    expect(ids).toContain('l2');
  });

  it('both empty → empty result', () => {
    const result = mergeSheetsIntoLocal([], []);
    expect(result).toHaveLength(0);
  });

  it('multiple entries with mixed newer/older timestamps', () => {
    const localA = makeEntry({ id: 'a', createdAt: 3000, danish: 'local-a' });
    const localB = makeEntry({ id: 'b', createdAt: 1000, danish: 'local-b' });
    const localC = makeEntry({ id: 'c', createdAt: 2000, danish: 'local-c' }); // local-only

    const sheetA = makeEntry({ id: 'a', createdAt: 1000, danish: 'sheet-a' }); // local newer
    const sheetB = makeEntry({ id: 'b', createdAt: 5000, danish: 'sheet-b' }); // sheet newer
    const sheetD = makeEntry({ id: 'd', createdAt: 4000, danish: 'sheet-d' }); // sheet-only

    const result = mergeSheetsIntoLocal([localA, localB, localC], [sheetA, sheetB, sheetD]);

    expect(result).toHaveLength(4);

    const byId = new Map(result.map((e) => [e.id, e]));
    expect(byId.get('a')!.danish).toBe('local-a');  // local newer
    expect(byId.get('b')!.danish).toBe('sheet-b');  // sheet newer
    expect(byId.get('c')!.danish).toBe('local-c');  // local-only preserved
    expect(byId.get('d')!.danish).toBe('sheet-d');  // sheet-only added
  });
});
