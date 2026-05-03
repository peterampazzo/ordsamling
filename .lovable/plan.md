## Goal

Reduce duplicated layout code across pages and unify the brand. Today the sticky header markup, container widths, footer, and `Ordsamling.` wordmark are copy-pasted (and drift) across 6 pages. Extract them into shared primitives so every page composes the same building blocks.

## New shared components (`src/components/layout/`)

### `PageShell.tsx`
Wraps a page: `min-h-screen bg-background text-foreground` + flex column. Props: `children`, optional `footer` slot.

### `PageHeader.tsx`
The sticky header. Locks the visual contract:
`sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80`.
Props:
- `backTo?: string` — renders a back chevron link.
- `actions?: ReactNode` — right-side slot (sync indicator, settings, GitHub button, etc.).
- `subRow?: ReactNode` — optional second row (Index search/filters, Quiz progress bar).
- `width?: "app" | "wide"` — `max-w-3xl` (default) or `max-w-6xl` (Landing).
Always renders the `<Wordmark />` on the left.

### `Wordmark.tsx`
The `Ordsamling.` serif brand element. One source of truth for size/weight/link target. Variants: `sm` (in-app headers), `md` (Landing header), `lg` (Landing hero footer line). Links to `/app` from inside the app, `/` from Landing/Privacy (auto-detected via `useLocation`).

### `PageContainer.tsx`
Standard `<main>` wrapper: `max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-8`. Variant `wide` for Landing sections.

### `PageFooter.tsx`
The minimal GitHub + Privacy footer Index already has. Used on Index, Quiz, BulkImport, QuizHistory.

### `SerifHeading.tsx` (small win)
`<h1>`/`<h2>`/`<h3>` with consistent serif sizing tokens (`display`, `xl`, `lg`). Replaces the ~10 hand-tuned `font-serif text-... tracking-tight` strings in Landing/Privacy.

## Refactor pages to use them

- `Index.tsx` — replace inline header/footer with `<PageHeader subRow={...} actions={...} />` + `<PageFooter />`. Drops ~30 lines.
- `Quiz.tsx` — three duplicated headers collapse into `<PageHeader backTo="/app" />`, with the progress bar passed via `subRow`.
- `BulkImport.tsx` — same pattern, `<PageHeader backTo="/app" />`.
- `QuizHistory.tsx` — `<PageHeader backTo="/quiz" />`; standardize to `max-w-3xl` (currently `max-w-2xl`).
- `Privacy.tsx` — `<PageHeader backTo="/" />` and `<SerifHeading>` for sections.
- `Landing.tsx` — `<PageHeader width="wide" actions={...} />` using the same `Wordmark`. Section headings use `<SerifHeading>`.

## Cleanup

- Remove the now-dead `--lang-it` CSS var (`src/index.css`) and `lang.it` color (`tailwind.config.ts`) — Italian is forbidden per memory.
- Delete the `BookOpen` icon from Index header (replaced by wordmark); keep its use in the empty state.
- Add new layout primitives to `src/components/layout/index.ts` barrel for clean imports.

## Out of scope

- No copy/i18n changes. No palette changes. No behavior changes — purely structural refactor + brand consistency.
- Quiz inner question screens keep their `max-w-md` reading column; only the outer shell unifies.

## Files

- new: `src/components/layout/{PageShell,PageHeader,PageContainer,PageFooter,Wordmark,SerifHeading,index}.tsx`
- edit: `src/pages/{Index,Quiz,BulkImport,QuizHistory,Privacy,Landing}.tsx`
- edit: `src/index.css`, `tailwind.config.ts`
