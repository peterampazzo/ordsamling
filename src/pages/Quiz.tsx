import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  XCircle,
  SkipForward,
  RotateCcw,
  Keyboard,
  LayoutGrid,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLexicon } from "@/hooks/useLexicon";
import type { LexisEntry } from "@/hooks/useLexicon";
import { entryTypeLabel } from "@/lib/lexicon";
import { saveSession, type QuizAnswerRecord } from "@/lib/quizHistory";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type QuizMode = "choice" | "type";

type LangDirection = {
  from: "danish" | "english" | "italian";
  to: "danish" | "english" | "italian";
  fromLabel: string;
  toLabel: string;
};

const DIRECTIONS: LangDirection[] = [
  { from: "danish", to: "english", fromLabel: "Dansk", toLabel: "Engelsk" },
  { from: "danish", to: "italian", fromLabel: "Dansk", toLabel: "Italiensk" },
  { from: "english", to: "danish", fromLabel: "Engelsk", toLabel: "Dansk" },
  { from: "english", to: "italian", fromLabel: "Engelsk", toLabel: "Italiensk" },
  { from: "italian", to: "danish", fromLabel: "Italiensk", toLabel: "Dansk" },
  { from: "italian", to: "english", fromLabel: "Italiensk", toLabel: "Engelsk" },
];

interface QuizQuestion {
  entry: LexisEntry;
  prompt: string;
  answer: string;
  options: string[];
}

