## Goal

Make `/import` feel calmer and more on-brand without touching the parsing/AI/import logic. Also gate the document upload so it's clearly disabled (and explained) when the Gemini API key isn't set.

## Changes — `src/pages/BulkImport.tsx` (UI only)

Reorder the page into a clearer top-to-bottom flow:

1. **Document upload (hero card)** — promoted to the top, becomes the primary CTA.
   - Replace the raw `<input type="file">` with a custom **dropzone**: dashed border, `FileUp` icon, headline + hint, "Choose file" button. Hidden file input wired to the dropzone (drag-and-drop + click).
   - When `getGeminiApiKey()` returns null: render a **locked state** instead — a muted card with a `Lock` icon, the headline `bulkImport.keyMissingTitle`, body `bulkImport.keyMissingBody`, and a `bulkImport.keyMissingCta` button that scrolls/links to settings (uses `window.dispatchEvent(new Event('ordsamling:open-settings'))` if wired, otherwise a `<Link to="/app">` with toast — fallback: just disable + show explainer). The dropzone visuals stay but with `opacity-50 pointer-events-none` overlay so users still see what's behind the gate.
   - Progress bar styling unchanged (already nice).

2. **Manual paste (secondary card)** — moved below upload, framed as alternative.
   - Section title `bulkImport.pasteSectionTitle` with description `bulkImport.pasteSectionDescription`.
   - Textarea kept, but wrapped in the same card pattern as upload for visual consistency.
   - "Analyze" button stays.

3. **Format reference (collapsible)** — wrap the existing "Format" instructions block in a `<details>` collapsed by default with summary `bulkImport.formatHelpToggle`. Keeps the info accessible without dominating the page.

4. **Settings, preview table, results** — unchanged behavior. Light visual polish:
   - Section headings standardized: small icon + `text-sm font-semibold` (already mostly there).
   - Use consistent card pattern: `rounded-lg border border-border bg-card p-4 sm:p-5 space-y-3`.
   - Add a little breathing room: `space-y-8` between top-level sections instead of `space-y-6`.

## Changes — i18n

Add to `src/i18n/en.yaml` and mirror in `src/i18n/da.yaml` under `bulkImport:`:
- `uploadIntro`, `uploadHint`, `uploadProcessing`
- `keyMissingTitle`, `keyMissingBody`, `keyMissingCta`
- `formatHelpToggle`
- `pasteSectionTitle`, `pasteSectionDescription`

Replace the two remaining hardcoded English strings ("Add a Gemini API key in Settings…", "Add a Gemini API key in Settings to use document processing.") with the new i18n keys.

## Out of scope

- No changes to `parseInput`, `parseRows`, `parseJsonObjects`, `handleProcessDocument`, `handleParse`, `handleImport`, retry logic, or any data flow.
- No changes to `functions/api/process-document.ts` or `src/lib/gemini.ts`.
- No new dependencies.

## Files

- edit: `src/pages/BulkImport.tsx`
- edit: `src/i18n/en.yaml`, `src/i18n/da.yaml`
