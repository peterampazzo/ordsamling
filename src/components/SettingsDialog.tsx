import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw, Sparkles, Plus, X } from "lucide-react";
import {
  LANGUAGE_CATALOG,
  CORE_LANGUAGES,
  getExtraLanguages,
  setExtraLanguages,
  getAiProvider,
  getAiKey,
  exportEntriesAsJson,
  resetAllLocalData,
  type AiProvider,
} from "@/lib/settings";
import { t, getLang, setLang, AVAILABLE_LANGS } from "@/i18n";
import type { LexisEntry } from "@/lib/lexicon";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: LexisEntry[];
}

const CORE_LABELS: Record<string, string> = { danish: "Dansk", english: "English" };

export function SettingsDialog({ open, onOpenChange, entries }: SettingsDialogProps) {
  const navigate = useNavigate();
  const [extras, setExtras] = useState<string[]>(getExtraLanguages());
  const [provider] = useState<AiProvider>(getAiProvider());
  const [apiKey] = useState<string>(getAiKey());
  const [pendingAdd, setPendingAdd] = useState<string>("");
  const [uiLang, setUiLang] = useState<string>(getLang());

  const switchUiLang = (l: string) => {
    setLang(l);
    setUiLang(l);
    // Force re-render of all consumers since t() reads a module-level value.
    setTimeout(() => window.location.reload(), 30);
  };

  useEffect(() => {
    if (open) {
      setExtras(getExtraLanguages());
      setPendingAdd("");
    }
  }, [open]);

  const availableToAdd = useMemo(
    () => LANGUAGE_CATALOG.filter((l) => !extras.includes(l.code)),
    [extras],
  );

  const persist = (next: string[]) => {
    setExtras(next);
    setExtraLanguages(next);
  };

  const addLang = () => {
    if (!pendingAdd || extras.includes(pendingAdd)) return;
    persist([...extras, pendingAdd]);
    setPendingAdd("");
  };

  const removeLang = (code: string) => {
    persist(extras.filter((c) => c !== code));
  };

  const handleReset = () => {
    if (!window.confirm(t("settings.resetConfirm1"))) return;
    if (!window.confirm(t("settings.resetConfirm2"))) return;
    resetAllLocalData();
    onOpenChange(false);
    navigate("/", { replace: true });
    setTimeout(() => window.location.reload(), 50);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("settings.title")}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("settings.uiLangTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.uiLangDesc")}</p>
          <div role="group" aria-label="UI language" className="inline-flex items-center rounded-full border border-border bg-background p-0.5 text-xs font-mono uppercase tracking-wider">
            {AVAILABLE_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => switchUiLang(l)}
                aria-pressed={uiLang === l}
                className={
                  "px-3 py-1 rounded-full transition-colors " +
                  (uiLang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{t("settings.visibilityTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("settings.visibilityDesc")}</p>
          </div>

          <div className="space-y-2">
            {CORE_LANGUAGES.map((lang) => (
              <div
                key={lang}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <span className="text-sm">{CORE_LABELS[lang]}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("settings.coreLanguage")}
                </span>
              </div>
            ))}

            {extras.map((code) => {
              const lang = LANGUAGE_CATALOG.find((l) => l.code === code);
              return (
                <div
                  key={code}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                >
                  <span className="text-sm">{lang?.label ?? code}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLang(code)}
                    className="h-7 gap-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t("settings.removeLanguage")}
                  </Button>
                </div>
              );
            })}
          </div>

          {availableToAdd.length > 0 ? (
            <div className="flex items-center gap-2 pt-1">
              <Select value={pendingAdd} onValueChange={setPendingAdd}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder={t("settings.addLanguage")} />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                onClick={addLang}
                disabled={!pendingAdd}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("common.add")}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic pt-1">
              {t("settings.noMoreLanguages")}
            </p>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed bg-muted/40 border border-border rounded-md px-3 py-2 mt-2">
            {t("settings.dataDisclaimer")}
          </p>
        </section>

        <section className="space-y-3 border-t border-border pt-4 opacity-60">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t("settings.aiTitle")}</h3>
            <span className="ml-1 text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {t("settings.aiPreview")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.aiDisabledHint")}</p>
          <div className="space-y-2">
            <Label htmlFor="ai-provider" className="text-xs">{t("settings.aiProvider")}</Label>
            <select
              id="ai-provider"
              value={provider}
              disabled
              className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm cursor-not-allowed"
            >
              <option value="">{t("settings.providerNone")}</option>
              <option value="cloudflare">{t("settings.providerCloudflare")}</option>
              <option value="openai">{t("settings.providerOpenAI")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-key" className="text-xs">{t("settings.aiKey")}</Label>
            <Input
              id="ai-key"
              type="password"
              value={apiKey}
              disabled
              readOnly
              placeholder={t("settings.aiKeyPlaceholder")}
              autoComplete="off"
            />
          </div>
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{t("settings.dataTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => exportEntriesAsJson(entries)} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              {t("settings.exportJson")}
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              {t("settings.reset")}
            </Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
