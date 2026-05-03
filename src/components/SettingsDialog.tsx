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
  ALL_LANGUAGES,
  type Language,
  getVisibleLanguages,
  setVisibleLanguages,
  getAiProvider,
  getAiKey,
  exportEntriesAsJson,
  resetAllLocalData,
  type AiProvider,
} from "@/lib/settings";
import { t } from "@/i18n";
import type { LexisEntry } from "@/lib/lexicon";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: LexisEntry[];
}

const CORE_LANGUAGES: Language[] = ["danish", "english"];

export function SettingsDialog({ open, onOpenChange, entries }: SettingsDialogProps) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState<Language[]>(getVisibleLanguages());
  const [provider] = useState<AiProvider>(getAiProvider());
  const [apiKey] = useState<string>(getAiKey());
  const [pendingAdd, setPendingAdd] = useState<string>("");

  useEffect(() => {
    if (open) {
      setVisible(getVisibleLanguages());
      setPendingAdd("");
    }
  }, [open]);

  const extraLangs = useMemo(
    () => visible.filter((l) => !CORE_LANGUAGES.includes(l)),
    [visible],
  );
  const availableToAdd = useMemo(
    () => ALL_LANGUAGES.filter((l) => !visible.includes(l)),
    [visible],
  );

  const persist = (next: Language[]) => {
    setVisible(next);
    setVisibleLanguages(next);
  };

  const addLang = () => {
    if (!pendingAdd) return;
    const lang = pendingAdd as Language;
    if (!ALL_LANGUAGES.includes(lang) || visible.includes(lang)) return;
    persist([...visible, lang]);
    setPendingAdd("");
  };

  const removeLang = (lang: Language) => {
    if (CORE_LANGUAGES.includes(lang)) return;
    persist(visible.filter((l) => l !== lang));
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

        {/* Languages */}
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
                <span className="text-sm">{t(`settings.langs.${lang}`)}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("settings.coreLanguage")}
                </span>
              </div>
            ))}

            {extraLangs.map((lang) => (
              <div
                key={lang}
                className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
              >
                <span className="text-sm">{t(`settings.langs.${lang}`)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLang(lang)}
                  className="h-7 gap-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                  {t("settings.removeLanguage")}
                </Button>
              </div>
            ))}
          </div>

          {availableToAdd.length > 0 ? (
            <div className="flex items-center gap-2 pt-1">
              <Select value={pendingAdd} onValueChange={setPendingAdd}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder={t("settings.addLanguage")} />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {t(`settings.langs.${lang}`)}
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
        </section>

        {/* AI Provider — disabled preview */}
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

        {/* Data tools */}
        <section className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{t("settings.dataTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportEntriesAsJson(entries)}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {t("settings.exportJson")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleReset}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("settings.reset")}
            </Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
