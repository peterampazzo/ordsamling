import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import {
  Flame,
  Target,
  TrendingUp,
  Award,
  BookOpen,
  History,
  CheckCircle2,
  XCircle,
  SkipForward,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PageHeader, PageFooter } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  fetchHistory,
  loadHistory,
  loadBoxStates,
  clearHistory,
  wordStats,
  type QuizSessionRecord,
} from "@/lib/quizHistory";
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

type TabKey = "overview" | "sessions" | "words";
const VALID_TABS: TabKey[] = ["overview", "sessions", "words"];

function shortWeekLabel(label: string): string {
  const d = new Date(label);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function modeLabel(mode: QuizSessionRecord["mode"]): string {
  return t(`quizHistory.modeLabels.${mode}`);
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

const SessionCard = ({ session }: { session: QuizSessionRecord }) => {
  const [open, setOpen] = useState(false);
  const pct = Math.round((session.score / session.total) * 100);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={cn(
              "text-lg font-bold tabular-nums",
              pct >= 80 ? "text-primary" : pct >= 50 ? "text-accent-foreground" : "text-destructive",
            )}
          >
            {pct}%
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {session.fromLabel} → {session.toLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(session.date)} · {session.score}/{session.total} · {modeLabel(session.mode)}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {session.answers.map((a, i) => (
            <div
              key={i}
              className={cn(
                "px-4 py-2 text-sm flex items-start gap-2",
                a.correct ? "" : "bg-destructive/5",
              )}
            >
              {a.skipped ? (
                <SkipForward className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              ) : a.correct ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">{a.prompt}</span>
                <span className="text-muted-foreground"> → </span>
                <span className={cn("font-medium", a.correct ? "text-primary" : "text-destructive")}>
                  {a.skipped ? "—" : a.givenAnswer}
                </span>
                {!a.correct && (
                  <span className="text-xs text-muted-foreground ml-1">({a.correctAnswer})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Progress = () => {
  const { allEntries } = useLexicon();
  const [history, setHistory] = useState<QuizSessionRecord[]>(() => loadHistory());
  const [goal, setGoalState] = useState<number>(() => getDailyGoal());
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = VALID_TABS.includes(tabParam as TabKey)
    ? (tabParam as TabKey)
    : "overview";

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
  const allStats = useMemo(() => wordStats(history), [history]);
  const mastery = useMemo(() => timeToMastery(history, loadBoxStates()), [history]);

  const handleGoalChange = (next: number) => {
    if (!Number.isFinite(next) || next < 1) return;
    setDailyGoal(next);
    setGoalState(next);
  };

  const handleClear = async () => {
    if (window.confirm(t("common.confirmDeleteAll"))) {
      await clearHistory();
      setHistory([]);
    }
  };

  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
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
        actions={
          activeTab === "sessions" && history.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              aria-label={t("common.confirmDeleteAll")}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          ) : undefined
        }
      />

      <main id="main" className="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">{t("progress.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="sessions">
              {t("progress.tabs.sessions")}
              {history.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                  ({history.length})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="words">{t("progress.tabs.words")}</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4 mt-4">
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
                hint={
                  today >= goal
                    ? t("progress.goalMet")
                    : t("progress.goalRemaining", { count: Math.max(0, goal - today) })
                }
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
          </TabsContent>

          {/* SESSIONS */}
          <TabsContent value="sessions" className="space-y-3 mt-4">
            {history.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <History className="h-10 w-10 mx-auto mb-3 opacity-30" aria-hidden />
                <p>{t("quizHistory.noHistory")}</p>
                <p className="text-sm mt-1">{t("quizHistory.noHistoryHint")}</p>
              </div>
            ) : (
              history.map((s) => <SessionCard key={s.id} session={s} />)
            )}
          </TabsContent>

          {/* WORDS */}
          <TabsContent value="words" className="space-y-3 mt-4">
            <section className="border border-border rounded-lg overflow-hidden bg-card">
              <h2 className="text-sm font-medium text-foreground px-4 pt-3 pb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
                {t("progress.hardestTitle")}
              </h2>
              {allStats.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("progress.empty")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {allStats.map((w, i) => {
                    const pct = w.total > 0 ? Math.round((w.correct / w.total) * 100) : 0;
                    return (
                      <li
                        key={i}
                        className="px-4 py-2.5 flex items-center justify-between text-sm"
                      >
                        <span className="font-medium text-foreground truncate">{w.prompt}</span>
                        <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                          <span className="text-primary">{w.correct}✓</span>
                          <span className="text-destructive">{w.wrong}✗</span>
                          <span
                            className={cn(
                              "font-medium",
                              pct >= 70
                                ? "text-primary"
                                : pct >= 40
                                  ? "text-accent-foreground"
                                  : "text-destructive",
                            )}
                          >
                            {pct}%
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </main>

      <PageFooter />
    </div>
  );
};

export default Progress;
