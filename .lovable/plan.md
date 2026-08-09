# Exercise types: vocabulary, verbs, numbers, articles & prepositions

Today `/quiz` always drills translation of your own words, with grammar questions only appearing as a side effect of picking "Intermediate" or "Advanced". This plan turns those into four explicit exercises you choose up front.

## The four exercises

**1. Vocabulary** (what exists today)
Danish ↔ English translation of your saved words. Unchanged behaviour, just now an explicit choice.

**2. Verbs**
Conjugation drills only: given an infinitive and a tense (Nutid / Datid / Perfektum), produce the right form — and the reverse (given "gik", which verb and which tense?). Built from your saved verb entries' grammar fields. If you have fewer than 4 verbs with filled forms, the exercise is offered but shows a hint to add verb forms first (the existing AI fill-forms button covers this).

**3. Numbers**
Fully generated, no vocabulary needed — works even on an empty account. Four sub-topics, all on by default, each selectable:
- **Cardinals 0–1000** — digit → Danish word and word → digit, weighted toward the vigesimal traps (halvtreds, tres, halvfjerds, firs, halvfems) and the "enogtyve" reversed-order pattern.
- **Ordinals** — første, anden, tredje, fjerde … tyvende, enogtyvende.
- **Dates & clock time** — "den 3. maj", "halv tre", "kvart over syv", "ti minutter i otte", weekday and month names.
- **Prices & quantities** — "249,50 kr" → "tohundredeogniogfyrre kroner og halvtreds øre", "2,5 kg" → "to en halv kilo".

**4. Articles & prepositions**
- **Articles** — en/et drills built from your own nouns (grammar `article` field), plus definite-form drills ("hus" → "huset").
- **Prepositions** — a built-in curated pack of ~80 Danish cloze sentences covering i / på / til / for / med / af / om / ved / fra / efter, each with the correct preposition, 3 distractors, an English gloss, and a short "why" note shown in feedback. Ships with the app, works offline, no AI needed.

## Where it lives

`/quiz` gets a first step on the setup screen: four cards (Vocabulary, Verbs, Numbers, Articles & prepositions). Picking one reveals the options relevant to it:

```text
Exercise:  [Vocabulary] [Verbs] [Numbers] [Articles & prep.]
                |          |        |            |
   difficulty + mode   mode only  sub-topics   sub-topics
   + smart practice               + count      + count
   + count
```

Difficulty and Smart practice stay only where they mean something (vocabulary; verbs keeps mode). Everything downstream — the question runner, timer, answer validation with alternatives and definite-suffix leniency, results screen, quiz history, streak, SM-2 review recording — is reused unchanged. The chosen exercise is remembered between sessions and recorded on each history session so `/progress` can show accuracy per exercise.

Train Mistakes and Smart practice continue to work for exercises backed by real entries (vocabulary, verbs, articles). Numbers and prepositions are generated, so they record accuracy in history but do not feed SM-2 scheduling of your words.

## Technical notes

- **New pure libs** (unit-tested, no UI): `src/lib/exercises/numbers.ts` (`numberToDanish`, `ordinalToDanish`, `timeToDanish`, `priceToDanish`, plus question builders per sub-topic), and `src/lib/exercises/prepositions.ts` (the curated sentence pack as a typed constant + a builder).
- **`src/lib/exercises/types.ts`** defines `ExerciseKind = "vocabulary" | "verbs" | "numbers" | "articles"` and a shared `buildExerciseQuestions(kind, opts)` entry point returning the existing `QuizQuestion` shape (with a synthetic `entry` for generated questions so the renderer needs no changes).
- **`Quiz.tsx`**: extract the existing vocabulary builders into `src/lib/exercises/vocabulary.ts` and `verbs.ts` so `Quiz.tsx` shrinks toward a runner; add `exercise` state, the picker UI, and conditional option panels. Answer validation, AI distractors and rendering are untouched.
- **`quizHistory.ts`**: add an optional `exercise` field to the saved session (defaults to `"vocabulary"` for existing records, so old history stays valid).
- **i18n**: new `quiz.exercise.*` keys in `en.yaml` and `da.yaml` — no hardcoded strings. Preposition sentences live in the lib as data, with their English glosses.
- **A11y**: the picker is a `role="radiogroup"` of `aria-checked` buttons matching the existing difficulty/mode pattern; sub-topic toggles are checkboxes in a `fieldset`/`legend`; new UI added to the existing axe component test.
- **Tests**: unit tests for `numberToDanish` across the vigesimal range, ordinals, clock and price formatting; a validity test asserting every curated preposition sentence has exactly one blank, a correct answer, and 3 unique distractors; builder tests asserting each exercise produces the requested count with no duplicate answers.

## Not in scope

- Audio / listening for numbers (no TTS yet).
- AI-generated preposition sentences from your own words — curated pack only for now.
- A separate `/practice` page; everything stays on `/quiz`.
