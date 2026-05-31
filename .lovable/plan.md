# Harden Google Drive sync against stale overwrites

## Goals
- Prevent older local data from overwriting newer sheet data.
- Guarantee offline-saved changes are retried until they upload.
- Warn clearly when sync is stale, blocked, or auth has expired.
- Keep quiz history append-only so locally saved quiz results are not lost.

## What will change

### 1. Stop full-sheet rewrites in normal sync paths
- Keep `Lexicon` writes row-level (`append`, `update`, `delete`) during normal app use.
- Keep `QuizHistory` and `StreakHistory` append-only during normal app use.
- Restrict full-sheet operations to initial migration/recovery only, not routine syncing.
- Update migration/reconnect flow so it merges before any bulk rewrite, instead of blindly clearing tabs.

### 2. Prevent stale entries from overwriting newer remote rows
- In `useGoogleSheets`, after pulling latest remote data before a write, re-read the merged local row by `entry.id`.
- If the merged version is newer than the pending local payload, skip the write and mark it as superseded instead of pushing stale data.
- Apply the same protection to deletes so an older device cannot delete a newer remote edit.
- Preserve last-write-wins by `updatedAt`, but make it safe.

### 3. Make the dirty queue reliable for weak/offline connectivity
- Treat offline save as durable local success first, remote sync second.
- Ensure all failed writes queue with enough information to retry later.
- Add retry triggers beyond the current ones: app startup, tab focus, visibility change, manual sync, and network reconnect.
- Retry the queue in order and only remove items after confirmed success.
- Add deduping/coalescing for repeated updates to the same lexicon entry so the queue does not grow with obsolete edits.
- Keep quiz sessions append-only in the queue so a locally saved result always gets another chance to upload.

### 4. Surface out-of-sync state clearly in the UI
- Add a visible sync status banner for important states:
  - auth expired
  - sync conflict / remote newer than local
  - pending unsynced changes
  - sync failed repeatedly
- Keep the compact cloud icon, but make it secondary to the banner for important states.
- Show a reconnect action when Google auth has expired.
- Show retry / sync-now actions when there are queued local changes.
- Make disconnected/expired state visible even if the user is not looking for the tiny icon.

### 5. Handle 7-day Google test-mode expiry more safely
- On app load and when returning to the tab, proactively check whether auth is expired.
- If expired, switch to an explicit blocked-sync state instead of silently continuing as if sync were healthy.
- Continue saving locally while auth is expired, but clearly show that remote sync is paused until reconnect.
- After reconnect, flush the queue before any new pull/push cycle.

### 6. Preserve quiz results saved under bad coverage
- Make queued `quiz_history` uploads retry automatically on every relevant retry trigger.
- Add a stronger recovery path so pending quiz sessions are pushed after reconnect or when connection returns.
- Show pending count/status in the sync UI so the user knows local quiz results are waiting to upload.

## Files likely involved
- `src/hooks/useGoogleSheets.ts`
- `src/services/GoogleSheetsService.ts`
- `src/lib/migration.ts`
- `src/components/CloudSyncIndicator.tsx`
- shared layout/page container where a sync banner should mount
- `src/i18n/en.yaml`
- `src/i18n/da.yaml`
- sync-related tests in `src/hooks` / `src/services`

## Technical details
- Add a guarded write path that compares pending local payloads against the freshest merged local/remote state before writing.
- Introduce explicit sync sub-states/messages for `expired`, `pending`, `conflict`, and `retrying`.
- Keep append-only history tabs append-only; do not replace them during normal operation.
- Bulk rewrite methods remain available only for migration/recovery flows and must merge first.
- Add tests for:
  - stale local update skipped when remote is newer
  - stale delete skipped when remote is newer
  - offline quiz result enters queue and is retried on reconnect/focus/startup
  - expired auth shows blocked-sync UI while preserving local saves
  - queue items are removed only after confirmed upload

## Result
The app will still work offline-first, but older devices won’t clobber newer data, expired Google auth will be obvious, and locally saved quiz results will keep retrying until they reach the sheet.