import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";
import { t } from "@/i18n";

interface PageHeaderProps {
  /** If set, shows a back chevron linking to this route (left of the wordmark). */
  backTo?: string;
  /** Right-side action area (buttons, indicators). */
  actions?: ReactNode;
  /** Optional second row inside the same sticky header (search bar, progress, tabs). */
  subRow?: ReactNode;
  /** `app` = max-w-3xl (default), `wide` = max-w-6xl (Landing). */
  width?: "app" | "wide";
  /** Optional small page label rendered after the wordmark, separated by a slash. */
  pageLabel?: string;
  className?: string;
}

const WIDTH_CLASSES = {
  app: "max-w-3xl px-3 sm:px-4",
  wide: "max-w-6xl px-4 sm:px-6",
} as const;

/**
 * Sticky page header used across the app. Locks the visual contract so
 * pages can't drift on opacity, blur, border, or container width.
 */
export const PageHeader = ({
  backTo,
  actions,
  subRow,
  width = "app",
  pageLabel,
  className,
}: PageHeaderProps) => {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80",
        className,
      )}
    >
      <div className={cn("mx-auto", WIDTH_CLASSES[width])}>
        <div className="flex items-center gap-2 sm:gap-3 py-2.5 min-h-[52px]">
          {backTo && (
            <Link
              to={backTo}
              aria-label={t("common.back")}
              className="p-1.5 -ml-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div className="flex items-baseline gap-2 min-w-0 flex-1">
            <Wordmark size="sm" />
            {pageLabel && (
              <span className="text-sm text-muted-foreground truncate">
                <span className="text-muted-foreground/60 mx-1">/</span>
                {pageLabel}
              </span>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-1 shrink-0">{actions}</div>
          )}
        </div>
        {subRow && <div className="pb-2.5">{subRow}</div>}
      </div>
    </header>
  );
};
