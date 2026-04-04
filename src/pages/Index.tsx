import { Search, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLexicon } from "@/hooks/useLexicon";
import { AddEntryForm } from "@/components/AddEntryForm";
import { LexisCard } from "@/components/LexisCard";

const Index = () => {
  const { entries, allEntries, search, setSearch, addEntry, updateEntry, deleteEntry } = useLexicon();

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
          <AddEntryForm onAdd={addEntry} />
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
              <LexisCard key={entry.id} entry={entry} onUpdate={updateEntry} onDelete={deleteEntry} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
