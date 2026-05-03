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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cloud,
  Database,
  Download,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Sparkles,
  Plus,
  X,
  CheckCircle2,
  XCircle,
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
import { validateGeminiKey, type KeyValidationStatus } from "@/lib/gemini";
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
      setGeminiModelState(getGeminiModel());
      setGeminiKeyState(getGeminiApiKey());
      setShowKey(false);
      setKeyValidation(getGeminiApiKey() ? "missing" : "missing");
    }
  }, [open]);

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
        {/* Section A: Storage Solution                                         */}
        {/* ------------------------------------------------------------------ */}
        <section className="space-y-3 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Storage</h3>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2">
            {syncState.status === "disconnected" ? (
              <Badge
                variant="secondary"
                role="status"
                aria-label="Storage status: local only"
                className="text-xs"
              >
                Local Only
              </Badge>
            ) : (
              <>
                <Badge
                  variant="default"
                  role="status"
                  aria-label="Storage status: cloud sync active"
                  className="bg-green-600 text-white text-xs hover:bg-green-600"
                >
                  Cloud Sync
                </Badge>
                {syncState.connectedEmail && (
                  <span className="text-xs text-muted-foreground truncate">
                    {syncState.connectedEmail}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Connect / Disconnect buttons */}
          {!isConnected ? (
            <div className="space-y-2">
              <Button
                type="button"
                size="sm"
                onClick={onConnect}
                disabled={isSyncing}
                aria-label="Connect to Google Drive for cloud sync"
                className="gap-1.5"
              >
                {isSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                Connect Google Drive
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Google Drive sync is currently in limited testing.{" "}
                <a
                  href="mailto:pietro@rampazzo.eu?subject=Ordsamling%20Google%20Drive%20access"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Write me
                </a>{" "}
                to request access.
              </p>
            </div>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Disconnect from Google Drive"
                  className="gap-1.5"
                >
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect from Google Drive?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your data will remain in the cloud but the app will switch to local-only mode.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onDisconnect()}>
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
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
            >
              <SelectTrigger id="gemini-model" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-1.5-flash">
                  Gemini 1.5 Flash — Fast &amp; Lightweight (Generous Free Tier)
                </SelectItem>
                <SelectItem value="gemini-1.5-pro">
                  Gemini 1.5 Pro — Complex &amp; Creative (Stricter Free Tier)
                </SelectItem>
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
