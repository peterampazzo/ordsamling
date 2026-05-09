## 1. Empty-state CTA (mobile "Tilføj" confusion)

**Problem.** On phones the empty state says "Tryk «Tilføj» ovenfor" but the top-bar button collapses to a `+` icon (`hidden sm:inline` on the label). New users can't see the word the hint refers to.

**Fix.** Turn the empty state itself into the primary action so there's no spatial reference.

In `src/pages/Index.tsx`, replace the "no words yet" block (~lines 354–358):
- Keep the `BookOpen` icon and "No words yet" headline.
- Replace the hint paragraph with a primary `<Button>` that calls `setAddFormOpen(true)`, labelled "+ Tilføj dit første ord" / "Add your first word".
- Disable in demo mode with the existing tooltip pattern.
- Below it, a small secondary link to `/import` ("…eller importér en liste").

Optional polish: drop `hidden sm:inline` on line 244 so the top-bar button always shows the "Add" label — fits at 360 px.

i18n in `da.yaml` + `en.yaml` under `index:`:
- `addFirstWord: "Tilføj dit første ord"` / `"Add your first word"`
- `orImportList: "…eller importér en liste"` / `"…or import a list"`
- Remove `noWordsHint`.

---

## 2. Cancel button during AI processing

**Problem.** `BulkImport` shows the new `ProcessingSteps` stepper but the user can't abort a long AI extraction. An `AbortController` already exists in the processing pipeline.

**Fix.**
- In `src/pages/BulkImport.tsx`, hold the active `AbortController` in a ref (`abortRef`) created at the top of `handleProcessDocument`.
- Add `cancelProcessing()` that calls `abortRef.current?.abort()` and resets stepper state to "idle" (or marks the active step as "error" with sub-label "Cancelled").
- Render a `<Button variant="ghost" size="sm">` next to the stepper while `isProcessing` is true, labelled `t("bulkImport.cancelProcessing")` (string already exists). Aria-label included.
- In `src/lib/gemini.ts` (or wherever `extractEntriesFromText` lives), make sure the `signal` is passed through to every `fetch` call and that `AbortError` is caught and surfaced as a typed `ProcessingCancelledError` so the UI can distinguish cancel from real failures (no toast on cancel).

---

## 3. Resume / retry on partial chunk failure

**Problem.** AI extraction is chunked. If chunk 3 of 5 throws, we discard chunks 1–2 and force the user to restart.

**Fix.**
- Refactor the chunk loop in `BulkImport.tsx` (or extract to `src/lib/aiExtract.ts`) to track results per chunk: `chunks: Array<{ status: "pending" | "ok" | "error" | "cancelled"; entries?: ParsedEntry[]; error?: string }>`.
- Persist successful entries into local state as they arrive (don't wait for the whole pipeline).
- When the loop ends with at least one error, surface a banner above the stepper:
  - "{n} of {total} chunks failed."
  - Buttons: **Retry failed** (re-runs only `status === "error"` chunks, preserving the others) and **Continue with what we have** (jumps to review with the successful entries only).
- Stepper sub-label updates to show `Chunk 3 of 5 — 2 ok, 1 failed`.
- Add i18n strings: `chunksFailedSummary`, `retryFailed`, `continueAnyway`.

---

## 4. Inline edit before commit

**Problem.** After AI extraction, today's review step is read-only: import everything or start over.

**Fix.**
- In the review step of `BulkImport.tsx`, render each parsed entry as an editable row instead of a plain table cell:
  - `Input` for Danish, Input for English, `Select` for type (using `ENTRY_TYPES`).
  - Trash icon to remove the row from the import set.
  - "Edit grammar" expand toggle that shows `<GrammarFields>` (already exists) for that row only.
- Keep edits in local state (`editedRows: Record<rowId, ParsedEntry>`); the final "Import N words" button uses the edited values.
- "Select all / none" checkboxes already exist — keep them; deletion is just a faster shortcut.
- Validation re-runs on edit so the "X valid / Y errors" counter stays live.

i18n: `bulkImport.editRowAria`, `bulkImport.removeRow`, `bulkImport.editGrammar`.

---

## 5. Duplicate preview in bulk import

**Problem.** Duplicates are detected per-row but there's no top-level summary before commit, so the user doesn't realise they're about to update/skip 12 of 30 entries.

**Fix.**
- After parsing/extraction, run the existing duplicate detector across all rows once and compute `{ newCount, duplicateCount }`.
- Show a banner at the top of the review step:
  - "{duplicateCount} of {total} are already in your dictionary."
  - Radio toggle (or two-button segment): **Skip duplicates** (default) / **Update duplicates with new data**.
  - Selection wires the existing `updateDuplicates` flag in import settings (already implemented), just promotes it from the collapsed Settings popover to the main flow.
- Each duplicate row gets a subtle "Duplicate" badge (already partly there via `possibleDuplicate`); ensure consistent styling.

i18n: `duplicatePreviewSummary`, `skipDuplicates`, `updateDuplicates` (already exists).

---

## 6. Spaced repetition for "Weakest words"

**Problem.** Today's "weakest words" is a binary recent-error list. No interval logic, so the same word can dominate forever even after several correct answers.

**Fix.**
- In `src/lib/quizHistory.ts`, extend the per-entry record with SM-2 fields: `{ box: 0..5, ease: number, intervalDays: number, dueAt: number, lastResult: "ok" | "fail" }`.
- On every quiz answer, update the record:
  - Wrong → `box = max(0, box - 1)`, `intervalDays = 1`, `dueAt = now + 1d`.
  - Right → `box = min(5, box + 1)`, `intervalDays = roundedSm2(intervalDays, ease)`, `dueAt = now + intervalDays`.
- New "Smart practice" mode in Quiz that draws first from `dueAt <= now` ordered by lowest box, then fills the rest from random entries.
- "Weakest words" tab in `QuizHistory` shows entries grouped by box (1–5) with due-date hints. Keep the legacy list as a fallback for entries that have no SM-2 record yet.
- Migration: existing quiz history seeds new entries at `box = 2` so nothing resets.

i18n: `quiz.smartPractice`, `quizHistory.dueToday`, `quizHistory.boxLabel`.

---

## 7. Conflict indicator in CloudSyncIndicator

**Problem.** `CloudSyncIndicator` only shows syncing/synced/error. If local and remote both changed since last sync (e.g. edits on another tab while offline), the user has no signal.

**Fix.**
- In `src/hooks/useGoogleSheets.ts`, when fetching remote, compare remote `updatedAt` vs local `lastSyncedAt`:
  - If both diverged since last sync → emit a `"conflict"` state.
- Add `"conflict"` variant to `CloudSyncIndicator.tsx`: amber dot + tooltip "Local and cloud copies differ".
- Click opens a small dialog: "Use local", "Use cloud", "Merge (keep both)". Merge = union by `(danish, english)` key, preferring local for matching pairs.
- Conservative default: do nothing automatically; require an explicit user choice.

i18n: `sync.conflictTitle`, `sync.useLocal`, `sync.useCloud`, `sync.mergeBoth`.

---

## 8. Accessibility — remaining gaps

a) **Focus restoration after LexisCard delete.** In `src/components/LexisCard.tsx` (or its parent list in `Index.tsx`), capture the index of the deleted card, then on next render move focus to the sibling at the same index (or the previous one if it was the last). Use a ref map `cardRefs: Map<id, HTMLElement>`.

