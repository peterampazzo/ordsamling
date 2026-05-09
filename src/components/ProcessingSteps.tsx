import { Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "pending" | "active" | "complete" | "error";

export interface ProcessingStep {
  id: string;
  label: string;
  sub?: string;
  state: StepState;
}

interface Props {
  steps: ProcessingStep[];
  className?: string;
}

/**
 * Horizontal stepper used by the BulkImport AI processing flow.
 * Each step shows its state with an icon and an optional sub-label
 * that surfaces details like character count or chunk progress.
 */
export function ProcessingSteps({ steps, className }: Props) {
  return (
    <ol
      className={cn("flex items-start gap-1 sm:gap-2", className)}
      role="list"
      aria-label="Processing progress"
    >
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <li key={step.id} className="flex-1 flex items-start min-w-0">
            <div className="flex flex-col items-center min-w-0 flex-1">
              <div className="flex items-center w-full">
                <div className="flex-1 h-px" aria-hidden />
                <StepDot state={step.state} />
                <div
                  className={cn(
                    "flex-1 h-px",
                    isLast ? "opacity-0" : step.state === "complete" ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              </div>
              <div className="mt-1.5 text-center min-w-0 w-full px-1">
                <div
                  className={cn(
                    "text-[11px] sm:text-xs font-medium leading-tight truncate",
                    step.state === "active" && "text-foreground",
                    step.state === "complete" && "text-foreground/80",
                    step.state === "pending" && "text-muted-foreground",
                    step.state === "error" && "text-destructive",
                  )}
                >
                  {step.label}
                </div>
                {step.sub && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                    {step.sub}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepDot({ state }: { state: StepState }) {
  const base =
    "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors";
  if (state === "complete") {
    return (
      <span className={cn(base, "bg-primary border-primary text-primary-foreground")}>
        <Check className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">complete</span>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className={cn(
          base,
          "bg-primary border-primary text-primary-foreground",
          "motion-safe:animate-pulse",
        )}
      >
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
        <span className="sr-only">in progress</span>
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className={cn(base, "bg-destructive border-destructive text-destructive-foreground")}>
        <X className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">error</span>
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-card border-border text-muted-foreground")}>
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
      <span className="sr-only">pending</span>
    </span>
  );
}
