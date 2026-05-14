import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { loadHistory } from "@/lib/quizHistory";
import {
  computeStreak,
  getDailyGoal,
  wordsPracticedToday,
} from "@/lib/streak";
import { t } from "@/i18n";

const SIZE = 28;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * Quiet ring indicator showing today's progress against the daily goal.
 * - Empty ring: no practice today
 * - Filled arc: % of daily goal completed
 * - Inner dot or streak number when goal met
 * Click → /progress.
 */
export function StreakRing() {
  const [tick, setTick] = useState(0);

  // Re-read on mount + whenever quiz history changes (cross-tab + same-tab event).
  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener("storage", refresh);
    window.addEventListener("ordsamling:entries-synced", refresh);
    window.addEventListener("ordsamling:quiz-recorded", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("ordsamling:entries-synced", refresh);
      window.removeEventListener("ordsamling:quiz-recorded", refresh);
    };
  }, []);

  // Recompute every render — cheap, history is capped at 50 sessions.
  void tick;
  const history = loadHistory();
  const goal = getDailyGoal();
  const today = wordsPracticedToday(history);
  const streak = computeStreak(history);
  const pct = Math.min(1, today / Math.max(1, goal));
  const dash = CIRC * pct;

  const goalLabel = t("streak.goalProgress", { done: today, goal });
  const streakLabel = streak.current > 0
    ? t("streak.streakDays", { count: streak.current })
    : t("streak.noStreak");
  const tooltip = `${goalLabel} · ${streakLabel}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/progress"
          aria-label={tooltip}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-accent transition-colors"
        >
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={STROKE}
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRC - dash}`}
              strokeDashoffset={CIRC / 4}
              strokeLinecap="round"
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              className="motion-safe:transition-all motion-safe:duration-500"
            />
            {streak.current > 0 && (
              <text
                x={SIZE / 2}
                y={SIZE / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: 10, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              >
                {streak.current}
              </text>
            )}
          </svg>
        </Link>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
