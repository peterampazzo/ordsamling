import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Flame, Target, TrendingUp, Award, BookOpen } from "lucide-react";
import { PageHeader, PageFooter } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchHistory, loadHistory, loadBoxStates, wordStats, type QuizSessionRecord } from "@/lib/quizHistory";
import { useLexicon } from "@/hooks/useLexicon";
import {
  accuracyTrendPerWeek,
  computeStreak,
  getDailyGoal,
  setDailyGoal,
  timeToMastery,
  wordsAddedPerWeek,
  wordsPracticedToday,
} from "@/lib/streak";
import { t } from "@/i18n";

function shortWeekLabel(label: string): string {
  // YYYY-MM-DD → "DD MMM"
  const d = new Date(label);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const StatCard = ({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="border border-border rounded-lg p-4 bg-card">
    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </div>
    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border border-border rounded-lg p-4 bg-card">
    <h2 className="text-sm font-medium text-foreground mb-3">{title}</h2>
    <div className="h-48">{children}</div>
  </section>
);

const Progress = () => {
  const { allEntries } = useLexicon();
  const [history, setHistory] = useState<QuizSessionRecord[]>(() => loadHistory());
  const [goal, setGoalState] = useState<number>(() => getDailyGoal());

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const remote = await fetchHistory();
      if (mounted) setHistory(remote);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const streak = useMemo(() => computeStreak(history), [history]);
  const today = useMemo(() => wordsPracticedToday(history), [history]);
  const wpw = useMemo(() => wordsAddedPerWeek(allEntries, 12), [allEntries]);
  const acc = useMemo(() => accuracyTrendPerWeek(history, 12), [history]);
  const stats = useMemo(() => wordStats(history).slice(0, 10), [history]);
  const mastery = useMemo(() => timeToMastery(history, loadBoxStates()), [history]);

  const handleGoalChange = (next: number) => {
    if (!Number.isFinite(next) || next < 1) return;
    setDailyGoal(next);
    setGoalState(next);
  };

  const masteryHint = mastery.averageDays !== null
    ? t("progress.masteryHint", { days: Math.round(mastery.averageDays) })
    : t("progress.masteryEmpty");

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        backTo="/app"
        pageLabel={t("progress.title")}
        srHeading={t("progress.title")}
      />

      <main id="main" className="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        {/* Daily goal + streak */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={Flame}
            label={t("progress.streakLabel")}
            value={String(streak.current)}
            hint={t("progress.streakHint", { longest: streak.longest })}
          />
          <StatCard
            icon={Target}
            label={t("progress.todayLabel")}
            value={`${today}/${goal}`}
            hint={today >= goal ? t("progress.goalMet") : t("progress.goalRemaining", { count: Math.max(0, goal - today) })}
          />
          <StatCard
            icon={Award}
            label={t("progress.masteredLabel")}
            value={String(mastery.masteredCount)}
            hint={masteryHint}
          />
          <StatCard
            icon={BookOpen}
            label={t("progress.totalWordsLabel")}
            value={String(allEntries.length)}
          />
        </section>

        {/* Goal editor */}
        <section className="border border-border rounded-lg p-4 bg-card flex items-center gap-3 flex-wrap">
          <Label htmlFor="daily-goal" className="text-sm">
            {t("progress.dailyGoalLabel")}
          </Label>
          <Input
            id="daily-goal"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={goal}
            onChange={(e) => handleGoalChange(parseInt(e.target.value, 10))}
            className="w-24 h-9"
          />
          <p className="text-xs text-muted-foreground">{t("progress.dailyGoalHint")}</p>
        </section>

        {/* Words added per week */}
        <ChartCard title={t("progress.wordsAddedTitle")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={wpw.map((p) => ({ ...p, x: shortWeekLabel(p.label) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="x" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <RechartsTooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Accuracy trend */}
        <ChartCard title={t("progress.accuracyTitle")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={acc.map((p) => ({ ...p, x: shortWeekLabel(p.label) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="x" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="%" />
              <RechartsTooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v}%`, t("progress.accuracyTitle")]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Hardest words */}
        <section className="border border-border rounded-lg overflow-hidden bg-card">
          <h2 className="text-sm font-medium text-foreground px-4 pt-3 pb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t("progress.hardestTitle")}
          </h2>
          {stats.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("progress.empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.map((w, i) => {
                const pct = w.total > 0 ? Math.round((w.correct / w.total) * 100) : 0;
                return (
                  <li key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground truncate">{w.prompt}</span>
                    <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                      <span className="text-primary">{w.correct}✓</span>
                      <span className="text-destructive">{w.wrong}✗</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <PageFooter />
    </div>
  );
};

export default Progress;
