import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Check, X, Link, ChevronDown, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LexisEntry } from "@/hooks/useLexicon";
import { ENTRY_TYPES, entryTypeLabel, entryTypePillClass, pruneGrammar, type EntryType } from "@/lib/lexicon";
import { GrammarDisplay, GrammarFields } from "@/components/EntryGrammar";

interface Props {
  entry: LexisEntry;
  onUpdate: (
    id: string,
    updates: Partial<Omit<LexisEntry, "id" | "createdAt">> & { grammar?: LexisEntry["grammar"] | null },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  linkedWords: LexisEntry[];
  startEditing?: boolean;
  onEditingDone?: () => void;
  disabled?: boolean;
}

const SWIPE_PX = 72;
const MOBILE_STRIP_W = "5.5rem";

export function LexisCard({ entry, onUpdate, onDelete, linkedWords, startEditing = false, onEditingDone, disabled = false }: Props) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(entry);
  const prevStartEditing = useRef(false);

  useEffect(() => {
    if (startEditing && !prevStartEditing.current) { setDraft(entry); setEditing(true); }
    if (!startEditing && prevStartEditing.current) setEditing(false);
    prevStartEditing.current = startEditing;
  }, [startEditing, entry]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => { if (editing) setSwipeOpen(false); }, [editing]);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    const onChange = () => { if (mql.matches) setSwipeOpen(false); };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const startEdit = () => { setDraft(entry); setEditing(true); };
  const confirmDelete = async () => {
    setIsDeleting(true);
    try { await onDelete(entry.id); setDeleteDialogOpen(false); setSwipeOpen(false); } finally { setIsDeleting(false); }
  };
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    if (dx > SWIPE_PX) setSwipeOpen(true);
    else if (dx < -SWIPE_PX) setSwipeOpen(false);
    touchStartX.current = null;
  };

  const save = async () => {
    setIsSubmitting(true);
    try {
      const prunedGrammar = pruneGrammar(draft.grammar);
      await onUpdate(entry.id, {
        danish: draft.danish,
        english: draft.english,
        notes: draft.notes,
        type: draft.type,
        grammar: prunedGrammar === undefined ? null : prunedGrammar,
      });
      setEditing(false);
      onEditingDone?.();
    } finally { setIsSubmitting(false); }
  };

  const cancel = () => { setEditing(false); onEditingDone?.(); };

  if (editing) {
    return (
      <div className="rounded-lg border border-ring/30 bg-card p-3 shadow-sm space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          {ENTRY_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setDraft((d) => (d.type === t ? d : { ...d, type: t, grammar: {} }))} disabled={disabled || isSubmitting}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${draft.type === t ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:border-primary/40"}`}>
              {entryTypeLabel(t)}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Dansk</span>
          <Input value={draft.danish} onChange={(e) => setDraft({ ...draft, danish: e.target.value })} autoFocus disabled={disabled || isSubmitting} className="text-base font-medium" placeholder="Dansk…" />
        </div>
        <GrammarFields type={draft.type} value={draft.grammar ?? {}} onChange={(g) => setDraft({ ...draft, grammar: g })} disabled={disabled || isSubmitting} />
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">English</span>
          <Input value={draft.english} onChange={(e) => setDraft({ ...draft, english: e.target.value })} disabled={disabled || isSubmitting} className="mt-0.5" />
        </div>
        <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} disabled={disabled || isSubmitting} />
        <div className="flex gap-2 justify-end pt-0.5">
          <Button size="sm" variant="ghost" onClick={cancel} disabled={isSubmitting}><X className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => void save()} disabled={disabled || isSubmitting}><Check className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  const actionStrip = (
    <div className="flex flex-row h-11 shrink-0 divide-x divide-border border-l border-border bg-muted" style={{ width: MOBILE_STRIP_W, minWidth: MOBILE_STRIP_W }}>
      <button type="button" className="flex flex-1 min-w-0 h-full items-center justify-center text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground active:bg-muted-foreground/15 disabled:opacity-50" disabled={disabled} aria-label="Rediger" onClick={() => { setSwipeOpen(false); startEdit(); }}>
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" className="flex flex-1 min-w-0 h-full items-center justify-center text-destructive hover:bg-destructive/10 active:bg-destructive/15 disabled:opacity-50" disabled={disabled} aria-label="Slet" onClick={() => { setSwipeOpen(false); setDeleteDialogOpen(true); }}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="group/card relative rounded-lg border border-border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="absolute top-1.5 right-1.5 z-40 hidden sm:block opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto group-focus-within/card:opacity-100 group-focus-within/card:pointer-events-auto transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled={disabled} aria-label="Handlinger">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => startEdit()}><Pencil className="mr-2 h-4 w-4" />Rediger</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Slet</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={cn(
        "grid items-start transition-transform duration-200 ease-out will-change-transform touch-pan-y sm:touch-auto",
        "max-sm:w-[calc(100%+5.5rem)] max-sm:grid-cols-[1fr_5.5rem] sm:w-full sm:grid-cols-1",
        swipeOpen ? "max-sm:-translate-x-[5.5rem]" : "translate-x-0",
        "sm:translate-x-0",
      )}>
        <div className="min-w-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <details className="group/detailsCard block w-full min-w-0 min-h-0">
            <summary className="list-none cursor-pointer select-none px-3 py-1.5 sm:pr-11 flex flex-nowrap items-center gap-2 min-w-0 rounded-none hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-sm:min-h-11 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 text-left text-base sm:text-lg font-semibold text-foreground leading-tight tracking-tight truncate">
                {entry.danish || "—"}
              </span>
              <span className={cn("shrink-0 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded leading-none", entryTypePillClass(entry.type))}>
                {entryTypeLabel(entry.type)}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/detailsCard:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-border bg-muted/15 px-3 py-2.5 space-y-3">
              <GrammarDisplay type={entry.type} grammar={entry.grammar} />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">English</p>
                <p className="text-sm text-muted-foreground leading-snug break-words">{entry.english || "—"}</p>
              </div>
              {(entry.notes || linkedWords.length > 0) && (
                <div className="pt-2 border-t border-border/80 space-y-1.5">
                  {entry.notes && <p className="text-sm text-muted-foreground italic leading-snug">{entry.notes}</p>}
                  {linkedWords.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden />
                      {linkedWords.map((w) => (
                        <span key={w.id} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{w.danish || w.english}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
        </div>
        <div className="min-w-0 sm:hidden">{actionStrip}</div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open && isDeleting) return; setDeleteDialogOpen(open); }}>
        <AlertDialogContent className="max-w-[min(100%,24rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Slet dette ord?</AlertDialogTitle>
            <AlertDialogDescription>«{entry.danish || entry.english || "dette opslag"}» slettes permanent. Det kan ikke fortrydes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuller</AlertDialogCancel>
            <Button variant="destructive" disabled={disabled || isDeleting} onClick={() => void confirmDelete()}>{isDeleting ? "Sletter…" : "Slet"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
