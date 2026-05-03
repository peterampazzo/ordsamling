import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SyncState } from "@/hooks/useGoogleSheets";

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)} days ago`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CloudSyncIndicatorProps {
  status: SyncState["status"];
  lastSyncAt: number | null;
  onClick: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CloudSyncIndicator({ status, lastSyncAt, onClick }: CloudSyncIndicatorProps) {
  if (status === "disconnected") {
    return null;
  }

  let icon: React.ReactNode;
  let tooltipText: string;

  switch (status) {
    case "idle": {
      const timeStr = lastSyncAt ? ` · ${formatRelativeTime(lastSyncAt)}` : "";
      tooltipText = `Synced${timeStr}`;
      icon = <Cloud className="h-4 w-4 text-muted-foreground" aria-hidden />;
      break;
    }
    case "syncing":
      tooltipText = "Syncing…";
      icon = <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" aria-hidden />;
      break;
    case "dirty":
      tooltipText = "Changes pending sync";
      icon = <CloudOff className="h-4 w-4 text-amber-500" aria-hidden />;
      break;
    case "error":
      tooltipText = "Sync error — click to reconnect";
      icon = <CloudOff className="h-4 w-4 text-destructive" aria-hidden />;
      break;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={tooltipText}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-accent transition-colors"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
