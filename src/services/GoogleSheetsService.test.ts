/**
 * Unit tests for GoogleSheetsService serialization/deserialization.
 * Covers tasks 2.2, 2.3, and 2.12.
 */

import { describe, it, expect } from 'vitest';
import {
  serializeLexiconRow,
  deserializeLexiconRow,
  serializeQuizHistoryRow,
  deserializeQuizHistoryRow,
} from './GoogleSheetsService';
import type { LexisEntry } from '@/lib/lexicon';
import type { QuizSessionRecord } from '@/lib/quizHistory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<LexisEntry> = {}): LexisEntry {
  return {
    id: 'test-id-1',
    danish: 'hund',
    english: 'dog',
    type: 'noun',
    notes: 'a common animal',
    createdAt: 1700000000000,
    ...overrides,
  };
}

function makeSession(overrides: Partial<QuizSessionRecord> = {}): QuizSessionRecord {
  return {
    id: 'session-id-1',
    date: 1700000000000,
    mode: 'choice',
    fromLabel: 'Danish',
    toLabel: 'English',
    score: 8,
    total: 10,
    answers: [
      {
        prompt: 'hund',
        correctAnswer: 'dog',
        givenAnswer: 'dog',
        correct: true,
        skipped: false,
        fromLang: 'da',
        toLang: 'en',
        entryId: 'test-id-1',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// LexisEntry round-trip tests (one per entry type)
// ---------------------------------------------------------------------------

describe('serializeLexiconRow / deserializeLexiconRow round-trip', () => {
  it('round-trips a "word" entry', () => {
    const entry = makeEntry({ type: 'word', id: 'w1', danish: 'god', english: 'good' });
    const row = serializeLexiconRow(entry);
    expect(row).toHaveLength(8);
    const result = deserializeLexiconRow(row);
    expect(result).toEqual(entry);
  });

  it('round-trips a "noun" entry with grammar', () => {
    const entry = makeEntry({
      type: 'noun',
      id: 'n1',
      danish: 'hus',
      english: 'house',
      grammar: {
        article: 'et',
        singularDefinite: 'huset',
        pluralIndefinite: 'huse',
        pluralDefinite: 'husene',
      },
    });
    const row = serializeLexiconRow(entry);
    expect(row).toHaveLength(8);
    const result = deserializeLexiconRow(row);
    expect(result).toEqual(entry);
  });

  it('round-trips a "verb" entry with grammar', () => {
    const entry = makeEntry({
      type: 'verb',
      id: 'v1',
      danish: 'gå',
      english: 'go',
      grammar: {
        present: 'går',
        past: 'gik',
        perfect: 'har gået',
      },
    });
    const row = serializeLexiconRow(entry);
    const result = deserializeLexiconRow(row);
    expect(result).toEqual(entry);
  });

  it('round-trips an "adjective" entry with grammar', () => {
    const entry = makeEntry({
      type: 'adjective',
      id: 'a1',
      danish: 'stor',
      english: 'big',
      grammar: {
        neuter: 'stort',
        definite: 'store',
        plural: 'store',
        comparative: 'større',
        superlative: 'størst',
      },
    });
    const row = serializeLexiconRow(entry);
    const result = deserializeLexiconRow(row);
    expect(result).toEqual(entry);
  });

  it('round-trips an "expression" entry with translations', () => {
    const entry = makeEntry({
      type: 'expression',
      id: 'e1',
      danish: 'det er ligegyldigt',
      english: "it doesn't matter",
      translations: { it: 'non importa', fr: "ça n'a pas d'importance" },
      notes: 'common phrase',
    });
    const row = serializeLexiconRow(entry);
    const result = deserializeLexiconRow(row);
    expect(result).toEqual(entry);
  });

  it('round-trips an entry with no optional fields', () => {
    const entry: LexisEntry = {
      id: 'bare-1',
      danish: 'ja',
      english: 'yes',
      type: 'word',
      notes: '',
      createdAt: 1234567890,
    };
    const row = serializeLexiconRow(entry);
    const result = deserializeLexiconRow(row);
    expect(result).toEqual(entry);
  });
});

// ---------------------------------------------------------------------------
// QuizSessionRecord round-trip
// ---------------------------------------------------------------------------

describe('serializeQuizHistoryRow / deserializeQuizHistoryRow round-trip', () => {
  it('round-trips a quiz session with answers', () => {
    const session = makeSession();
    const row = serializeQuizHistoryRow(session);
    expect(row).toHaveLength(8);
    const result = deserializeQuizHistoryRow(row);
    expect(result).toEqual(session);
  });

  it('round-trips a session with empty answers array', () => {
    const session = makeSession({ answers: [], score: 0, total: 0 });
    const row = serializeQuizHistoryRow(session);
    const result = deserializeQuizHistoryRow(row);
    expect(result).toEqual(session);
  });

  it('round-trips a "type" mode session', () => {
    const session = makeSession({ mode: 'type', id: 'session-2' });
    const row = serializeQuizHistoryRow(session);
    const result = deserializeQuizHistoryRow(row);
    expect(result).toEqual(session);
  });
});

// ---------------------------------------------------------------------------
// deserializeLexiconRow edge cases
// ---------------------------------------------------------------------------

describe('deserializeLexiconRow edge cases', () => {
  it('returns null for an empty row', () => {
    expect(deserializeLexiconRow([])).toBeNull();
  });

  it('returns null when row[0] is empty string', () => {
    expect(deserializeLexiconRow(['', 'danish', 'english', '', 'word', '', '', '123'])).toBeNull();
  });

  it('returns entry with translations: undefined when translations column has malformed JSON', () => {
    const row = ['id-1', 'hund', 'dog', '{not valid json}', 'noun', '', 'notes', '1700000000000'];
    const result = deserializeLexiconRow(row);
    expect(result).not.toBeNull();
    expect(result!.translations).toBeUndefined();
  });

  it('returns entry with grammar: undefined when grammar column has malformed JSON', () => {
    const row = ['id-1', 'hund', 'dog', '', 'noun', 'not-json-at-all', 'notes', '1700000000000'];
    const result = deserializeLexiconRow(row);
    expect(result).not.toBeNull();
    expect(result!.grammar).toBeUndefined();
  });

  it('returns entry with fallback values when row is shorter than 8 columns', () => {
    // Only id and danish provided
    const row = ['id-short', 'hund'];
    const result = deserializeLexiconRow(row);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('id-short');
    expect(result!.danish).toBe('hund');
    expect(result!.english).toBe('');
    expect(result!.notes).toBe('');
    expect(result!.type).toBe('word'); // normalizeEntryType fallback
    expect(result!.translations).toBeUndefined();
    expect(result!.grammar).toBeUndefined();
    // createdAt falls back to Date.now() — just check it's a positive number
    expect(result!.createdAt).toBeGreaterThan(0);
  });

  it('falls back createdAt to Date.now() when column 7 is not a valid number', () => {
    const before = Date.now();
    const row = ['id-1', 'hund', 'dog', '', 'word', '', '', 'not-a-number'];
    const result = deserializeLexiconRow(row);
    const after = Date.now();
    expect(result).not.toBeNull();
    expect(result!.createdAt).toBeGreaterThanOrEqual(before);
    expect(result!.createdAt).toBeLessThanOrEqual(after);
  });

  it('serializes translations as empty string when undefined', () => {
    const entry = makeEntry({ translations: undefined });
    const row = serializeLexiconRow(entry);
    expect(row[3]).toBe('');
  });

  it('serializes grammar as empty string when undefined', () => {
    const entry = makeEntry({ grammar: undefined });
    const row = serializeLexiconRow(entry);
    expect(row[5]).toBe('');
  });
});

// ---------------------------------------------------------------------------
// deserializeQuizHistoryRow edge cases
// ---------------------------------------------------------------------------

describe('deserializeQuizHistoryRow edge cases', () => {
  it('returns null for an empty row', () => {
    expect(deserializeQuizHistoryRow([])).toBeNull();
  });

  it('returns null when row[0] is empty string', () => {
    expect(deserializeQuizHistoryRow(['', 'date', 'mode'])).toBeNull();
  });

  it('returns session with empty answers when answers column has malformed JSON', () => {
    const row = ['session-1', '1700000000000', 'choice', 'Danish', 'English', '5', '10', '{bad json}'];
    const result = deserializeQuizHistoryRow(row);
    expect(result).not.toBeNull();
    expect(result!.answers).toEqual([]);
  });
});
