import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw, Sparkles } from "lucide-react";
import {
  ALL_LANGUAGES,
  type Language,
  getVisibleLanguages,
  setVisibleLanguages,
  getAiProvider,
  setAiProvider,
  getAiKey,
  setAiKey,
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

export function SettingsDialog({ open, onOpenChange, entries }: SettingsDialogProps) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState<Language[]>(getVisibleLanguages());
  const [provider, setProviderState] = useState<AiProvider>(getAiProvider());
  const [apiKey, setApiKeyState] = useState<string>(getAiKey());

  useEffect(() => {
    if (open) {
      setVisible(getVisibleLanguages());
      setProviderState(getAiProvider());
      setApiKeyState(getAiKey());
    }
  }, [open]);

  const toggleLang = (lang: Language) => {
    const next = visible.includes(lang)
      ? visible.filter((l) => l !== lang)
      : [...visible, lang];
    if (next.length === 0) return; // require at least one
    setVisible(next);
    setVisibleLanguages(next);
  };

  const handleProvider = (p: AiProvider) => {
    setProviderState(p);
    setAiProvider(p);
  };

  const handleKey = (k: string) => {
    setApiKeyState(k);
    setAiKey(k);
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

        {/* Visibility */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{t("settings.visibilityTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("settings.visibilityDesc")}</p>
          </div>
          <div className="space-y-2">
            {ALL_LANGUAGES.map((lang) => (
              <div key={lang} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <Label htmlFor={`lang-${lang}`} className="cursor-pointer">
                  {t(`settings.langs.${lang}`)}
                </Label>
                <Switch
                  id={`lang-${lang}`}
                  checked={visible.includes(lang)}
                  onCheckedChange={() => toggleLang(lang)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* AI Provider */}
        <section className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t("settings.aiTitle")}</h3>
            <span className="ml-1 text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {t("settings.aiPreview")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.aiDesc")}</p>
          <div className="space-y-2">
            <Label htmlFor="ai-provider" className="text-xs">{t("settings.aiProvider")}</Label>
            <select
              id="ai-provider"
              value={provider}
              onChange={(e) => handleProvider(e.target.value as AiProvider)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
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
              onChange={(e) => handleKey(e.target.value)}
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
