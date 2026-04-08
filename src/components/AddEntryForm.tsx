import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, ArrowRight } from "lucide-react";
import type { LexisEntry, EntryType } from "@/hooks/useLexicon";
import { ENTRY_TYPES, entryTypeLabel, pruneGrammar, type EntryGrammar } from "@/lib/lexicon";
import { GrammarFields } from "@/components/EntryGrammar";
import { t } from "@/i18n";

interface Props {
  onAdd: (entry: Omit<LexisEntry, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
  onEdit: (id: string) => void;
  findMatches: (query: string) => LexisEntry[];
  disabled?: boolean;
}

export function AddEntryForm({ onAdd, onCancel, onEdit, findMatches, disabled = false }: Props) {
  const [danish, setDanish] = useState("");
  const [english, setEnglish] = useState("");
  const [italian, setItalian] = useState("");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<EntryType>("word");
  const [grammar, setGrammar] = useState<EntryGrammar>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setDanish("");
    setEnglish("");
    setItalian("");
    setNotes("");
    setType("word");
    setGrammar({});
  };

  const activeQuery = danish || english || italian;
  const matches = useMemo(() => findMatches(activeQuery), [findMatches, activeQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!danish.trim() && !english.trim() && !italian.trim()) return;
    setIsSubmitting(true);

    try {
      const g = pruneGrammar(grammar);
      await onAdd({
        danish: danish.trim(),
        english: english.trim(),
        italian: italian.trim(),
        notes: notes.trim(),
        type,
        ...(g ? { grammar: g } : {}),
      });
      reset();
      onCancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full min-w-0 rounded-lg border border-ring/30 bg-card p-3 shadow-sm space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h3 className="text-base font-semibold truncate">{t("addEntry.title")}</h3>
        <button
          type="button"
          onClick={() => {
            reset();
            onCancel();
          }}
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ENTRY_TYPES.map((et) => (
          <button
            key={et}
            type="button"
            onClick={() => {
              if (type !== et) setGrammar({});
              setType(et);
            }}
            disabled={disabled || isSubmitting}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              type === et
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-secondary-foreground border-border hover:border-primary/40"
            }`}
          >
            {entryTypeLabel(et)}
          </button>
        ))}
      </div>

      <div className="space-y-1 min-w-0">
        <span className="sr-only">{t("directions.danish")}</span>
        <Input
          value={danish}
          onChange={(e) => setDanish(e.target.value)}
          placeholder={t("addEntry.danishPlaceholder")}
          autoFocus
          disabled={disabled || isSubmitting}
          className="text-base font-medium min-w-0"
        />
      </div>

      <GrammarFields type={type} value={grammar} onChange={setGrammar} disabled={disabled || isSubmitting} />

      <div className="rounded-md border border-border bg-muted/25 p-2.5 space-y-2 min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("addEntry.translations")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-medium text-lang-en uppercase tracking-wider">{t("lexisCard.english")}</span>
            <Input
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              placeholder={t("addEntry.englishPlaceholder")}
              disabled={disabled || isSubmitting}
              className="mt-0.5 min-w-0"
            />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-medium text-lang-it uppercase tracking-wider">{t("lexisCard.italian")}</span>
            <Input
              value={italian}
              onChange={(e) => setItalian(e.target.value)}
              placeholder={t("addEntry.italianPlaceholder")}
              disabled={disabled || isSubmitting}
              className="mt-0.5 min-w-0"
            />
          </div>
        </div>
      </div>

      {matches.length > 0 && (
        <div className="rounded-md border border-primary/20 bg-accent/50 p-2.5 space-y-2 min-w-0">
          <p className="text-xs font-medium text-accent-foreground">{t("addEntry.matchesFound", { count: matches.length })}</p>
          {matches.slice(0, 4).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onEdit(m.id);
                reset();
                onCancel();
              }}
              className="flex items-center justify-between w-full min-w-0 text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted transition-colors group gap-2"
            >
              <span className="truncate min-w-0">
                <span className="text-lang-da">{m.danish}</span>
                {m.english && <span className="text-muted-foreground"> · {m.english}</span>}
                {m.italian && <span className="text-muted-foreground"> · {m.italian}</span>}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      )}

      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("addEntry.notesPlaceholder")}
        rows={2}
        disabled={disabled || isSubmitting}
        className="min-w-0 resize-y"
      />

      <div className="flex flex-wrap gap-2 justify-end pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            onCancel();
          }}
          disabled={isSubmitting}
        >
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={disabled || isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
