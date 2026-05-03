import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "text-lg",
  md: "text-xl sm:text-2xl",
  lg: "text-5xl sm:text-7xl leading-[1.05]",
};

interface WordmarkProps {
  size?: Size;
  to?: string;
  asLink?: boolean;
  className?: string;
}

/**
 * Single source of truth for the "Ordsamling." brand wordmark.
 * Auto-targets `/app` from inside the app, `/` from marketing pages.
 */
export const Wordmark = ({
  size = "sm",
  to,
  asLink = true,
  className,
}: WordmarkProps) => {
  const location = useLocation();
  const inApp =
    location.pathname.startsWith("/app") ||
    location.pathname.startsWith("/quiz") ||
    location.pathname.startsWith("/import");
  const target = to ?? (inApp ? "/app" : "/");

  const text = (
    <span
      className={cn(
        "font-serif text-foreground tracking-tight",
        SIZE_CLASSES[size],
        className,
      )}
    >
      Ordsamling.
    </span>
  );

  if (!asLink) return text;
  return (
    <Link to={target} className="inline-flex items-baseline" aria-label="Ordsamling">
      {text}
    </Link>
  );
};
