import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, ArrowRight } from "lucide-react";
import type { LexisEntry, EntryType } from "@/hooks/useLexicon";
import { ENTRY_TYPES, entryTypeLabel, pruneGrammar, stripInfinitiveMarker, type EntryGrammar } from "@/lib/lexicon";
import { GrammarFields } from "@/components/EntryGrammar";
import { t } from "@/i18n";
import { useExtraLanguages } from "@/hooks/useVisibleLanguages";
import { getLanguageLabel } from "@/lib/settings";

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
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<EntryType>("word");
  const [grammar, setGrammar] = useState<EntryGrammar>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const extraLangs = useExtraLanguages();

  const reset = () => {
    setDanish("");
    setEnglish("");
    setTranslations({});
    setNotes("");
    setType("word");
    setGrammar({});
  };

  const activeQuery =
    danish || english || Object.values(translations).find(Boolean) || "";
  const matches = useMemo(() => findMatches(activeQuery), [findMatches, activeQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const anyTranslation = Object.values(translations).some((v) => v.trim());
    if (!danish.trim() && !english.trim() && !anyTranslation) return;
    setIsSubmitting(true);

    try {
      const g = pruneGrammar(grammar);
      const cleanedTranslations: Record<string, string> = {};
      for (const [code, val] of Object.entries(translations)) {
        const v = val.trim();
        if (v) cleanedTranslations[code] = v;
      }
      await onAdd({
        danish: type === "verb" ? stripInfinitiveMarker(danish, "da") : danish.trim(),
        english: type === "verb" ? stripInfinitiveMarker(english, "en") : english.trim(),
        notes: notes.trim(),
        type,
        ...(Object.keys(cleanedTranslations).length > 0 ? { translations: cleanedTranslations } : {}),
        ...(g ? { grammar: g } : {}),
      });
      reset();
      onCancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  const showExtras = extraLangs.length > 0;

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
        <div className="relative">
          {type === "verb" && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground italic">
              at
            </span>
          )}
          <Input
            value={danish}
            onChange={(e) => setDanish(stripInfinitiveMarker(e.target.value, "da"))}
            placeholder={type === "verb" ? "spise, gå, lære…" : t("addEntry.danishPlaceholder")}
            autoFocus
            disabled={disabled || isSubmitting}
            className={`text-base font-medium min-w-0 ${type === "verb" ? "pl-9" : ""}`}
          />
        </div>
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
          {showExtras && extraLangs.map((code) => (
            <div key={code} className="min-w-0">
              <span className="text-[10px] font-medium text-lang-it uppercase tracking-wider">{getLanguageLabel(code)}</span>
              <Input
                value={translations[code] ?? ""}
                onChange={(e) =>
                  setTranslations((prev) => ({ ...prev, [code]: e.target.value }))
                }
                placeholder={getLanguageLabel(code)}
                disabled={disabled || isSubmitting}
                className="mt-0.5 min-w-0"
              />
            </div>
          ))}
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
                {m.translations && Object.values(m.translations).filter(Boolean).slice(0, 1).map((v, i) => (
                  <span key={i} className="text-muted-foreground"> · {v}</span>
                ))}
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
