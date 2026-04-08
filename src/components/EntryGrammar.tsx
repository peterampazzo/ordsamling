import { Input } from "@/components/ui/input";
import { GRAMMAR_FIELD_CONFIG, grammarHasContent, type EntryGrammar, type EntryType } from "@/lib/lexicon";
import { t } from "@/i18n";

export function GrammarFields({
  type,
  value,
  onChange,
  disabled,
}: {
  type: EntryType;
  value: EntryGrammar;
  onChange: (next: EntryGrammar) => void;
  disabled?: boolean;
}) {
  const fields = GRAMMAR_FIELD_CONFIG[type];
  if (!fields) return null;

  const setKey = (key: keyof EntryGrammar, v: string) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <div className="rounded-md border border-border bg-muted/25 p-2.5 space-y-2 min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("grammar.sectionTitle")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
        {fields.map(({ key, label, placeholder }) => (
          <div key={key} className="min-w-0">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
            <Input
              value={value[key] ?? ""}
              onChange={(e) => setKey(key, e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="mt-0.5 min-w-0"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GrammarDisplay({ type, grammar }: { type: EntryType; grammar: EntryGrammar | undefined }) {
  const fields = GRAMMAR_FIELD_CONFIG[type];
  if (!fields || !grammar || !grammarHasContent(type, grammar)) return null;

  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">{t("grammar.displayTitle")}</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {fields.map(({ key, label }) => {
          const v = grammar[key]?.trim();
          if (!v) return null;
          return (
            <div key={key} className="flex flex-col min-w-0 sm:flex-row sm:gap-2 sm:items-baseline">
              <dt className="shrink-0 text-[11px] text-muted-foreground/80">{label}</dt>
              <dd className="min-w-0 font-medium text-foreground/90 break-words">{v}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
