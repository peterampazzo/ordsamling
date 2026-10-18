import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildQuestions, buildVerbDrillQuestions, matchesAnswer } from './vocabulary';
import type { LexisEntry } from '../lexicon';

const entries: LexisEntry[] = [
  { id: 'dog', danish: 'hund', english: 'dog', type: 'noun', notes: '', createdAt: 1, updatedAt: 1 },
  { id: 'cat', danish: 'kat', english: 'cat', type: 'noun', notes: '', createdAt: 1, updatedAt: 1 },
  { id: 'go', danish: 'gå', english: 'go', type: 'verb', notes: '', createdAt: 1, updatedAt: 1,
    grammar: { present: 'går', past: 'gik', perfect: 'har gået' } },
];
afterEach(() => vi.restoreAllMocks());

describe('Vocabulary question builders', () => {
  it('preserves lenient alternatives, punctuation, and noun suffixes', () => {
    expect(matchesAnswer('Dog!', 'dog/hound')).toBe(true);
    expect(matchesAnswer('hunden', 'hund')).toBe(true);
    expect(matchesAnswer('', 'hund')).toBe(false);
    expect(matchesAnswer('cat', 'dog')).toBe(false);
  });

  it('keeps the correct answer among choice options and does not mutate the entries', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const original = JSON.stringify(entries);
    const questions = buildQuestions(entries, 10, 'advanced', 'choice');
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) expect(question.options).toContain(question.answer);
    expect(JSON.stringify(entries)).toBe(original);
  });

  it('uses independent question objects when weighting grammar questions in mixed mode', () => {
    const questions = buildQuestions(entries, 100, 'advanced', 'mixed');
    expect(new Set(questions).size).toBe(questions.length);
    questions.forEach((question, index) => {
      expect(question.displayMode).toBe(['choice', 'type', 'completion'][index % 3]);
    });
  });

  it('builds only conjugation drills for the verb exercise', () => {
    const questions = buildVerbDrillQuestions(entries, 10, 'mixed');
    expect(questions).toHaveLength(6);
    expect(questions.every(question => question.questionType === 'conjugation' && question.entry.id === 'go')).toBe(true);
  });
});
