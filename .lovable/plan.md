# Onboarding inside `/demo`

## Why
`/demo` is already the "try without commitment" surface with pre-seeded entries. Instead of building a separate onboarding flow that has to guard against overwriting real user data, the tour runs *only* on `/demo`, on top of the already-seeded sample deck. One code path for sample data, no new route, no new flag.

## New behaviour

### 1. First visit to `/demo` → 3-step tour
A lightweight tooltip controller overlays the existing UI and walks the user through:

1. **Add an entry** — anchored to the AddEntryForm Danish input
2. **Quiz yourself** — anchored to the Quiz link in the header
3. **Track progress** — anchored to the StreakRing in the header

Footer controls: `Skip` · `Back` · `Next` / `Done`. Dismissal stored in `localStorage` under `ordsamling-demo-tour-seen`. Returning demo visitors don't see it again. Pressing `Esc` skips. Tour does not block interaction with the page — it's a sequence of popovers, not a modal.

### 2. `/app` empty state → "Try the demo" CTA
When the real user's lexicon is empty AND demo mode is off, show a single secondary CTA under the empty-state copy: "New here? Take the 30-second tour →" linking to `/demo`. No second sample-deck loader inside `/app`.

### 3. Landing page → optional tour entry
Add a secondary "Take the tour" button next to the existing demo CTA on `/pages/Landing.tsx`, pointing at `/demo`. Same destination as today; the copy just frames it as a guided experience.

## Implementation

### New file
- **`src/components/DemoTour.tsx`** — Tour controller. Uses shadcn `Popover` anchored to elements found via `document.querySelector('[data-tour="..."]')`. Holds step index in local state, writes the seen flag on completion or skip. Auto-scrolls the anchor into view between steps. Renders nothing when the seen flag is set or when not in demo mode.

### Edited files
- **`src/pages/DemoEntry.tsx`** — Mount `<DemoTour />` once at the page root, after `<Index demo />`.
- **`src/components/AddEntryForm.tsx`** — Add `data-tour="add"` to the Danish input wrapper.
- **`src/components/layout/PageHeader.tsx`** — Add `data-tour="quiz"` to the Quiz nav link.
- **`src/components/StreakRing.tsx`** — Add `data-tour="progress"` to the root link.
- **`src/pages/Index.tsx`** — In the empty-state branch, render a "Take the tour" link to `/demo` when `!demo && entries.length === 0`.
- **`src/pages/Landing.tsx`** — Add a secondary "Take the tour" button → `/demo`.
- **`src/i18n/en.yaml` + `src/i18n/da.yaml`** — Add `onboarding.tour.step1.{title,body}`, `step2.*`, `step3.*`, `skip`, `back`, `next`, `done`, plus `index.emptyState.tourCta` and `landing.takeTour`.

### Storage key
- `ordsamling-demo-tour-seen` — set to `"1"` on completion or skip. Cleared if the user manually clears localStorage; no replay UI in v1.

## Out of scope
- No tour replay button (can add later)
- No tour on `/app` — sample data and onboarding stay isolated to `/demo`
- No analytics — dismissal is local-only
- No changes to existing `/demo` seeding or exit flow

## Files touched
- `src/components/DemoTour.tsx` (new)
- `src/pages/DemoEntry.tsx`
- `src/pages/Index.tsx`
- `src/pages/Landing.tsx`
- `src/components/AddEntryForm.tsx`
- `src/components/layout/PageHeader.tsx`
- `src/components/StreakRing.tsx`
- `src/i18n/en.yaml`, `src/i18n/da.yaml`
