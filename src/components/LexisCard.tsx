import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { LexisEntry } from "@/hooks/useLexicon";

interface Props {
  entry: LexisEntry;
  onUpdate: (id: string, updates: Partial<Omit<LexisEntry, "id" | "createdAt">>) => void;
  onDelete: (id: string) => void;
}

export function LexisCard({ entry, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry);

  const save = () => {
    onUpdate(entry.id, { danish: draft.danish, english: draft.english, italian: draft.italian, notes: draft.notes });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-ring/30 bg-card p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input value={draft.danish} onChange={(e) => setDraft({ ...draft, danish: e.target.value })} autoFocus />
          <Input value={draft.english} onChange={(e) => setDraft({ ...draft, english: e.target.value })} />
          <Input value={draft.italian} onChange={(e) => setDraft({ ...draft, italian: e.target.value })} />
        </div>
        <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
          <Button size="sm" onClick={save}><Check className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 flex-1 min-w-0">
          <div>
            <span className="text-[10px] font-medium text-lang-da uppercase tracking-wider">Dansk</span>
            <p className="text-foreground font-medium truncate">{entry.danish || "—"}</p>
          </div>
          <div>
            <span className="text-[10px] font-medium text-lang-en uppercase tracking-wider">English</span>
            <p className="text-foreground truncate">{entry.english || "—"}</p>
          </div>
          <div>
            <span className="text-[10px] font-medium text-lang-it uppercase tracking-wider">Italiano</span>
            <p className="text-foreground truncate">{entry.italian || "—"}</p>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => { setDraft(entry); setEditing(true); }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(entry.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {entry.notes && (
        <p className="mt-2 text-sm text-muted-foreground border-t border-border pt-2 italic">{entry.notes}</p>
      )}
    </div>
  );
}
