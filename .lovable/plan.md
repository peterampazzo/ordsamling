# Plan — Full scope: Settings polish, Bulk Import wizard, AI autocomplete, extraLanguages sync, branded assets

Five workstreams. Independent commits possible. No breaking changes to existing OAuth/parsing/sync logic — only UI rearrangement plus a few new helpers.

---

## 1. Settings: consolidated Storage section

File: `src/components/SettingsDialog.tsx`

- Wrap status, email, link, and actions in one card: `rounded-lg border border-border bg-muted/30 p-4 space-y-3`.
- **Local-first disclaimer** at the top:
  > "Your data stays on your device by default. Use Export below to keep a backup. To sync across devices, you can store a private copy in a Google Spreadsheet."
- **Private-beta note** with hyperlink + Google-account aside:
  > "Google Sheets sync is in private beta — [write me](mailto:pietro@rampazzo.eu?subject=Ordsamling%20Google%20Sheets%20access) to request access (you'll need a Google account 😉)."
- When connected, single row: status badge · connected email · **"Open Spreadsheet ↗"** linking to `https://docs.google.com/spreadsheets/d/${syncState.spreadsheetId}` (`target="_blank" rel="noopener noreferrer"`, `ExternalLink` icon).
- Connect / Disconnect at the bottom of the card.
- New i18n keys under `settings.storage`: `disclaimer`, `betaNote`, `betaCta`, `googleAccountAside`, `openSpreadsheet`. Mirror in `en.yaml` + `da.yaml`.
- **No flag emojis** on language labels (Windows renders them as `FR`/`DE` boxes — would break the aesthetic).

## 2. Bulk Import: 4-step wizard

File: `src/pages/BulkImport.tsx` (+ small new component).

State machine: `'input' | 'processing' | 'review' | 'results'`. All existing handlers (`handleProcessDocument`, `handleParse`, `handleImport`, `parseInput`, `parseRows`) reused unchanged — only call sites move into step transitions.

- **Step 1 — Input**: two cards side-by-side (stacked on mobile):
  - File upload card — existing dropzone + locked state + `SettingsDialog` trigger.
  - Manual paste card — textarea + "Analyze" button.
  - When pasted text is a raw word list (heuristic: lines of 1–3 words, no `|` `:` `{` separators), surface a **"Magic Fill ✨"** secondary button calling new `processDocumentChunked()`.
- **Step 2 — Processing**: full-card progress view (existing progress bar + status text). Auto-advances to Review on success.
- **Step 3 — Review**: existing editable preview table, with Back / Import all.
- **Step 4 — Results**: existing success summary + "Import more" CTA that resets to Step 1.
- New `WizardStepper` component (~40 lines) at top of page showing the 4 step labels with current one highlighted. Visual only.

**New helper** in `src/lib/gemini.ts`: `processDocumentChunked(words: string[], onProgress)` — splits input into chunks of 50, sequentially calls existing `processDocument`, returns concatenated `LexisEntryInput[]`. No change to underlying API call shape.

i18n keys under `bulkImport.wizard`: `stepInput`, `stepProcessing`, `stepReview`, `stepResults`, `magicFill`, `magicFillHint`.

## 3. Single-entry AI autocomplete

Files: `src/lib/gemini.ts`, `src/components/AddEntryForm.tsx`.

- Add `autocompleteSingleWord(word: string, sourceLang: 'da' | 'en'): Promise<LexisEntryInput>` to `src/lib/gemini.ts`. Uses `callGemini` with strict JSON system instruction returning `{ danish, english, type, grammar, notes }`.
- In `AddEntryForm.tsx`, add a `Sparkles` icon button inside the Danish input (right side, like the show-key eye in Settings).
  - Disabled when Danish field empty or no Gemini key (tooltip explains why).
  - On click: spinner inside button, call `autocompleteSingleWord(danish, 'da')`, populate `english`, `type`, `grammar`, `notes`.
  - Errors → `toast.error`.
- i18n keys under `addEntry`: `aiAutofill`, `aiAutofillError`, `aiAutofillNoKey`.

## 4. Sync `extraLanguages` via Google Sheets

Files: `src/hooks/useGoogleSheets.ts`, `src/lib/settings.ts`, `src/lib/storageConfig.ts`.

- `GoogleSheetsService` already has `readSettings`/`writeSettings` for `extraLanguages` — reuse as-is.
- **On load**: in existing `syncOnLoad` effect, after merging entries call `sheetsService.readSettings()`. If `extraLanguages` differs from local, call `setExtraLanguages(...)` and dispatch `ordsamling:settings-changed`.
- **On change**: in `setExtraLanguages` (settings.ts), dispatch a new `ordsamling:settings-dirty` event. `useGoogleSheets` listens for it and calls `sheetsService.writeSettings()` debounced 1s, with dirty-queue fallback (mirrors `pushEntry`).
- Add `'settings'` operation type to `DirtyOperation` union in `storageConfig.ts`; handle it in `retryDirtyQueue`.

## 5. Branded OG preview image (1200×630)

One-off generation via `code--exec` Pillow script (matches landing-page hero style).

- Background `#fdfaf3` (warm parchment).
- Right side: oversized "Aa" in Playfair Display–style serif, `#1c2a3a` at ~6% opacity, bleeding off the right edge.
- Left side, vertically centered:
  - Small uppercase tracked label `YOUR LITTLE DANISH DICTIONARY` (navy, 70% opacity, wide letter-spacing).
  - Wordmark `Ordsamling.` in serif, ~96px navy.
  - Italic serif tagline `No more excuses for forgetting a Danish word.`
  - Tiny BookOpen glyph above the wordmark.
- Save to `public/og-image.png`.
- Update `index.html`: `og:image` + `twitter:image` from `/favicon.svg` → `/og-image.png`. Add `og:image:width=1200`, `og:image:height=630`.
- QA: render PNG, inspect, iterate.

## Out of scope

- No changes to OAuth flow, Cloudflare functions, favicon, or underlying Gemini request shape.
- No flag emojis (Windows rendering issue).
- No new dependencies.

## Files touched

- edit: `src/components/SettingsDialog.tsx`
- edit: `src/pages/BulkImport.tsx`
- edit: `src/lib/gemini.ts` (2 new exported functions)
- edit: `src/components/AddEntryForm.tsx`
- edit: `src/hooks/useGoogleSheets.ts`
- edit: `src/lib/settings.ts`
- edit: `src/lib/storageConfig.ts`
- edit: `src/i18n/en.yaml`, `src/i18n/da.yaml`
- edit: `index.html`
- new: `src/components/import/WizardStepper.tsx`
- new: `public/og-image.png` (generated)
