import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, ArrowRight } from "lucide-react";
import type { LexisEntry, EntryType } from "@/hooks/useLexicon";

interface Props {
  onAdd: (entry: Omit<LexisEntry, "id" | "createdAt">) => void;
  onEdit: (id: string) => void;
  findMatches: (query: string) => LexisEntry[];
}

export function AddEntryForm({ onAdd, onEdit, findMatches }: Props) {
  const [open, setOpen] = useState(false);
  const [danish, setDanish] = useState("");
  const [english, setEnglish] = useState("");
  const [italian, setItalian] = useState("");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<EntryType>("word");

  const reset = () => {
    setDanish(""); setEnglish(""); setItalian(""); setNotes(""); setType("word");
  };

  // Live matching based on any field being typed
  const activeQuery = danish || english || italian;
  const matches = useMemo(() => findMatches(activeQuery), [findMatches, activeQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!danish.trim() && !english.trim() && !italian.trim()) return;
    onAdd({ danish: danish.trim(), english: english.trim(), italian: italian.trim(), notes: notes.trim(), type });
    reset();
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Tilføj ord
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Nyt ord</h3>
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Type toggle */}
      <div className="flex gap-2">
        {(["word", "expression"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              type === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-secondary-foreground border-border hover:border-primary/40"
            }`}
          >
            {t === "word" ? "Ord" : "Udtryk"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-lang-da mb-1 block">🇩🇰 Dansk</label>
          <Input value={danish} onChange={(e) => setDanish(e.target.value)} placeholder="dansk ord..." autoFocus />
        </div>
        <div>
          <label className="text-xs font-medium text-lang-en mb-1 block">🇬🇧 English</label>
          <Input value={english} onChange={(e) => setEnglish(e.target.value)} placeholder="english word..." />
        </div>
        <div>
          <label className="text-xs font-medium text-lang-it mb-1 block">🇮🇹 Italiano</label>
          <Input value={italian} onChange={(e) => setItalian(e.target.value)} placeholder="parola italiana..." />
        </div>
      </div>

      {/* Live matches */}
      {matches.length > 0 && (
        <div className="rounded-md border border-primary/20 bg-accent/50 p-3 space-y-2">
          <p className="text-xs font-medium text-accent-foreground">Findes allerede ({matches.length}):</p>
          {matches.slice(0, 4).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onEdit(m.id); setOpen(false); reset(); }}
              className="flex items-center justify-between w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors group"
            >
              <span className="truncate">
                <span className="text-lang-da">{m.danish}</span>
                {m.english && <span className="text-muted-foreground"> · {m.english}</span>}
                {m.italian && <span className="text-muted-foreground"> · {m.italian}</span>}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">📝 Noter</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="grammatik, eksempler, kontekst..." rows={2} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={() => { setOpen(false); reset(); }}>Annuller</Button>
        <Button type="submit">Gem</Button>
      </div>
    </form>
  );
}
