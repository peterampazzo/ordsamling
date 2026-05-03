## Goal

Make the AI document processor aware of the user's enabled extra languages so it generates translations for exactly the languages the user has turned on (e.g. `fr`, `de`), instead of hardcoding Italian.

## How it works today

- `process-document.ts` always asks the AI for `english` + `italian` and writes a top-level `italian` field on each entry.
- The new data model has no `italian` field — translations live under `translations: { [code]: text }`.
- Enabled extra languages are stored client-side in `localStorage` (`getExtraLanguages()` in `src/lib/settings.ts`). The Worker has no way to know them unless the client sends them.

## Changes

### 1. Client sends enabled languages

In `src/pages/BulkImport.tsx`, when calling `/api/process-document`:
- Read `getExtraLanguages()` from settings.
- Append them to the FormData as `languages` (comma-separated ISO codes, e.g. `fr,de`).

### 2. Worker uses them in the prompt

In `functions/api/process-document.ts`:
- Parse the `languages` form field; validate each as a 2–3 letter lowercase code; cap to a reasonable max (e.g. 5) to limit prompt size.
- Update `processWord()` prompt to ask for `english` plus one field per requested code, returning a JSON shape like:
  ```json
  { "english": "...", "type": "...", "notes": "...", "translations": { "fr": "...", "de": "..." } }
  ```
- Map the response into `LexisEntryInput` with `translations: { ... }` (only include non-empty strings). Drop the old top-level `italian` field entirely.
- Remove `italian` from the `LexisEntry` interface and `readEntries()` normalization in this file (matches the rest of the codebase).

### 3. Bulk import preview supports extra translations

So results returned from `/api/process-document` actually round-trip:
- In `BulkImport.tsx`, accept `translations` on incoming entries from the document processor and pass them through to `addEntry`.

### 4. Outdated examples / docs (related cleanup)

- Replace `EXAMPLE_INPUT` and `EXAMPLE_JSON` in `BulkImport.tsx`: drop Italian, show Danish + English with an optional `translations: { fr: "..." }` example.
- Update `.github/AI_IMPORT_FORMAT.md` to remove `italian`, document the `translations` object, and refresh the JSON / CSV examples.

## Out of scope

- Changing how CSV columns map to extra languages (separate question — can follow up if you want generic `xx` columns to map into `translations`).
- Any UI for picking which subset of enabled languages to use for a given import (we just use all currently-enabled extras).

## Files touched

- `functions/api/process-document.ts`
- `src/pages/BulkImport.tsx`
- `.github/AI_IMPORT_FORMAT.md`
