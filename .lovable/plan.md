## Why refresh doesn't pull your sheet edits

When you edit a row directly in Google Sheets, the `updatedAt` column doesn't change (the app is the only thing that bumps it). The merge logic in `mergeSheetsIntoLocal` only takes the sheet version when `sheetVersion.updatedAt > localEntry.updatedAt`. Result: your manual edit is silently ignored and the local copy "wins". Same story for rows you delete in the sheet — they're treated as "sheet-only missing" and never removed locally.

## What to change

### 1. Content-aware merge (detect sheet edits without an updatedAt bump)
In `mergeSheetsIntoLocal` (`src/hooks/useGoogleSheets.ts`):
- When sheet and local have the same id and same `updatedAt`, compare the meaningful fields (danish, english, notes, type, grammar, translations).
- If they differ and the entry has **no pending op in the dirty queue**, take the sheet version (sheet was edited manually).
- If a dirty op exists for that id, keep local (the user's unsynced change still wins until it's pushed).

### 2. Honor sheet-side deletes on manual pull
Add an explicit "pull from sheet" path used by the refresh button / `syncNow`:
- After flushing the dirty queue, if a local entry's id is missing from the sheet **and** has no pending op **and** existed before this session (i.e., it was previously synced), remove it locally.
- Background auto-sync keeps today's safer behavior (don't delete on missing) to avoid wiping data on transient read errors.

### 3. Make the refresh button do a real pull
Wire the refresh control to a new `pullFromSheet()` (or a `{ force: true }` variant of `syncNow`) that:
1. Flushes the dirty queue (so local unsynced edits aren't lost).
2. Re-reads the sheet.
3. Runs the new content-aware merge with delete handling.
4. Shows a toast like "Pulled N updates from Google Sheets" / "Already up to date".

### 4. Small UX touches
- In the sync banner / `CloudSyncIndicator` tooltip, label the action clearly: "Pull latest from Google Sheets".
- Add an i18n key for the toast and button.

## Files involved
- `src/hooks/useGoogleSheets.ts` — merge function, `syncNow`, new `pullFromSheet`.
- `src/components/CloudSyncIndicator.tsx` and/or `SyncStatusBanner.tsx` — wire the refresh action.
- `src/i18n/en.yaml`, `src/i18n/da.yaml` — new strings.
- Tests: extend `useGoogleSheets.*.test.ts` with cases for manual sheet edit (same updatedAt, different content), sheet-side delete with no pending op, and "don't clobber local pending edit".

## Out of scope
- Changing how the app writes `updatedAt` on its own edits.
- Two-way conflict UI beyond the existing banner.

After this, hitting refresh will reliably bring in edits and deletions you made directly in Google Sheets, while still protecting any local changes you haven't pushed yet.