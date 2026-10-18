import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuizSession } from './useQuizSession';
import { matchesAnswer } from '@/lib/exercises/vocabulary';
import type { QuizQuestion } from '@/lib/exercises/types';
import { loadBoxStates } from '@/lib/quizHistory';

const question = (id = 'entry'): QuizQuestion => ({
  entry: { id, danish: 'hund', english: 'dog', type: 'noun', notes: '', createdAt: 1, updatedAt: 1 },
  prompt: 'hund', answer: 'dog', options: ['dog', 'cat'], questionType: 'translate',
  direction: { from: 'danish', to: 'english', fromLabel: 'Danish', toLabel: 'English' },
});

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('Quiz session lifecycle', () => {
  it('accepts a single answer even when submit is triggered twice before rendering', () => {
    const { result } = renderHook(() => useQuizSession(matchesAnswer));
    act(() => {
      result.current.start([question()], 30);
      result.current.submitAnswer('dog');
      result.current.submitAnswer('dog');
    });
    expect(result.current.score).toBe(1);
    expect(result.current.answers).toHaveLength(1);
    expect(result.current.timerActive).toBe(false);
  });

  it('times out once, records a skipped answer, and starts the next question timer', async () => {
    const { result } = renderHook(() => useQuizSession(matchesAnswer));
    act(() => result.current.start([question(), question('second')], 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.answers).toHaveLength(1);
    expect(result.current.answered).toBe('__timeout__');
    expect(result.current.answers[0].skipped).toBe(true);
    act(() => result.current.next(10));
    expect(result.current.currentIdx).toBe(1);
    expect(result.current.timeLeft).toBe(10);
    expect(result.current.showResult).toBe(false);
  });

  it('does not add generated questions or skipped answers to spaced repetition', () => {
    const { result } = renderHook(() => useQuizSession(matchesAnswer));
    act(() => {
      result.current.start([question('gen:number'), question()], 10);
      result.current.submitAnswer('dog');
      result.current.next(10);
      result.current.submitAnswer('__skipped__');
    });
    expect(loadBoxStates().size).toBe(0);
  });

  it('saves a session once and ignores repeated finish clicks', async () => {
    const { result } = renderHook(() => useQuizSession(matchesAnswer));
    const save = vi.fn().mockResolvedValue(undefined);
    act(() => {
      result.current.start([question()], 10);
      result.current.submitAnswer('dog');
    });
    const id = result.current.id;
    await act(async () => { await Promise.all([result.current.finish(save), result.current.finish(save)]); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id, score: 1 }));
    expect(result.current.phase).toBe('result');
    await act(async () => { await result.current.finish(save); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('retains the same session ID when a failed save is retried', async () => {
    const { result } = renderHook(() => useQuizSession(matchesAnswer));
    const save = vi.fn().mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValueOnce(undefined);
    act(() => {
      result.current.start([question()], 10);
      result.current.submitAnswer('dog');
    });
    const id = result.current.id;
    await act(async () => { await expect(result.current.finish(save)).rejects.toThrow(); });
    expect(result.current.phase).toBe('playing');
    await act(async () => { await result.current.finish(save); });
    expect(save.mock.calls.map(([snapshot]) => snapshot.id)).toEqual([id, id]);
    act(() => result.current.start([question()], 10));
    expect(result.current.id).not.toBe(id);
    expect(result.current.answers).toEqual([]);
  });
});