b) **`motion-reduce` Tailwind variants.** The global `prefers-reduced-motion` CSS already neutralises animations, but add explicit `motion-reduce:transform-none motion-reduce:animate-none` on:
- The dropzone hover scale in `BulkImport.tsx`.
- The pulse animation in `src/components/ProcessingSteps.tsx`.

This makes intent explicit per-component for future maintainers and covers Tailwind JIT edge cases.

c) **Contrast verification for `text-lang-en` / `text-lang-da`.** Run an actual WCAG check on the two accent colours against the cream background — both normal and small text. Tools: webaim contrast checker or the `wcag-contrast` npm package in a one-off script. If either fails AA (4.5:1 small / 3:1 large), darken the HSL `L` value in `tailwind.config.ts` until it passes; update both light and dark themes in `index.css`. Document the chosen ratios in a comment next to the tokens.

---

## 9. Optimistic UI on add / delete

**Problem.** Add/delete already updates local state immediately in some paths but waits for cloud sync in others, producing inconsistent latency.

**Fix.** In `src/hooks/useLexicon.ts`:
- `addEntry` and `deleteEntry` always update local state synchronously and return.
- Cloud write happens in the background; on failure, rollback the local change and surface a toast with **Retry**.
- Track in-flight ops in a `pendingOps: Map<id, "create" | "delete">` so the UI can show a subtle dim/spinner on rows that aren't yet confirmed (`opacity-70` + tiny inline spinner).
- Update tests in `src/hooks/useGoogleSheets.preservation.test.ts` to cover rollback.

---

## 10. AI verb-form helper at entry creation

**Problem.** Verb entries need present/past/perfect forms but the user has to type them manually. The single-word autofill already exists for the basic word — extend it.

**Fix.**
- When `type === "verb"` in `AddEntryForm.tsx`, after the user enters Danish + English (or just Danish), reveal an "AI: fill verb forms ✨" button below the grammar fields.
- Calls a new helper `autocompleteVerbForms(infinitive)` in `src/lib/gemini.ts` that returns `{ presentTense, pastTense, perfectTense, examples? }`.
- Pre-fills the matching `<GrammarFields>` inputs but doesn't save until the user clicks Save. Each filled field gets a subtle `bg-accent/30` highlight to mark it as AI-suggested.
- Reuse existing rate-limit handling (`GeminiRateLimitError`) and error toasts.
- Same UX hooked into the existing autofill pipeline if `type === "verb"` — extend `autocompleteSingleWord` rather than duplicating, and merge results into `grammar`.

i18n: `addEntry.aiFillVerbForms`, `addEntry.aiFillVerbFormsHint`.

---

## Suggested order of implementation

1. **Empty-state CTA** (#1) — small, fixes today's blocker.
2. **Cancel + retry partial** (#2, #3) — most-requested resilience pair.
3. **Inline edit + duplicate preview** (#4, #5) — finishes the bulk-import UX overhaul.
4. **A11y gaps + optimistic UI** (#8, #9) — quality polish.
5. **Spaced repetition + conflict indicator + verb helper** (#6, #7, #10) — bigger, ship individually.

Each block can be its own PR; nothing here couples to another block's data model.