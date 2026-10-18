import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { SyncState } from "@/hooks/useGoogleSheets";
import { toast } from "@/components/ui/sonner";

interface Props {
  syncState: SyncState;
  onReconnect: () => void;
  onRetry: () => void;
  onResolve?: (id: string, choice: 'local' | 'remote') => Promise<void>;
}

/**
 * Visible banner that surfaces important sync states the small cloud icon
 * can't communicate on its own: expired Google auth, queued local changes,
 * or repeated sync failures.
 */
export function SyncStatusBanner({ syncState, onReconnect, onRetry, onResolve }: Props) {
  const { status, sessionExpired, pendingCount, errorMessage } = syncState;

  // Don't show in idle, syncing, or fully disconnected (never connected) states.
  if (status === "syncing" || status === "disconnected") return null;
  if (status === "idle" && pendingCount === 0 && !sessionExpired) return null;

  let title: string;
  let body: string;
  let actionLabel: string;
  let onAction: () => void;
  let Icon = AlertTriangle;
  let tone = "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";

  if (sessionExpired || errorMessage === "session_expired") {
    title = t("sync.banner.sessionExpired.title");
    body = t("sync.banner.sessionExpired.body");
    actionLabel = t("sync.banner.sessionExpired.action");
    onAction = onReconnect;
    Icon = CloudOff;
    tone = "border-destructive/40 bg-destructive/10 text-destructive";
  } else if (status === "conflict") {
    title = t("sync.banner.conflict.title");
    body = t("sync.banner.conflict.body");
    actionLabel = t("sync.banner.conflict.action");
    onAction = onRetry;
  } else if (pendingCount > 0 || status === "dirty") {
    title = t("sync.banner.pending.title", { count: pendingCount });
    body = t("sync.banner.pending.body");
    actionLabel = t("sync.banner.pending.action");
    onAction = onRetry;
    Icon = RefreshCw;
  } else if (status === "error") {
    title = t("sync.banner.error.title");
    body = errorMessage || t("sync.banner.error.body");
    actionLabel = t("sync.banner.error.action");
    onAction = onRetry;
    tone = "border-destructive/40 bg-destructive/10 text-destructive";
  } else {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mx-auto max-w-3xl px-3 sm:px-4 mt-2`}
    >
      <div className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${tone}`}>
        <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="font-medium leading-snug">{title}</p>
          <p className="text-xs opacity-80 mt-0.5">{body}</p>
        </div>
        {status !== "conflict" && <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>}
      </div>
      {(syncState.conflicts ?? []).map(conflict => (
        <div key={`${conflict.type}:${conflict.id}`} className="border rounded-md p-3 mt-2 space-y-2">
          <h3 className="font-semibold">{conflict.type === 'settings' ? t("sync.conflict.languages") : conflict.id}</h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div><p>{t("sync.conflict.local")}</p><pre className="whitespace-pre-wrap break-words">{conflict.local === null ? t("sync.conflict.deleted") : JSON.stringify(conflict.local, null, 2)}</pre></div>
            <div><p>{t("sync.conflict.remote")}</p><pre className="whitespace-pre-wrap break-words">{conflict.remote === null ? t("sync.conflict.deleted") : JSON.stringify(conflict.remote, null, 2)}</pre></div>
          </div>
          <div className="flex gap-2">
            {(['local', 'remote'] as const).map(choice => (
              <Button key={choice} size="sm" variant="outline" onClick={() => {
                void onResolve?.(conflict.id, choice).catch(error => toast.error(error instanceof Error ? error.message : "Could not resolve conflict."));
              }}>
                {t(`sync.conflict.keep${choice === 'local' ? 'Local' : 'Remote'}`)}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
