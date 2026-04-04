import { useState, useMemo } from "react";
import { Search, BookOpen, ArrowDownAZ, Clock, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLexicon } from "@/hooks/useLexicon";
import { AddEntryForm } from "@/components/AddEntryForm";
import { LexisCard } from "@/components/LexisCard";
import type { LexisEntry } from "@/hooks/useLexicon";

type SortMode = "newest" | "alpha" | "type";

const sortEntries = (entries: LexisEntry[], mode: SortMode) => {
  const sorted = [...entries];
  switch (mode) {
    case "newest":
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case "alpha":
      return sorted.sort((a, b) => (a.danish || a.english).localeCompare(b.danish || b.english, "da"));
    case "type":
      return sorted.sort((a, b) => a.type.localeCompare(b.type) || (a.danish || a.english).localeCompare(b.danish || b.english, "da"));
  }
};

const SORT_OPTIONS: { value: SortMode; label: string; icon: typeof Clock }[] = [
  { value: "newest", label: "Nyeste", icon: Clock },
  { value: "alpha", label: "A–Å", icon: ArrowDownAZ },
  { value: "type", label: "Type", icon: Tag },
];

const Index = () => {
  const { entries, allEntries, search, setSearch, addEntry, updateEntry, deleteEntry, findMatches, findLinkedWords } = useLexicon();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("newest");

  const sorted = useMemo(() => sortEntries(entries, sort), [entries, sort]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-1">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-2xl text-foreground">Ordsamling</h1>
          </div>
          <p className="text-sm text-muted-foreground">Dansk · English · Italiano — {allEntries.length} ord</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg ord..."
              className="pl-9"
            />
          </div>
          <AddEntryForm onAdd={addEntry} onEdit={(id) => setEditingId(id)} findMatches={findMatches} />
        </div>

        {/* Sort controls */}
        <div className="flex gap-1.5">
          {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setSort(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${
                sort === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:border-primary/40"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {allEntries.length === 0 ? (
              <>
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Ingen ord endnu</p>
                <p className="text-sm mt-1">Tilføj dit første ord for at komme i gang</p>
              </>
            ) : (
              <p>Ingen resultater for "{search}"</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <LexisCard
                key={entry.id}
                entry={entry}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
                linkedWords={findLinkedWords(entry)}
                startEditing={editingId === entry.id}
                onEditingDone={() => setEditingId(null)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
