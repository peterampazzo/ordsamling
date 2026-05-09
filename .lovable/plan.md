## Goals

1. **Two-card hero**: split upload area into "Upload file" + "Paste text" cards.
2. **Visual stepper** showing the current AI processing phase.
3. **Comprehensive accessibility audit** across the entire app — not just BulkImport.

---

## Part 1 — Two-card hero (BulkImport)

Replace the single dropzone with a 2-column grid (stacks on mobile):

```text
┌─────────────────────────┬─────────────────────────┐
│  [📄] Upload a file     │  [✏️] Paste text        │
│  Drag & drop or click   │  ┌───────────────────┐  │
│  .txt, .md, .docx       │  │ Paste here…       │  │
│  [ Choose file ]        │  └───────────────────┘  │
│                         │  [ Send to AI ]         │
└─────────────────────────┴─────────────────────────┘
```

- Both feed `handleProcessDocument`, refactored to accept `File | string`.
- "Direct processing" checkbox stays above and applies to both.
- Shared progress region (stepper + preview + cancel) appears below the grid during processing.
- Existing CSV/JSON paste textarea further down stays — that's structured-data import, not AI.

---

## Part 2 — Visual stepper

New component `src/components/ProcessingSteps.tsx`. Horizontal stepper above the progress bar:

```text
●─────●─────○─────○
Read  Extract  AI   Done
```

States per step: pending (gray outline) · active (filled primary, pulsing ring) · complete (check icon) · error (X icon).

Steps adapt to mode:
- **Direct (file)**: Read file → Send to AI → Done
- **Chunked (file)**: Read file → Extract words → AI (chunk N/M) → Done
- **Paste**: Send to AI → Done

Each active step shows a sub-label (e.g. "Chunk 2 of 5", "12 543 chars"). Live word-list preview (chip list, first 50 + "+N more") below the stepper, updates as chunks complete. Truncation badge when text was sliced to 6 000 chars. Collapsible "Document text" panel showing first ~500 chars.

### Extend progress callback (`src/lib/gemini.ts`)
```ts
type ProgressUpdate = {
  phase: "reading" | "extracting" | "ai" | "done";
  step: number; totalSteps: number;
  completed: number; total: number;
  message?: string; preview?: string[]; truncated?: boolean;
};
```

Plus: thread `AbortSignal` through `processDocument*` for a Cancel button. 30 s timeout around `mammoth.extractRawText` → inline error. Replace remaining `alert()` with the existing `documentError` panel. "Retry AI" button when 0 entries returned.

---

## Part 3 — App-wide accessibility audit

### Findings from quick survey

**Document & landmarks**
- `index.html` has no `lang` attribute → set `lang="da"` (or sync to current i18n locale).
- No `<main>` landmark or skip link → add visually-hidden "Skip to main content" anchor in `PageHeader`, wrap page content in `<main id="main">`.
- Footer (`PageFooter`) missing `<footer>` semantic role check.

**Headings**
- Most pages have no `<h1>` (Landing, Index, BulkImport, Quiz, QuizHistory, Privacy). The `Wordmark` is just a `<span>`. → Add a visually-hidden `<h1>` per page (e.g. "Ordsamling — vocabulary list"), keep the visual wordmark as-is.
- BulkImport jumps from no-h1 to `<h2>`; Index uses sticky `<h2>` for category headers — fine once an h1 exists.
- Quiz uses `<h2>` for setup sections — promote one to `<h1>` ("Quiz") or add hidden h1.

**Icon-only buttons missing labels**
- `DemoBanner.tsx:17` close button — needs `aria-label`.
- `LexisCard.tsx:144, 256, 268` — edit/delete/expand buttons (icon-only) need i18n `aria-label`.
- `QuizHistory.tsx:37` back/clear icon button — verify label.
- BulkImport dismiss button uses untranslated `aria-label="Dismiss"` → use i18n string.
- `CloudSyncIndicator` icon button — needs label describing sync state.

**Form controls**
- BulkImport settings number inputs (lines 1032, 1043): `<label>` without `htmlFor`/`id` → wire them.
- `AddEntryForm` translation inputs use `<span>` headings instead of `<label htmlFor>` — convert to proper labels (or `aria-labelledby`).
- `SettingsDialog` inputs — verify each has an associated label.
- Search input in Index — confirm `aria-label` or visible `<label>`.

