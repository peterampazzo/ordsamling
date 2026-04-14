import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  History,
  CheckCircle2,
  XCircle,
  SkipForward,
  Trash2,
  ChevronDown,
  ChevronUp,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchHistory, loadHistory, clearHistory, wordStats, type QuizSessionRecord } from "@/lib/quizHistory";
import { t } from "@/i18n";

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
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {session.answers.map((a, i) => (
            <div key={i} className={cn("px-4 py-2 text-sm flex items-start gap-2", a.correct ? "" : "bg-destructive/5")}>
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

const QuizHistory = () => {
  const [history, setHistory] = useState<QuizSessionRecord[]>(() => loadHistory());
  const [tab, setTab] = useState<"sessions" | "words">("sessions");
  const [loading, setLoading] = useState(true);

  const stats = useMemo(() => wordStats(history), [history]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const remoteHistory = await fetchHistory();
      if (mounted) {
        setHistory(remoteHistory);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleClear = async () => {
    if (window.confirm(t("common.confirmDeleteAll"))) {
      await clearHistory();
      setHistory([]);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link to="/quiz"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <History className="h-5 w-5 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold text-foreground">{t("quizHistory.title")}</h1>
          </div>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-3 sm:px-4">
        {/* Tabs */}
        <div className="flex gap-1.5 py-3 border-b border-border">
          <button type="button" onClick={() => setTab("sessions")}
            className={cn("px-3 py-1.5 text-xs rounded-full border transition-colors",
              tab === "sessions" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/80 text-secondary-foreground border-border hover:border-primary/40")}>
            {t("quizHistory.sessions")} ({history.length})
          </button>
          <button type="button" onClick={() => setTab("words")}
            className={cn("px-3 py-1.5 text-xs rounded-full border transition-colors flex items-center gap-1",
              tab === "words" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/80 text-secondary-foreground border-border hover:border-primary/40")}>
            <TrendingDown className="h-3 w-3" /> {t("quizHistory.weakestWords")}
          </button>
        </div>

        <main className="py-4 space-y-3">
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{t("common.loading")}</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{t("quizHistory.noHistory")}</p>
              <p className="text-sm mt-1">{t("quizHistory.noHistoryHint")}</p>
            </div>
          ) : tab === "sessions" ? (
            history.map((s) => <SessionCard key={s.id} session={s} />)
          ) : stats.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">{t("quizHistory.noData")}</p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              {stats.map((w, i) => {
                const pct = w.total > 0 ? Math.round((w.correct / w.total) * 100) : 0;
                return (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{w.prompt}</span>
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      <span className="text-primary">{w.correct}✓</span>
                      <span className="text-destructive">{w.wrong}✗</span>
                      <span className={cn("font-medium", pct >= 70 ? "text-primary" : pct >= 40 ? "text-accent-foreground" : "text-destructive")}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default QuizHistory;
