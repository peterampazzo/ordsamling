import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  width?: "app" | "narrow" | "wide";
  className?: string;
  as?: "main" | "div" | "section";
}

const WIDTH_CLASSES = {
  app: "max-w-3xl px-3 sm:px-4",
  narrow: "max-w-md px-4",
  wide: "max-w-6xl px-4 sm:px-6",
} as const;

export const PageContainer = ({
  children,
  width = "app",
  className,
  as: Tag = "main",
}: PageContainerProps) => (
  <Tag
    className={cn(
      "mx-auto py-6 sm:py-8",
      WIDTH_CLASSES[width],
      className,
    )}
  >
    {children}
  </Tag>
);