**Interactive elements**
- Dropzone (`role="button" tabIndex={0}`) → add `aria-busy={isProcessing}` and `aria-describedby` pointing at the stepper region.
- Quiz answer buttons (Quiz.tsx:883) — add `aria-label` with full answer for screen readers when buttons are icon-decorated; ensure disabled state announced via `aria-disabled`.
- Tab buttons in QuizHistory (lines 137, 142) — wrap in a `role="tablist"` with `role="tab"` + `aria-selected`.
- Sortable category chips in Index — confirm `aria-pressed` for toggle state.

**Live regions & status**
- Toasts: Sonner already announces; verify `richColors` doesn't strip aria.
- Progress stepper region: `aria-live="polite"` + `aria-atomic="false"` so phase changes are announced without re-reading the whole region.
- Import results summary: `role="status"`.
- Quiz "Correct!" / "Wrong" feedback: `role="status" aria-live="assertive"`.

**Focus management**
- Confirm shadcn `Dialog`, `AlertDialog`, `DropdownMenu` (used in SettingsDialog, duplicate-handling) restore focus on close — they do by default, but verify none of our custom `onOpenChange` handlers break it.
- After deleting an entry in `LexisCard`, focus is lost → move focus to the next card or the "Add" button.
- After successful import on BulkImport, focus the results summary heading.

**Color contrast (manual check needed in build)**
- `--muted-foreground` on cream background — measure; if < 4.5:1 against `--background`, darken.
- `text-lang-en`, `text-lang-da`, `text-lang-it` accent colors — verify ≥ 4.5:1.
- Disabled states (`disabled:opacity-40`) often drop below contrast — acceptable since disabled, but add `aria-disabled` so AT users know why.

**Keyboard navigation**
- Tab through every page; confirm visible focus ring on all interactive elements (shadcn `Button` has it; verify our custom buttons in `Index`, `Quiz`, `LexisCard` retain `focus-visible:ring`).
- Esc closes dialogs and the AddEntryForm card.
- Enter/Space activate the dropzone (already handled).
- Arrow keys for the question-count chip group in Quiz (line 725) — wrap in `role="radiogroup"` with arrow-key handling.

**Images & icons**
- Wordmark book icon: should be `aria-hidden="true"` (decorative); the wordmark text carries meaning.
- All Lucide icons used decoratively next to text → `aria-hidden="true"` (most are; spot-check `LexisCard`, `PageHeader`, settings).
- No `<img>` tags in app aside from favicons — fine.

**Other**
- `<noscript>` fallback in `index.html` for users without JS.
- Reduced-motion: wrap the dropzone scale animation, stepper pulse, and Sonner toasts with `motion-reduce:` Tailwind variants.
- `prefers-color-scheme` — confirm dark mode tokens have parity contrast (project is light-only per memory, but verify nothing breaks if OS forces dark).

### Files touched
- `index.html` — `lang`, `<noscript>`
- `src/components/layout/PageHeader.tsx` — skip link, hidden h1 slot, `<main>` landmark wiring
- `src/components/layout/PageContainer.tsx` — wrap in `<main>` if not already
- `src/pages/Landing.tsx`, `Index.tsx`, `BulkImport.tsx`, `Quiz.tsx`, `QuizHistory.tsx`, `Privacy.tsx`, `NotFound.tsx`, `DemoEntry.tsx` — h1 per page, live regions, focus management
- `src/components/DemoBanner.tsx`, `LexisCard.tsx`, `CloudSyncIndicator.tsx`, `AddEntryForm.tsx`, `SettingsDialog.tsx` — icon-button aria-labels, label associations
- `src/index.css` — contrast tweaks, `motion-reduce` tokens if needed
- `src/i18n/da.yaml` + `en.yaml` — all new aria/skip/heading strings (no hardcoded text)

---

## Out of scope
- Reworking the AI prompt or chunk size.
- Swapping `mammoth` for a different parser.
- Full WCAG AAA — targeting AA on the most-used flows.
- Automated a11y testing harness (could be a follow-up: `vitest-axe`).

## Sequencing
1. Two-card hero + paste-to-AI wiring.
2. `ProcessingSteps` + extended progress callback + cancel/retry/timeout.
3. Live preview, truncation badge, document text panel.
4. Accessibility pass — landmarks/headings/lang first, then labels, then live regions, then contrast/keyboard.
