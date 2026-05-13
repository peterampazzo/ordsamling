## Plan status + a11y / testing alignment

Verified via grep + test runs: items #1–#8 and #10 are implemented. Item #9 (optimistic UI rollback in `useLexicon`) is still pending. For every remaining item we follow the existing testing + WCAG conventions you've already established:

### Existing conventions to preserve (apply to every remaining item)

- **Vitest component tests** in `src/test/` (or alongside the component) using `@testing-library/react` and the `// Feature: wcag-3-accessibility, Property N` header style.
- **axe-core component checks** added to `src/test/axe-components.test.tsx` for any new component (zero critical/serious WCAG 2.x violations, `wcag2a/2aa/21aa/22aa` tags).
- **Playwright E2E** in `playwright/accessibility.spec.ts`: any new route (none planned) gets added to `PAGES`; existing routes that gain new UI must still pass at 1280×720 and 375×812.
- **aria-live regions** must pre-exist content injection (`aria-live-regions.test.tsx` pattern) — banners and toasts should mount once and update text, not mount on demand.
- **aria-states** (`aria-states.test.tsx` pattern) for any new toggle/expandable.
- **form-labels** (`form-labels.test.tsx` pattern) for any new input.
- **icon-labels** (`icon-labels.test.tsx` pattern) for any new icon-only button.
- **contrast tokens** — any new color tokens go into `src/test/contrast-tokens.ts` so `Property 1/2` tests cover them automatically.
- **i18n strings only**, no hardcoded text (existing core rule).

### Per-item additions

**#4 Inline edit before commit** (`UnifiedReviewSection.tsx`)
- Editable rows with `Input` + `Select` + trash + "Edit grammar" toggle.
- Tests: form-labels for the row inputs, aria-states for the expand toggle, icon-labels for the trash button, axe check on the section.

**#5 Duplicate preview banner**
- Banner + Skip/Update segmented control above the review list.
- Banner mounts once with `aria-live="polite"`; text updates via state (so `aria-live-regions` test stays green).
- Add the banner component to `axe-components.test.tsx`.

**#6 Spaced repetition / Smart practice**
- Pure functions in `quizHistory.ts` (`updateSm2`, `pickDue`) — unit tests in `quizHistory.test.ts`.
- Migration test: existing records seed at `box=2`.
- New "Smart practice" mode in `Quiz.tsx`: form-labels for radio choice, axe check.

**#7 Conflict indicator**
- Add `"conflict"` variant to `CloudSyncIndicator.tsx` — extend the existing `aria-live-regions` test case (it already renders this component) and the `axe-components` test to cover the new state.
- Conflict-resolution dialog: form-labels + axe coverage; focus trap inherited from `Dialog`.
- Pure conflict-detection logic in `useGoogleSheets.ts` covered by a unit test in `useGoogleSheets.test.ts`.

**#8 A11y gaps** (already a testing item — keep it test-led)
- a) Focus restoration after `LexisCard` delete — write a test in `src/test/` that renders a list, deletes a card, asserts focus moved to the sibling.
- b) `motion-reduce:` Tailwind variants on dropzone hover and `ProcessingSteps` pulse — snapshot/class assertion test that confirms the variant classes are present.
- c) Run `wcag-contrast` over `text-lang-en` / `text-lang-da` against cream; if they fail, darken HSL `L` in `tailwind.config.ts` and add the pair to `TOKEN_PAIRS` so `Property 1/2` enforces it forever.

**#9 Optimistic UI**
- `pendingOps` map + rollback in `useLexicon.ts`.
- Extend `useGoogleSheets.preservation.test.ts` with a rollback case (failed cloud write reverts local state, toast shown with Retry).
- Pending rows get `aria-busy="true"` so screen readers announce in-flight state — covered by an aria-states test.

**#10 AI verb-form helper**
- `autocompleteVerbForms` in `gemini.ts` — unit test parallel to existing `gemini.bugCondition.test.ts`.
- Button in `AddEntryForm.tsx`: icon-label test (it has the ✨ icon but a real text label, so it's compliant by construction); form-labels test verifies the highlighted fields keep their `<Label>` association.

### Definition of done for every remaining item

1. Implementation + i18n strings (da + en).
2. Vitest unit/component tests added or extended.
3. `axe-components.test.tsx` updated if a new component or new visual state is introduced.
4. Playwright `accessibility.spec.ts` still green at both viewports (no edits expected, just verify).
5. Contrast tokens table updated if any new color tokens are introduced.

### Suggested next chunk

Per the original order: **#4 + #5** next (finishes bulk-import UX, single PR), then **#8 + #9**, then ship #6, #7, #10 individually.

Tell me which chunk to pick up — default is #4 + #5.
