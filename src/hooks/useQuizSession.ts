import { useCallback, useEffect, useReducer, useRef, type SetStateAction } from 'react';
import type { QuizQuestion } from '@/lib/exercises/types';
import { isGeneratedEntryId } from '@/lib/exercises/types';
import { recordReview, type QuizAnswerRecord } from '@/lib/quizHistory';

export interface QuizSessionState {
  id: string;
  phase: 'setup' | 'playing' | 'result';
  questions: QuizQuestion[];
  currentIdx: number;
  score: number;
  answered: string | null;
  typedAnswer: string;
  showResult: boolean;
  timeLeft: number;
  timerActive: boolean;
  answers: QuizAnswerRecord[];
}

type Action =
  | { type: 'start'; id: string; questions: QuizQuestion[]; seconds: number }
  | { type: 'answer'; value: string; record: QuizAnswerRecord }
  | { type: 'next'; seconds: number }
  | { type: 'tick' }
  | { type: 'typed'; value: string }
  | { type: 'questions'; questions: QuizQuestion[] }
  | { type: 'phase'; phase: QuizSessionState['phase'] };

export const initialQuizSession: QuizSessionState = {
  id: '', phase: 'setup', questions: [], currentIdx: 0, score: 0,
  answered: null, typedAnswer: '', showResult: false, timeLeft: 0, timerActive: false, answers: [],
};

export function quizSessionReducer(state: QuizSessionState, action: Action): QuizSessionState {
  switch (action.type) {
    case 'start':
      return { ...initialQuizSession, id: action.id, phase: 'playing', questions: action.questions, timeLeft: action.seconds, timerActive: true };
    case 'answer':
      if (state.phase !== 'playing' || state.showResult) return state;
      return {
        ...state, answered: action.value, showResult: true, timerActive: false,
        score: state.score + Number(action.record.correct), answers: [...state.answers, action.record],
      };
    case 'next':
      if (!state.showResult || state.currentIdx + 1 >= state.questions.length) return state;
      return { ...state, currentIdx: state.currentIdx + 1, answered: null, typedAnswer: '', showResult: false, timeLeft: action.seconds, timerActive: true };
    case 'tick':
      return state.phase === 'playing' && state.timerActive
        ? { ...state, timeLeft: Math.max(0, state.timeLeft - 1), timerActive: state.timeLeft > 1 } : state;
    case 'typed': return { ...state, typedAnswer: action.value };
    case 'questions': return { ...state, questions: action.questions };
    case 'phase': return { ...state, phase: action.phase, timerActive: false };
  }
}

export function useQuizSession(matchesAnswer: (given: string, correct: string) => boolean) {
  const [state, dispatch] = useReducer((_previous: QuizSessionState, next: QuizSessionState) => next, initialQuizSession);
  const current = useRef(state);
  const saving = useRef<{ id: string; promise: Promise<void> } | null>(null);
  const send = useCallback((action: Action) => {
    current.current = quizSessionReducer(current.current, action);
    dispatch(current.current);
  }, []);

  const submitAnswer = useCallback((answer: string) => {
    const snapshot = current.current;
    const question = snapshot.questions[snapshot.currentIdx];
    if (snapshot.phase !== 'playing' || snapshot.showResult || !question) return;
    const skipped = answer === '__skipped__' || answer === '__timeout__';
    const correct = !skipped && matchesAnswer(answer, question.answer);
    const record: QuizAnswerRecord = {
      prompt: question.hint || question.prompt, correctAnswer: question.answer,
      givenAnswer: skipped ? '' : answer, correct, skipped,
      fromLang: question.direction.from, toLang: question.direction.to, entryId: question.entry.id,
    };
    send({ type: 'answer', value: answer, record });
    if (!skipped && !isGeneratedEntryId(question.entry.id)) recordReview(question.entry.id, correct);
  }, [matchesAnswer, send]);

  useEffect(() => {
    if (state.phase !== 'playing' || !state.timerActive) return;
    const timer = setInterval(() => send({ type: 'tick' }), 1000);
    return () => clearInterval(timer);
  }, [state.phase, state.timerActive, send]);

  useEffect(() => {
    if (state.phase === 'playing' && state.timeLeft === 0 && !state.showResult) submitAnswer('__timeout__');
  }, [state.phase, state.timeLeft, state.showResult, submitAnswer]);

  const start = useCallback((questions: QuizQuestion[], seconds: number) => {
    send({ type: 'start', id: crypto.randomUUID(), questions, seconds });
  }, [send]);

  const finish = useCallback((save: (snapshot: QuizSessionState) => Promise<void>): Promise<void> => {
    const snapshot = current.current;
    if (saving.current?.id === snapshot.id) return saving.current.promise;
    if (snapshot.phase !== 'playing' || snapshot.answers.length !== snapshot.questions.length) return Promise.resolve();
    const promise = save(snapshot).then(() => {
      if (current.current.id === snapshot.id) send({ type: 'phase', phase: 'result' });
    }).finally(() => {
      if (saving.current?.id === snapshot.id) saving.current = null;
    });
    saving.current = { id: snapshot.id, promise };
    return promise;
  }, [send]);

  const setQuestions = useCallback((update: SetStateAction<QuizQuestion[]>) => {
    send({ type: 'questions', questions: typeof update === 'function' ? update(current.current.questions) : update });
  }, [send]);
  const setTypedAnswer = useCallback((value: string) => send({ type: 'typed', value }), [send]);
  const setPhase = useCallback((phase: QuizSessionState['phase']) => send({ type: 'phase', phase }), [send]);
  const next = useCallback((seconds: number) => send({ type: 'next', seconds }), [send]);
  return { ...state, start, submitAnswer, finish, next, setQuestions, setTypedAnswer, setPhase };
}
