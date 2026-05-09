import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cloud,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Sparkles,
  Plus,
  X,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Copy,
  Check,
  Bug,
} from "lucide-react";
import {
  LANGUAGE_CATALOG,
  CORE_LANGUAGES,
  getExtraLanguages,
  setExtraLanguages,
  exportEntriesAsJson,
  resetAllLocalData,
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiModel,
  setGeminiModel,
} from "@/lib/settings";
import type { GeminiModel } from "@/lib/storageConfig";
import { fetchAvailableModels, type GeminiModelInfo } from "@/lib/gemini-models";
import { validateGeminiKey, type KeyValidationStatus, getLastPrompt } from "@/lib/gemini";
import { t, getLang, setLang, AVAILABLE_LANGS } from "@/i18n";
import type { LexisEntry } from "@/lib/lexicon";
import type { SyncState } from "@/hooks/useGoogleSheets";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: LexisEntry[];
  syncState: SyncState;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORE_LABELS: Record<string, string> = { danish: "Dansk", english: "English" };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsDialog({
  open,
  onOpenChange,
  entries,
  syncState,
  onConnect,
  onDisconnect,
}: SettingsDialogProps) {
  const navigate = useNavigate();

  // Extra languages
  const [extras, setExtras] = useState<string[]>(getExtraLanguages());
  const [pendingAdd, setPendingAdd] = useState<string>("");
  const [uiLang, setUiLang] = useState<string>(getLang());

  // AI Engine state
  const [geminiModel, setGeminiModelState] = useState<GeminiModel>(getGeminiModel());
  const [geminiKey, setGeminiKeyState] = useState<string>(getGeminiApiKey());
  const [showKey, setShowKey] = useState(false);
  const [keyValidation, setKeyValidation] = useState<KeyValidationStatus>("missing");
  const [availableModels, setAvailableModels] = useState<GeminiModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Troubleshooting state
  const [troubleshootingOpen, setTroubleshootingOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

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
      const savedModel = getGeminiModel();
      const savedKey = getGeminiApiKey();
      setGeminiModelState(savedModel);
      setGeminiKeyState(savedKey);
      setShowKey(false);
      setKeyValidation(savedKey ? "missing" : "missing");
    }
  }, [open]);

  // Fetch available models when API key is provided or dialog opens
  useEffect(() => {
    if (!open) return;
    if (geminiKey.trim() && geminiKey.startsWith("AIza")) {
      setLoadingModels(true);
      fetchAvailableModels(geminiKey)
        .then((models) => {
          setAvailableModels(models);
        })
        .catch((err) => {
          console.error("Failed to fetch models:", err);
          setAvailableModels([]);
        })
        .finally(() => setLoadingModels(false));
    } else {
      setAvailableModels([]);
    }
  }, [geminiKey, open]);

  // ---------------------------------------------------------------------------
  // Language helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // AI key validation
  // ---------------------------------------------------------------------------

  const handleValidateKey = async () => {
    setKeyValidation("checking");
    const result = await validateGeminiKey();
    setKeyValidation(result);
  };

  // ---------------------------------------------------------------------------
  // Troubleshooting helpers
  // ---------------------------------------------------------------------------

  const handleCopyPrompt = async () => {
    const { prompt } = getLastPrompt();
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy prompt:", err);
    }
  };

  const formatTimestamp = (date: Date | null): string => {
    if (!date) return "";
    return date.toLocaleString();
  };

  const handleReset = () => {
    if (!window.confirm(t("settings.resetConfirm1"))) return;
    if (!window.confirm(t("settings.resetConfirm2"))) return;
    resetAllLocalData();
    onOpenChange(false);
    navigate("/", { replace: true });
    setTimeout(() => window.location.reload(), 50);
  };

  // ---------------------------------------------------------------------------
  // Derived storage state
  // ---------------------------------------------------------------------------

  const isConnected = syncState.status !== "disconnected";
  const isSyncing = syncState.status === "syncing";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("settings.title")}</DialogDescription>
        </DialogHeader>

        {/* ------------------------------------------------------------------ */}
        {/* Section A: Storage                                                   */}
        {/* ------------------------------------------------------------------ */}
        <section className="space-y-3 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t("settings.storageTitle")}</h3>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
            {/* Local-first disclaimer */}
            <p className="text-xs text-foreground/80 leading-relaxed">
              {t("settings.storageDisclaimer")}
            </p>

            {/* Status row */}
            <div className="flex flex-wrap items-center gap-2">
              {syncState.status === "disconnected" ? (
                <Badge
                  variant="secondary"
                  role="status"
                  aria-label="Storage status: local only"
                  className="text-xs"
                >
                  {t("settings.storageLocalBadge")}
                </Badge>
              ) : (
                <>
                  <Badge
                    variant="default"
                    role="status"
                    aria-label="Storage status: cloud sync active"
                    className="bg-green-600 text-white text-xs hover:bg-green-600"
                  >
                    {t("settings.storageCloudBadge")}
                  </Badge>
                  {syncState.connectedEmail && (
                    <span className="text-xs text-muted-foreground truncate">
                      · {syncState.connectedEmail}
                    </span>
                  )}
                  {syncState.spreadsheetId && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${syncState.spreadsheetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
                    >
                      {t("settings.storageOpenSpreadsheet")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </>
              )}
            </div>

            {/* Connect / Disconnect */}
            {!isConnected ? (
              <Button
                type="button"
                size="sm"
                onClick={onConnect}
                disabled={isSyncing}
                aria-label={t("settings.storageConnect")}
                className="gap-1.5"
              >
                {isSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                {t("settings.storageConnect")}
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t("settings.storageDisconnect")}
                    className="gap-1.5"
                  >
                    {t("settings.storageDisconnect")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("settings.storageDisconnectTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("settings.storageDisconnectBody")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void onDisconnect()}>
                      {t("settings.storageDisconnect")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Beta note */}
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/60">
              {t("settings.storageBetaNote")}{" "}
              <a
                href="mailto:pietro@rampazzo.eu?subject=Ordsamling%20Google%20Sheets%20access"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {t("settings.storageBetaCta")}
              </a>{" "}
              {t("settings.storageGoogleAccountAside")}
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* UI Language                                                          */}
        {/* ------------------------------------------------------------------ */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("settings.uiLangTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.uiLangDesc")}</p>
          <div
            role="group"
            aria-label="UI language"
            className="inline-flex items-center rounded-full border border-border bg-background p-0.5 text-xs font-mono uppercase tracking-wider"
          >
            {AVAILABLE_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => switchUiLang(l)}
                aria-pressed={uiLang === l}
                className={
                  "px-3 py-1 rounded-full transition-colors " +
                  (uiLang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Extra Languages                                                      */}
        {/* ------------------------------------------------------------------ */}
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

        {/* ------------------------------------------------------------------ */}
        {/* Section B: AI Engine                                                 */}
        {/* ------------------------------------------------------------------ */}
        <section className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">AI Engine</h3>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The Gemini API key is used for quiz features (AI-generated distractors, auto-fill) and optional direct document processing. Bulk import works without a key.
          </p>

          {/* Model selector */}
          <div className="space-y-2">
            <Label htmlFor="gemini-model" className="text-xs">
              Model
            </Label>
            <Select
              value={geminiModel}
              onValueChange={(value) => {
                const model = value as GeminiModel;
                setGeminiModelState(model);
                setGeminiModel(model);
              }}
              disabled={loadingModels || availableModels.length === 0}
            >
              <SelectTrigger id="gemini-model" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {loadingModels ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Loading models...
                  </div>
                ) : availableModels.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Add a valid API key to see available models
                  </div>
                ) : (
                  availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                      {model.description && ` — ${model.description}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* API Key input */}
          <div className="space-y-2">
            <Label htmlFor="gemini-api-key" className="text-xs">
              Gemini API Key
            </Label>
            <div className="relative">
              <Input
                id="gemini-api-key"
                type={showKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKeyState(e.target.value);
                  setGeminiApiKey(e.target.value);
                  setKeyValidation("missing");
                }}
                placeholder="AIza..."
                autoComplete="off"
                spellCheck={false}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Validation row */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5"
                disabled={!geminiKey.trim() || keyValidation === "checking"}
                onClick={handleValidateKey}
              >
                {keyValidation === "checking" ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-1" />Checking…</>
                ) : (
                  "Validate key"
                )}
              </Button>
              {keyValidation === "valid" && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                </span>
              )}
              {keyValidation === "invalid" && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                  <XCircle className="h-3.5 w-3.5" /> Invalid key
                </span>
              )}
            </div>

            {/* Cost transparency note (Task 6.4) */}
            <p className="text-xs text-muted-foreground">
              Using your own key means AI costs/quotas are managed in your{" "}
              <a
                href="https://aistudio.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Google AI Studio
              </a>{" "}
              account.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Section C: Troubleshooting                                           */}
        {/* ------------------------------------------------------------------ */}
        <section className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Troubleshooting</h3>
          </div>

          <Collapsible open={troubleshootingOpen} onOpenChange={setTroubleshootingOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-between gap-2"
              >
                <span className="text-xs">Last AI Prompt Sent</span>
                <ChevronDown
                  className={
                    "h-3.5 w-3.5 transition-transform " +
                    (troubleshootingOpen ? "rotate-180" : "")
                  }
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-2">
              {(() => {
                const { prompt, timestamp } = getLastPrompt();
                if (!prompt) {
                  return (
                    <p className="text-xs text-muted-foreground italic">
                      No AI prompt has been sent yet. Use an AI feature (like bulk import or
                      autocomplete) to see the prompt here.
                    </p>
                  );
                }
                return (
                  <>
                    {timestamp && (
                      <p className="text-[11px] text-muted-foreground">
                        Sent at: {formatTimestamp(timestamp)}
                      </p>
                    )}
                    <div className="relative">
                      <pre className="text-[11px] bg-muted border border-border rounded-md p-3 overflow-x-auto max-h-60 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap break-words">
                        {prompt}
                      </pre>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyPrompt}
                        className="absolute top-2 right-2 h-7 w-7 p-0"
                        aria-label="Copy prompt"
                      >
                        {promptCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Data export / reset                                                  */}
        {/* ------------------------------------------------------------------ */}
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
          <p className="text-xs text-muted-foreground pt-1">
            <Link
              to="/privacy"
              onClick={() => onOpenChange(false)}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
