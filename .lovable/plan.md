# Unify Progress & Quiz History

## Why
Today, two pages read the same `quizHistory` data from two different places:
- `/progress` — reached from the StreakRing in `/app` header
- `/quiz/history` — reached from inside the Quiz page

That's the inconsistency: same data, two homes, two entry points. We'll consolidate into one **Progress hub** at `/progress` with tabs, and make `/quiz/history` redirect there.

## New IA

```text
/progress
├── ?tab=overview   → stats cards · charts · daily-goal editor   (default)
├── ?tab=sessions   → quiz session list (was /quiz/history)
└── ?tab=words      → hardest 10 words + word stats table
```

Single H1: "Progress". Tab state synced to URL query so links from Quiz page deep-link to the right tab and browser back works.

## Changes

### 1. Page restructure — `src/pages/Progress.tsx`
- Add a `Tabs` (shadcn) row under the PageHeader: **Overview · Sessions · Words**.
- **Overview** = current Progress content minus the hardest-words list (stats cards, daily-goal editor, "Words added per week" bar chart, "Accuracy trend" line chart).
- **Sessions** = full content currently in `QuizHistory.tsx` (SessionCard list, clear-history button, empty state).
- **Words** = current "Hardest 10" list, expanded to show the full `wordStats(history)` table with the same columns (correct ✓ / wrong ✗ / %).
- Active tab driven by `useSearchParams` (`?tab=`), defaulting to `overview`. Invalid values fall back to overview.

### 2. Redirect old route — `src/App.tsx`
- Replace `<Route path="/quiz/history" element={<QuizHistory />} />` with a `<Navigate to="/progress?tab=sessions" replace />`.
- Remove the `QuizHistory` import.
- Delete `src/pages/QuizHistory.tsx` (content moved into Progress).

### 3. Quiz page entry points — `src/pages/Quiz.tsx`
- Any link/button currently pointing to `/quiz/history` (the `History` icon link in the Quiz header / results screen) → point to `/progress?tab=sessions`.
- Relabel to "Progress" (using existing or new i18n key) so the destination matches.

### 4. i18n — `src/i18n/en.yaml` + `da.yaml`
- Add `progress.tabs.overview`, `progress.tabs.sessions`, `progress.tabs.words`.
- Move existing `quizHistory.*` strings used by SessionCard, empty state, and clear button into a `progress.sessions.*` namespace (or alias them — keep the strings, just re-key under progress).
- Update Quiz page link label key from "history" → "progress".

### 5. Tests
- Update `playwright/accessibility.spec.ts`: drop `/quiz/history`, keep `/progress` (already there). Add a check that `/quiz/history` 30x-redirects (or client-renders) to `/progress?tab=sessions`.
- No business-logic changes, so `streak.test.ts` and `quizHistory.test.ts` stay as-is.

## What stays the same
- StreakRing remains in `/app` header only (per your choice).
- All computation lives in `src/lib/streak.ts` and `src/lib/quizHistory.ts` — untouched.
- No backend, no schema, no Cloud changes. Pure client-side IA refactor.

## Files touched
- `src/pages/Progress.tsx` (refactor → tabbed)
- `src/pages/Quiz.tsx` (link target + label)
- `src/App.tsx` (route redirect, drop import)
- `src/pages/QuizHistory.tsx` (delete)
- `src/i18n/en.yaml`, `src/i18n/da.yaml` (tab labels, re-namespace)
- `playwright/accessibility.spec.ts` (route list)
