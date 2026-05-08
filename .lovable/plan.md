# Harder distractors for translate questions

The previous round improved **grammar** questions (same-slot distractors) but left **translate** questions like `Balkon → Balcony` trivially guessable, because the three wrong English words (Letter, Embassy, Seller) share nothing with the prompt while the correct answer is an obvious cognate.

## Changes (single file: `src/pages/Quiz.tsx`, distractor block ~lines 307–356)

### 1. Tighten the length-similarity filter
Replace `Math.max(3, targetLen * 0.5)` with `Math.max(2, Math.round(targetLen * 0.25))`. For an 8-char answer this drops the tolerance from ±4 to ±2, so distractors can no longer be visibly shorter/longer than the answer.

### 2. Prefer prompt-similar distractors for translate questions
After building the candidate pool for `questionType === "translate"`:

- Compute a cheap similarity between each candidate and the **prompt** (the Danish word shown), e.g. count of shared 2-grams or shared first/last letter + length proximity.
- Sort candidates by descending similarity, then take the top ~8 and `shuffle().slice(0, 3)` from that subset.
- Fall back to the current behaviour if fewer than 3 candidates qualify.

This way, when the prompt is "Balkon", candidates that share letters with "Balkon" (and therefore look plausibly like its translation) are preferred over unrelated nouns. The user can no longer pick the answer just because it "looks Danish".

### 3. Keep the answer in the pool
Re-validate that `q.answer` is still present after filtering (existing safeguard at line 506 covers AI path; mirror it here).

## Out of scope

- Curating a hand-picked cognate blocklist.
- Changing AI distractor logic — it already does this well when a Gemini key is configured. This plan only improves the **local fallback** used when no key is set (which is what Basic-level demo users hit).

## Technical notes

Similarity helper (small, local, no deps):

```ts
function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  const n = s.toLowerCase();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
}
function similarity(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / Math.max(1, Math.max(A.size, B.size));
}
```

Used as: rank `candidates` by `similarity(candidate, q.prompt)` descending, take top 8, shuffle, pick 3.
