import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

const SEEN_KEY = "ordsamling-demo-tour-seen";

type Step = {
  selector: string;
  titleKey: string;
  bodyKey: string;
};

const STEPS: Step[] = [
  { selector: '[data-tour="list"]', titleKey: "demo.tour.step1Title", bodyKey: "demo.tour.step1Body" },
  { selector: '[data-tour="add"]', titleKey: "demo.tour.step2Title", bodyKey: "demo.tour.step2Body" },
  { selector: '[data-tour="quiz"]', titleKey: "demo.tour.step3Title", bodyKey: "demo.tour.step3Body" },
];

const CARD_WIDTH = 320;
const CARD_GAP = 12;
const VIEWPORT_MARGIN = 12;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const measure = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

/**
 * 3-step onboarding tour shown on first visit to /demo.
 * - Highlights real UI elements via a portal overlay (ring + popover card)
 * - Dismissal persisted in localStorage; never shown again
 * - Esc or Skip dismisses; clicking outside the card does NOT dismiss (avoid accidents)
 */
export function DemoTour() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Initial visibility check (only after mount → safe to read localStorage)
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setActive(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Resolve target rect each time step changes + on resize/scroll.
  useLayoutEffect(() => {
    if (!active) return;
    const step = STEPS[stepIdx];

    const update = () => {
      const el = document.querySelector(step.selector);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      // Wait one frame for scroll to start so the rect is closer to final
      requestAnimationFrame(() => setRect(measure(el)));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const interval = window.setInterval(update, 250); // catch layout shifts
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(interval);
    };
  }, [active, stepIdx]);

  // Esc → skip
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setActive(false);
  };

  const next = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      finish();
      navigate("/app");
    }
  };

  const back = () => setStepIdx((i) => Math.max(0, i - 1));

  if (!active || !rect) return null;

  // Place card below the target if possible, otherwise above.
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const spaceBelow = vh - (rect.top + rect.height);
  const placeBelow = spaceBelow > 200 || rect.top < 200;
  const cardTop = placeBelow
    ? rect.top + rect.height + CARD_GAP
    : Math.max(VIEWPORT_MARGIN, rect.top - CARD_GAP - 200);
  const desiredLeft = rect.left + rect.width / 2 - CARD_WIDTH / 2;
  const cardLeft = Math.max(
    VIEWPORT_MARGIN,
    Math.min(vw - CARD_WIDTH - VIEWPORT_MARGIN, desiredLeft),
  );

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[60] pointer-events-none" aria-live="polite">
      {/* Highlight ring around the target */}
      <div
        className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background motion-safe:transition-all motion-safe:duration-200"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
        aria-hidden
      />
      {/* Tour card */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="demo-tour-title"
        className="absolute pointer-events-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-4 motion-safe:transition-all motion-safe:duration-200"
        style={{ top: cardTop, left: cardLeft, width: CARD_WIDTH }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {t("demo.tour.progress", { current: stepIdx + 1, total: STEPS.length })}
          </span>
          <button
            type="button"
            onClick={finish}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("demo.tour.skip")}
          </button>
        </div>
        <h2 id="demo-tour-title" className="font-serif text-lg mb-1.5">
          {t(step.titleKey)}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {t(step.bodyKey)}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={back}
            disabled={stepIdx === 0}
            className="h-8"
          >
            {t("demo.tour.back")}
          </Button>
          <Button type="button" size="sm" onClick={next} className="h-8">
            {isLast ? t("demo.tour.done") : t("demo.tour.next")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
