import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import type { LexisEntry } from "@/hooks/useLexicon";

interface Props {
  onAdd: (entry: Omit<LexisEntry, "id" | "createdAt">) => void;
}

export function AddEntryForm({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [danish, setDanish] = useState("");
  const [english, setEnglish] = useState("");
  const [italian, setItalian] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setDanish("");
    setEnglish("");
    setItalian("");
    setNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!danish.trim() && !english.trim() && !italian.trim()) return;
    onAdd({ danish: danish.trim(), english: english.trim(), italian: italian.trim(), notes: notes.trim() });
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
