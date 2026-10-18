import type { LexisEntry, EntryGrammar } from '@/lib/lexicon';
import { t } from '@/i18n';
import { shuffle, type LangDirection, type QuizQuestion, type QuestionType } from './types';

export { shuffle };
export type QuizMode = 'choice' | 'type' | 'completion' | 'mixed';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export const DIRECTIONS: LangDirection[] = [
  { from: 'danish', to: 'english', fromLabel: t('directions.danish'), toLabel: t('directions.english') },
  { from: 'english', to: 'danish', fromLabel: t('directions.english'), toLabel: t('directions.danish') },
];

/** Reject empty, placeholder, or junk strings */
export function isValid(s: string | undefined): boolean {
  return !!s && !['', '-', '–', '—', '...', '?'].includes(s.trim());
}

/** Cheap bigram-overlap similarity in [0,1] used to find prompt-shaped distractors. */
function bigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.toLowerCase().slice(i, i + 2)));
  const left = grams(a), right = grams(b);
  if (!left.size || !right.size) return 0;
  return [...left].filter(value => right.has(value)).length / Math.max(left.size, right.size);
}

/** Strip parenthesized hidden context, e.g. "read (someone)" -> "read". */
function stripParens(s: string): string {
  return s.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

export function normalize(s: string): string {
  return stripParens(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/^[\s¿¡]+|[\s?!.,;:]+$/g, '').replace(/\s+/g, ' ').trim();
}

/** Split an answer like "imagine/invent", "finish, complete" or "to imagine / to invent" into alternatives. */
export function splitAlternatives(s: string): string[] {
  return s.split(/[/,]/).map(part => stripParens(part).trim()).filter(Boolean);
}

/** Lenient Danish noun suffix check: accept base ↔ base+en / base+et. */
function suffixMatch(a: string, b: string): boolean {
  return a === b || ['en', 'et'].some(suffix => a === b + suffix || b === a + suffix);
}

/** Check if a given answer matches the correct answer, accepting any alternative. */
export function matchesAnswer(given: string, correct: string): boolean {
  const normalized = normalize(given);
  if (!normalized) return false;
  const alternatives = [...splitAlternatives(correct).map(normalize), normalize(correct)].filter(Boolean);
  return alternatives.some(answer => suffixMatch(normalized, answer));
}

/** Pick the primary form of a multi-alternative answer (first slash/comma segment). */
function primaryForm(s: string): string {
  return splitAlternatives(s)[0] ?? s.trim();
}

/** Create a word completion mask: show first, last, and ~40% of chars */
function makeBlank(word: string): string {
  if (word.length <= 2) return '_'.repeat(word.length);
  const chars = word.split('');
  const indices = shuffle(Array.from({ length: chars.length - 2 }, (_, i) => i + 1))
    .slice(0, Math.max(1, Math.floor(chars.length * 0.4)));
  indices.forEach(i => { if (chars[i] !== ' ') chars[i] = '_'; });
  return chars.join('');
}

function getGrammarValue(entry: LexisEntry, key: keyof EntryGrammar): string | undefined {
  const value = entry.grammar?.[key]?.trim();
  return isValid(value) ? value : undefined;
}

function grammarQuestions(
  entries: LexisEntry[], dir: LangDirection, type: 'verb' | 'noun',
  slots: Array<[keyof EntryGrammar, string]>,
): QuizQuestion[] {
  return entries.filter(entry => entry.type === type && entry.grammar).flatMap(entry =>
    slots.flatMap(([key, label]) => {
      const answer = getGrammarValue(entry, key);
      return answer ? [{
        entry, prompt: entry.danish, answer, options: [],
        questionType: (type === 'verb' ? 'conjugation' : 'noun_form') as QuestionType,
        hint: `${label} af «${entry.danish}»`, direction: dir,
      }] : [];
    }));
}

function buildConjugationQuestions(entries: LexisEntry[], dir: LangDirection): QuizQuestion[] {
  return grammarQuestions(entries, dir, 'verb', [['present', 'Nutid'], ['past', 'Datid'], ['perfect', 'Perfektum']]);
}

function buildNounFormQuestions(entries: LexisEntry[], dir: LangDirection): QuizQuestion[] {
  return grammarQuestions(entries, dir, 'noun', [
    ['singularDefinite', 'Bestemt ental'], ['pluralIndefinite', 'Ubestemt flertal'], ['pluralDefinite', 'Bestemt flertal'],
  ]);
}

function buildFillBlankQuestions(entries: LexisEntry[], dir: LangDirection): QuizQuestion[] {
  return entries.filter(entry => isValid(entry[dir.to]) && entry[dir.to].trim().length >= 3).map(entry => {
    const primary = primaryForm(entry[dir.to]);
    const masked = makeBlank(primary);
    return {
      entry, prompt: masked,
      answer: primary, // accept only the primary form in completion mode
      options: [], questionType: 'fill_blank', hint: `Udfyld: ${entry[dir.from]}`, direction: dir, masked,
    };
  });
}

/** Build a pool of questions with true bilingual alternation */
export function buildQuestions(
  entries: LexisEntry[], count: number, difficulty: Difficulty, mode: QuizMode,
  directions: LangDirection[] = DIRECTIONS,
): QuizQuestion[] {
  const pool: QuizQuestion[] = [];
  for (const dir of directions) {
    const eligible = entries.filter(entry => isValid(entry[dir.from]) && isValid(entry[dir.to]));
    if (eligible.length < 2) continue;
    // Translation questions
    pool.push(...eligible.map(entry => ({
      entry, prompt: entry[dir.from], answer: entry[dir.to], options: [], questionType: 'translate' as const, direction: dir,
    })));
    // Intermediate+: grammar questions (more weight)
    if (difficulty !== 'beginner') {
      const grammar = [...buildConjugationQuestions(entries, dir), ...buildNounFormQuestions(entries, dir)];
      // Double grammar questions for emphasis
      pool.push(...grammar, ...grammar.map(question => ({ ...question })));
    }
    // Advanced: fill-in-the-blank / completion
    if (difficulty === 'advanced') pool.push(...buildFillBlankQuestions(entries, dir));
  }
  // Shuffle and pick, ensuring alternating directions
  const remaining = shuffle(pool), picked: QuizQuestion[] = [];
  let lastDir: string | null = null;
  // First pass: try alternating directions
  while (picked.length < count && remaining.length) {
    const index = remaining.findIndex(question => `${question.direction.from}-${question.direction.to}` !== lastDir);
    const question = remaining.splice(Math.max(0, index), 1)[0];
    picked.push(question);
    lastDir = `${question.direction.from}-${question.direction.to}`;
  }
  // Assign display modes for mixed mode
  const mixed = ['choice', 'type', 'completion'] as const;
  picked.forEach((question, index) => { if (mode === 'mixed') question.displayMode = mixed[index % mixed.length]; });
  // For completion mode (or mixed questions that are completion), add masked versions
  for (const question of picked) {
    if (mode === 'completion' || question.displayMode === 'completion') {
      question.answer = primaryForm(question.answer);
      question.masked ??= makeBlank(question.answer);
    }
  }
  // Generate local MC options for choice-mode questions (or mixed questions that are choice)
  for (const question of picked) {
    if (mode !== 'choice' && question.displayMode !== 'choice') continue;
    let answerPool: string[];
    if (question.questionType === 'translate') {
      answerPool = entries.map(entry => entry[question.direction.to]).filter(isValid);
    } else {
      // For grammar questions, draw from the SAME grammar slot across other entries
      // of the same type. This avoids mixing verb conjugations with noun forms etc.
      const slots: Record<string, keyof EntryGrammar> = {
        Nutid: 'present', Datid: 'past', Perfektum: 'perfect',
        'Bestemt ental': 'singularDefinite', 'Ubestemt flertal': 'pluralIndefinite', 'Bestemt flertal': 'pluralDefinite',
      };
      const slot = slots[question.hint?.split(' af ')[0] ?? ''];
      const sameSlot = slot ? entries.filter(entry => entry.type === question.entry.type && entry.id !== question.entry.id)
        .map(entry => getGrammarValue(entry, slot)).filter(isValid) : [];
      const fallback = entries.flatMap(entry => Object.values(entry.grammar ?? {}).filter(isValid));
      answerPool = sameSlot.length >= 3 ? sameSlot : [...sameSlot, ...fallback];
    }
    const correct = new Set(splitAlternatives(question.answer).map(normalize));
    let candidates = [...new Set(answerPool.map(answer => answer.trim()))]
      .filter(answer => !correct.has(normalize(answer)) && normalize(answer) !== normalize(question.answer));
    // Tighter length-similarity filter so distractor length doesn't telegraph the answer
    const tolerance = Math.max(2, Math.round(question.answer.length * 0.25));
    const similar = candidates.filter(answer => Math.abs(answer.length - question.answer.length) <= tolerance);
    if (similar.length >= 3) candidates = similar;
    // For translate questions, prefer distractors that look similar to the prompt
    // (cognate-shaped) so obvious cognates like "Balkon → Balcony" aren't trivially picked.
    if (question.questionType === 'translate' && candidates.length > 3) {
      candidates = [...candidates].sort((a, b) => bigramSimilarity(b, question.prompt) - bigramSimilarity(a, question.prompt)).slice(0, 8);
    }
    question.options = shuffle([question.answer, ...shuffle(candidates).slice(0, 3)]).filter(isValid);
    if (!question.options.some(option => normalize(option) === normalize(question.answer))) {
      question.options[0] = question.answer;
      question.options = shuffle(question.options);
    }
  }
  return picked;
}

/**
 * Verb exercise: conjugation drills only (infinitive + tense → form, and the
 * reverse "which verb is this form?"), built from the user's verb entries.
 */
export function buildVerbDrillQuestions(
  entries: LexisEntry[], count: number, mode: QuizMode, directions: LangDirection[] = DIRECTIONS,
): QuizQuestion[] {
  const dir = directions[0] ?? DIRECTIONS[0];
  const forward = buildConjugationQuestions(entries, dir);
  // Reverse drill: show the inflected form, ask for the infinitive.
  const reverse: QuizQuestion[] = forward.map(question => ({
    entry: question.entry, prompt: question.answer, answer: question.entry.danish, options: [],
    questionType: 'conjugation' as const, hint: t('quiz.verbs.hintInfinitive'), direction: dir,
  }));
  const picked = shuffle([...forward, ...reverse]).slice(0, count);
  const mixed = ['choice', 'type'] as const;
  picked.forEach((question, index) => {
    if (mode === 'mixed') question.displayMode = mixed[index % mixed.length];
    if (mode !== 'choice' && question.displayMode !== 'choice') return;
    const pool = [...forward, ...reverse].map(item => item.answer)
      .filter(answer => isValid(answer) && normalize(answer) !== normalize(question.answer));
    question.options = shuffle([question.answer, ...shuffle([...new Set(pool)]).slice(0, 3)]).filter(isValid);
  });
  return picked;
}
