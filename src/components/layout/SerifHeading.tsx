import { ReactNode, ElementType } from "react";
import { cn } from "@/lib/utils";

type Level = "display" | "xl" | "lg" | "md";

const LEVEL_CLASSES: Record<Level, string> = {
  display: "text-5xl sm:text-7xl leading-[1.05] tracking-tight",
  xl: "text-3xl sm:text-4xl tracking-tight leading-tight",
  lg: "text-2xl sm:text-3xl tracking-tight",
  md: "text-xl leading-snug",
};

interface SerifHeadingProps {
  children: ReactNode;
  level?: Level;
  as?: ElementType;
  className?: string;
  id?: string;
}

/**
 * Serif heading with consistent sizing tokens. Replaces ad-hoc
 * `font-serif text-... tracking-tight` strings sprinkled across pages.
 */
export const SerifHeading = ({
  children,
  level = "lg",
  as,
  className,
  id,
}: SerifHeadingProps) => {
  const Tag = (as ?? (level === "display" || level === "xl" ? "h1" : "h2")) as ElementType;
  return (
    <Tag
      id={id}
      className={cn("font-serif text-foreground", LEVEL_CLASSES[level], className)}
    >
      {children}
    </Tag>
  );
};
