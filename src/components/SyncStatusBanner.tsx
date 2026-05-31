import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { SyncState } from "@/hooks/useGoogleSheets";

interface Props {
  syncState: SyncState;
  onReconnect: () => void;
  onRetry: () => void;
}

/**
 * Visible banner that surfaces important sync states the small cloud icon
 * can't communicate on its own: expired Google auth, queued local changes,
 * or repeated sync failures.
 */
export function SyncStatusBanner({ syncState, onReconnect, onRetry }: Props) {
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
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
