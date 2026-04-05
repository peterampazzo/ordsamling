import { useState, useMemo } from "react";
import { Search, BookOpen, ArrowDownAZ, Clock, Tag, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLexicon } from "@/hooks/useLexicon";
import { AddEntryForm } from "@/components/AddEntryForm";
import { LexisCard } from "@/components/LexisCard";
import type { LexisEntry } from "@/hooks/useLexicon";
import { TYPE_SORT_ORDER } from "@/lib/lexicon";

type SortMode = "newest" | "alpha" | "type";

const sortEntries = (entries: LexisEntry[], mode: SortMode) => {
  const sorted = [...entries];
  switch (mode) {
    case "newest":
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case "alpha":
      return sorted.sort((a, b) => (a.danish || a.english).localeCompare(b.danish || b.english, "da"));
    case "type":
      return sorted.sort(
        (a, b) =>
          TYPE_SORT_ORDER[a.type] - TYPE_SORT_ORDER[b.type] ||
          (a.danish || a.english).localeCompare(b.danish || b.english, "da"),
      );
  }
};

const SORT_OPTIONS: { value: SortMode; label: string; description: string; icon: typeof Clock }[] = [
  { value: "newest", label: "Nyeste", description: "Senest tilføjet først", icon: Clock },
  { value: "alpha", label: "A–Å (dansk)", description: "Alfabetisk efter det danske ord", icon: ArrowDownAZ },
  { value: "type", label: "Type", description: "Grupperet efter ordklasse (ord, substantiv, verbum …), derefter dansk A–Å", icon: Tag },
];

const Index = () => {
  const {
    entries,
    allEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    deleteEntry,
    findMatches,
    findLinkedWords,
    isLoading,
    isSaving,
  } = useLexicon();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [sort, setSort] = useState<SortMode>("newest");

  const sorted = useMemo(() => sortEntries(entries, sort), [entries, sort]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-3xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-5 w-5 text-primary shrink-0" aria-hidden />
              <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">Ordsamling</h1>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0" title="Antal opslag">
              {allEntries.length} ord
            </span>
          </div>

          <div className="flex items-center gap-2 py-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søg…"
                className="h-9 pl-9 text-sm"
                aria-label="Søg i ordbogen"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1.5 h-9 px-3"
              onClick={() => setAddFormOpen(true)}
              disabled={isSaving}
              aria-haspopup="dialog"
              aria-expanded={addFormOpen}
              aria-label="Tilføj nyt ord"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Tilføj</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pb-2.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0 mr-0.5">
              Sortér
            </span>
            {SORT_OPTIONS.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value)}
                aria-pressed={sort === value}
                title={description}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                  sort === value
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-secondary/80 text-secondary-foreground border-border hover:border-primary/40"
                }`}
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                {label}
              </button>
            ))}
          </div>

        </div>
      </header>

      <Dialog open={addFormOpen} onOpenChange={setAddFormOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 border-0 bg-background p-0 shadow-none rounded-none overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200",
          )}
        >
          <DialogTitle className="sr-only">Tilføj nyt ord</DialogTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="mx-auto w-full max-w-3xl">
              <AddEntryForm
                onAdd={addEntry}
                onCancel={() => setAddFormOpen(false)}
                onEdit={(id) => {
                  setEditingId(id);
                  setAddFormOpen(false);
                }}
                findMatches={findMatches}
                disabled={isSaving}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-base">Indlæser ord…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {allEntries.length === 0 ? (
              <>
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-base">Ingen ord endnu</p>
                <p className="text-sm mt-1">Tryk «Tilføj» ovenfor for at komme i gang</p>
              </>
            ) : (
              <p>Ingen resultater for «{search}»</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((entry) => (
              <LexisCard
                key={entry.id}
                entry={entry}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
                linkedWords={findLinkedWords(entry)}
                startEditing={editingId === entry.id}
                onEditingDone={() => setEditingId(null)}
                disabled={isSaving}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