type QuizState = "setup" | "playing" | "result";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(
  entries: LexisEntry[],
  direction: LangDirection,
  count: number,
): QuizQuestion[] {
  const eligible = entries.filter(
    (e) => e[direction.from].trim() && e[direction.to].trim(),
  );
  if (eligible.length < 2) return [];
  const picked = shuffle(eligible).slice(0, count);
  const allAnswers = eligible.map((e) => e[direction.to]);
  return picked.map((entry) => {
    const answer = entry[direction.to];
    const wrong = shuffle(allAnswers.filter((a) => a.toLowerCase() !== answer.toLowerCase())).slice(0, 3);
    return { entry, prompt: entry[direction.from], answer, options: shuffle([answer, ...wrong]) };
  });
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Quiz = () => {
  const { allEntries } = useLexicon();

  const [direction, setDirection] = useState<LangDirection>(DIRECTIONS[0]);
  const [mode, setMode] = useState<QuizMode>("choice");
  const [questionCount, setQuestionCount] = useState(10);

  const [state, setState] = useState<QuizState>("setup");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showResult, setShowResult] = useState(false);

  // Track answers for history
  const answersRef = useRef<QuizAnswerRecord[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const current = questions[currentIdx] ?? null;
  const total = questions.length;
  const progress = total > 0 ? ((currentIdx + (showResult ? 1 : 0)) / total) * 100 : 0;

  const eligibleCount = useMemo(() => {
    return allEntries.filter(
      (e) => e[direction.from].trim() && e[direction.to].trim(),
    ).length;
  }, [allEntries, direction]);

  const startQuiz = useCallback(() => {
    const q = buildQuestions(allEntries, direction, questionCount);
    if (q.length < 2) return;
    setQuestions(q);
    setCurrentIdx(0);
    setScore(0);
    setAnswered(null);
    setTypedAnswer("");
    setShowResult(false);
    answersRef.current = [];
    setState("playing");
  }, [allEntries, direction, questionCount]);

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!current || showResult) return;
      const skipped = answer === "__skipped__";
      const correct = !skipped && normalize(answer) === normalize(current.answer);

      setAnswered(answer);
      setShowResult(true);
      if (correct) setScore((s) => s + 1);

      answersRef.current.push({
        prompt: current.prompt,
        correctAnswer: current.answer,
        givenAnswer: skipped ? "" : answer,
        correct,
        skipped,
        fromLang: direction.from,
        toLang: direction.to,
        entryId: current.entry.id,
      });
    },
    [current, showResult, direction],
  );

  const finishQuiz = useCallback(() => {
    // Save session to history
    saveSession({
      id: crypto.randomUUID(),
      date: Date.now(),
      mode,
      fromLabel: direction.fromLabel,
      toLabel: direction.toLabel,
      score,
      total,
      answers: answersRef.current,
    });
    setState("result");
  }, [mode, direction, score, total]);

  const nextQuestion = useCallback(() => {
    if (currentIdx + 1 >= total) {
      finishQuiz();
    } else {
      setCurrentIdx((i) => i + 1);
      setAnswered(null);
      setTypedAnswer("");
      setShowResult(false);
    }
  }, [currentIdx, total, finishQuiz]);

  useEffect(() => {
    if (state === "playing" && mode === "type" && !showResult) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state, mode, showResult, currentIdx]);

  const isCorrect = answered !== null && normalize(answered) === normalize(current?.answer ?? "");

  /* ---- Setup screen ---- */
  if (state === "setup") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="shrink-0" asChild>
                <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
              </Button>
              <Brain className="h-5 w-5 text-primary" />
              <h1 className="text-base sm:text-lg font-semibold text-foreground">Ordquiz</h1>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/quiz/history">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">Historik</span>
              </Link>
            </Button>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 py-8 space-y-8">
          {allEntries.length < 4 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Brain className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-base">Du har brug for mindst 4 ord for at starte en quiz</p>
              <Button variant="outline" asChild className="mt-4">
                <Link to="/">Tilføj ord</Link>
              </Button>
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-foreground">Retning</h2>
                <div className="grid grid-cols-2 gap-2">
                  {DIRECTIONS.map((d) => (
                    <button
                      key={`${d.from}-${d.to}`}
                      type="button"
                      onClick={() => setDirection(d)}
                      className={cn(
                        "px-3 py-2.5 rounded-lg border text-sm transition-colors text-left",
                        direction.from === d.from && direction.to === d.to
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-card text-foreground border-border hover:border-primary/40",
                      )}
                    >
                      {d.fromLabel} → {d.toLabel}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{eligibleCount} ord tilgængelige</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-medium text-foreground">Tilstand</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMode("choice")}
                    className={cn("flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                      mode === "choice" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                    <LayoutGrid className="h-4 w-4" /> Multiple choice
                  </button>
                  <button type="button" onClick={() => setMode("type")}
                    className={cn("flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                      mode === "type" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                    <Keyboard className="h-4 w-4" /> Skriv svar
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-medium text-foreground">Antal spørgsmål</h2>
                <div className="flex gap-2">
                  {[5, 10, 20, 50].map((n) => (
                    <button key={n} type="button" onClick={() => setQuestionCount(n)}
                      className={cn("px-3 py-2 rounded-lg border text-sm transition-colors min-w-[3rem]",
                        questionCount === n ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                      {n}
                    </button>
                  ))}
                </div>
              </section>

              <Button onClick={startQuiz} disabled={eligibleCount < 2} className="w-full h-11 text-base">
                Start quiz
              </Button>
            </>
          )}
        </main>
      </div>
    );
  }

  /* ---- Result screen ---- */
  if (state === "result") {
    const pct = Math.round((score / total) * 100);
    const sessionAnswers = answersRef.current;

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border bg-card/90 shadow-sm">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 flex items-center gap-3 py-3">
            <Brain className="h-5 w-5 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold text-foreground">Resultat</h1>
          </div>
        </header>

        <main className="flex-1 px-4 py-8">
          <div className="max-w-md mx-auto space-y-8">
            {/* Score */}
            <div className="text-center space-y-3">
              <div className={cn("text-6xl font-bold", pct >= 80 ? "text-primary" : pct >= 50 ? "text-accent-foreground" : "text-destructive")}>
                {pct}%
              </div>
              <p className="text-lg text-foreground">{score} af {total} rigtige</p>
              <p className="text-sm text-muted-foreground">
                {pct >= 90 ? "Fantastisk! 🎉" : pct >= 70 ? "Godt gået! 👍" : pct >= 50 ? "Ikke dårligt, men øv dig lidt mere" : "Bliv ved med at øve! 💪"}
              </p>
            </div>

            {/* Answer breakdown */}
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-foreground">Dine svar</h2>
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {sessionAnswers.map((a, i) => (
                  <div key={i} className={cn("px-3 py-2.5 text-sm flex items-start gap-2", a.correct ? "bg-card" : "bg-destructive/5")}>
                    {a.skipped ? (
                      <SkipForward className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    ) : a.correct ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{a.prompt}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className={cn("font-medium", a.correct ? "text-primary" : "text-destructive")}>
                        {a.skipped ? "—" : a.givenAnswer}
                      </span>
                      {!a.correct && !a.skipped && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Rigtigt: <span className="text-foreground">{a.correctAnswer}</span>
                        </p>
                      )}
                      {a.skipped && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Svar: <span className="text-foreground">{a.correctAnswer}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => setState("setup")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Indstillinger
              </Button>
              <Button onClick={startQuiz}>
                <RotateCcw className="h-4 w-4 mr-1" /> Prøv igen
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ---- Playing screen ---- */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/90 shadow-sm">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">{currentIdx + 1} / {total}</span>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">{score} rigtige</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        {current && (
          <div className="max-w-md w-full space-y-8">
            <div className="text-center space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{direction.fromLabel}</p>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">{current.prompt}</p>
              <span className={cn("inline-block text-[10px] font-medium uppercase px-2 py-0.5 rounded-full", "bg-muted text-muted-foreground")}>
                {entryTypeLabel(current.entry.type)}
              </span>
            </div>

            {mode === "choice" ? (
              <div className="grid grid-cols-1 gap-2.5">
                {current.options.map((opt) => {
                  const isThis = answered === opt;
                  const isRight = normalize(opt) === normalize(current.answer);
                  let cls = "bg-card text-foreground border-border hover:border-primary/40";
                  if (showResult) {
                    if (isRight) cls = "bg-primary/10 text-primary border-primary ring-1 ring-primary/30";
                    else if (isThis && !isRight) cls = "bg-destructive/10 text-destructive border-destructive";
                    else cls = "bg-muted/50 text-muted-foreground border-border opacity-60";
                  }
                  return (
                    <button key={opt} type="button" disabled={showResult} onClick={() => submitAnswer(opt)}
                      className={cn("px-4 py-3 rounded-lg border text-sm text-left transition-all", cls)}>
                      <span className="flex items-center gap-2">
                        {showResult && isRight && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        {showResult && isThis && !isRight && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground text-center">Skriv oversættelsen på {direction.toLabel.toLowerCase()}</p>
                <form onSubmit={(e) => { e.preventDefault(); if (!showResult && typedAnswer.trim()) submitAnswer(typedAnswer); }} className="flex gap-2">
                  <Input ref={inputRef} value={typedAnswer} onChange={(e) => setTypedAnswer(e.target.value)}
                    disabled={showResult} placeholder="Dit svar…" className="flex-1" autoComplete="off" autoCorrect="off" spellCheck={false} />
                  <Button type="submit" disabled={showResult || !typedAnswer.trim()}>Tjek</Button>
                </form>
                {showResult && (
                  <div className={cn("px-4 py-3 rounded-lg border text-sm", isCorrect ? "bg-primary/10 text-primary border-primary/30" : "bg-destructive/10 text-destructive border-destructive/30")}>
                    {isCorrect ? (
                      <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Rigtigt!</span>
                    ) : (
                      <span className="space-y-1">
                        <span className="flex items-center gap-2"><XCircle className="h-4 w-4" /> Forkert</span>
                        <p className="text-foreground font-medium mt-1">Rigtigt svar: {current.answer}</p>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-center gap-3">
              {showResult ? (
                <Button onClick={nextQuestion} className="min-w-[8rem]">
                  {currentIdx + 1 >= total ? "Se resultat" : "Næste"}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => submitAnswer("__skipped__")} className="text-muted-foreground">
                  <SkipForward className="h-4 w-4 mr-1" /> Spring over
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Quiz;
