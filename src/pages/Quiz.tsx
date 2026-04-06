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
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLexicon } from "@/hooks/useLexicon";
import type { LexisEntry } from "@/hooks/useLexicon";
import { entryTypeLabel, GRAMMAR_FIELD_CONFIG, type EntryGrammar } from "@/lib/lexicon";
import { saveSession, type QuizAnswerRecord } from "@/lib/quizHistory";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type QuizMode = "choice" | "type";
type Difficulty = "beginner" | "intermediate" | "advanced";

type LangDirection = {
  from: "danish" | "english";
  to: "danish" | "english";
  fromLabel: string;
  toLabel: string;
};

const DIRECTIONS: LangDirection[] = [
  { from: "danish", to: "english", fromLabel: "Dansk", toLabel: "Engelsk" },
  { from: "english", to: "danish", fromLabel: "Engelsk", toLabel: "Dansk" },
];

const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: "beginner", label: "Begynder", description: "Simpel oversættelse, multiple choice" },
  { value: "intermediate", label: "Øvet", description: "+ bøjningsformer & udfyld-felter" },
  { value: "advanced", label: "Avanceret", description: "+ staveøvelser & blandede opgaver" },
];

/** Question types that get progressively harder */
type QuestionType = "translate" | "conjugation" | "noun_form" | "fill_blank";

interface QuizQuestion {
  entry: LexisEntry;
  prompt: string;
  answer: string;
  options: string[];       // only used for choice mode
  questionType: QuestionType;
  hint?: string;           // e.g. "Nutid af…" or "Bestemt flertal af…"
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

function normalize(s: string) {
  return s.trim().toLowerCase();
}

/** Create a fill-in-the-blank prompt: mask 30-60% of inner characters */
function makeBlank(word: string): string {
  if (word.length <= 2) return "_".repeat(word.length);
  const chars = word.split("");
  const maskCount = Math.max(1, Math.floor(chars.length * 0.4));
  const indices = shuffle(
    Array.from({ length: chars.length - 2 }, (_, i) => i + 1),
  ).slice(0, maskCount);
  indices.forEach((i) => {
    if (chars[i] !== " ") chars[i] = "_";
  });
  return chars.join("");
}

/** Get a grammar value from an entry if it exists */
function getGrammarValue(entry: LexisEntry, key: keyof EntryGrammar): string | undefined {
  return entry.grammar?.[key]?.trim() || undefined;
}

/** Build verb conjugation questions */
function buildConjugationQuestions(entries: LexisEntry[]): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const verbs = entries.filter((e) => e.type === "verb" && e.grammar);
  const tenseMap: { key: keyof EntryGrammar; label: string }[] = [
    { key: "present", label: "Nutid" },
    { key: "past", label: "Datid" },
    { key: "perfect", label: "Perfektum" },
  ];

  for (const verb of verbs) {
    for (const { key, label } of tenseMap) {
      const val = getGrammarValue(verb, key);
      if (val) {
        questions.push({
          entry: verb,
          prompt: verb.danish,
          answer: val,
          options: [],
          questionType: "conjugation",
          hint: `${label} af «${verb.danish}»`,
        });
      }
    }
  }
  return questions;
}

/** Build noun form questions */
function buildNounFormQuestions(entries: LexisEntry[]): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const nouns = entries.filter((e) => e.type === "noun" && e.grammar);
  const formMap: { key: keyof EntryGrammar; label: string }[] = [
    { key: "singularDefinite", label: "Bestemt ental" },
    { key: "pluralIndefinite", label: "Ubestemt flertal" },
    { key: "pluralDefinite", label: "Bestemt flertal" },
  ];

  for (const noun of nouns) {
    for (const { key, label } of formMap) {
      const val = getGrammarValue(noun, key);
      if (val) {
        questions.push({
          entry: noun,
          prompt: noun.danish,
          answer: val,
          options: [],
          questionType: "noun_form",
          hint: `${label} af «${noun.danish}»`,
        });
      }
    }
  }
  return questions;
}

/** Build fill-in-the-blank questions */
function buildFillBlankQuestions(entries: LexisEntry[], direction: LangDirection): QuizQuestion[] {
  const eligible = entries.filter((e) => e[direction.to].trim().length >= 3);
  return eligible.map((entry) => {
    const answer = entry[direction.to];
    return {
      entry,
      prompt: makeBlank(answer),
      answer,
      options: [],
      questionType: "fill_blank" as QuestionType,
      hint: `Udfyld: ${entry[direction.from]}`,
    };
  });
}

function buildQuestions(
  entries: LexisEntry[],
  direction: LangDirection,
  count: number,
  difficulty: Difficulty,
  mode: QuizMode,
): QuizQuestion[] {
  const eligible = entries.filter((e) => e[direction.from].trim() && e[direction.to].trim());
  if (eligible.length < 2) return [];

  // Pool of all potential questions
  let pool: QuizQuestion[] = [];

  // Always include translation questions
  const translateQs: QuizQuestion[] = eligible.map((entry) => ({
    entry,
    prompt: entry[direction.from],
    answer: entry[direction.to],
    options: [],
    questionType: "translate" as QuestionType,
  }));
  pool.push(...translateQs);

  // Intermediate: add conjugation & noun forms
  if (difficulty !== "beginner") {
    pool.push(...buildConjugationQuestions(entries));
    pool.push(...buildNounFormQuestions(entries));
  }

  // Advanced: add fill-in-the-blank
  if (difficulty === "advanced") {
    pool.push(...buildFillBlankQuestions(entries, direction));
  }

  // Pick questions
  const picked = shuffle(pool).slice(0, count);

  // Generate MC options for choice mode
  if (mode === "choice") {
    const allTranslations = eligible.map((e) => e[direction.to]);
    const allGrammarValues: string[] = [];
    for (const e of entries) {
      if (e.grammar) {
        Object.values(e.grammar).filter(Boolean).forEach((v) => {
          if (typeof v === "string" && v.trim()) allGrammarValues.push(v.trim());
        });
      }
    }

    for (const q of picked) {
      const answerPool = q.questionType === "translate" ? allTranslations : allGrammarValues;
      const wrong = shuffle(answerPool.filter((a) => normalize(a) !== normalize(q.answer))).slice(0, 3);
      q.options = shuffle([q.answer, ...wrong]);
    }
  }

  return picked;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Quiz = () => {
  const { allEntries } = useLexicon();

  const [direction, setDirection] = useState<LangDirection>(DIRECTIONS[0]);
  const [mode, setMode] = useState<QuizMode>("choice");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [questionCount, setQuestionCount] = useState(10);

  const [state, setState] = useState<QuizState>("setup");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showResult, setShowResult] = useState(false);

  const answersRef = useRef<QuizAnswerRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = questions[currentIdx] ?? null;
  const total = questions.length;
  const progress = total > 0 ? ((currentIdx + (showResult ? 1 : 0)) / total) * 100 : 0;

  const eligibleCount = useMemo(() => {
    return allEntries.filter((e) => e[direction.from].trim() && e[direction.to].trim()).length;
  }, [allEntries, direction]);

  const startQuiz = useCallback(() => {
    const q = buildQuestions(allEntries, direction, questionCount, difficulty, mode);
    if (q.length < 2) return;
    setQuestions(q);
    setCurrentIdx(0);
    setScore(0);
    setAnswered(null);
    setTypedAnswer("");
    setShowResult(false);
    answersRef.current = [];
    setState("playing");
  }, [allEntries, direction, questionCount, difficulty, mode]);

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!current || showResult) return;
      const skipped = answer === "__skipped__";
      const correct = !skipped && normalize(answer) === normalize(current.answer);
      setAnswered(answer);
      setShowResult(true);
      if (correct) setScore((s) => s + 1);
      answersRef.current.push({
        prompt: current.hint || current.prompt,
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
    if (currentIdx + 1 >= total) finishQuiz();
    else {
      setCurrentIdx((i) => i + 1);
      setAnswered(null);
      setTypedAnswer("");
      setShowResult(false);
    }
  }, [currentIdx, total, finishQuiz]);

  useEffect(() => {
    if (state === "playing" && (mode === "type" || (current?.questionType !== "translate" && mode !== "choice")) && !showResult) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state, mode, showResult, currentIdx, current?.questionType]);

  const isCorrect = answered !== null && normalize(answered) === normalize(current?.answer ?? "");

  // Determine if current question should use typing regardless of mode
  const forceType = current && current.questionType !== "translate" && mode === "choice" && current.options.length < 2;
  const effectiveMode = forceType ? "type" : mode;

  /* ---- Question type badge ---- */
  const questionTypeBadge = (qt: QuestionType) => {
    const labels: Record<QuestionType, string> = {
      translate: "Oversæt",
      conjugation: "Bøjning",
      noun_form: "Substantiv",
      fill_blank: "Udfyld",
    };
    return labels[qt];
  };

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
              <Button variant="outline" asChild className="mt-4"><Link to="/">Tilføj ord</Link></Button>
            </div>
          ) : (
            <>
              {/* Difficulty */}
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Gauge className="h-4 w-4" /> Sværhedsgrad
                </h2>
                <div className="grid grid-cols-1 gap-2">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDifficulty(d.value)}
                      className={cn(
                        "px-3 py-3 rounded-lg border text-sm transition-colors text-left",
                        difficulty === d.value
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-card text-foreground border-border hover:border-primary/40",
                      )}
                    >
                      <span className="font-medium">{d.label}</span>
                      <p className={cn("text-xs mt-0.5", difficulty === d.value ? "text-primary-foreground/80" : "text-muted-foreground")}>{d.description}</p>
                    </button>
                  ))}
                </div>
              </section>

              {/* Direction */}
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

              {/* Mode */}
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

              {/* Count */}
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
            <div className="text-center space-y-3">
              <div className={cn("text-6xl font-bold", pct >= 80 ? "text-primary" : pct >= 50 ? "text-accent-foreground" : "text-destructive")}>{pct}%</div>
              <p className="text-lg text-foreground">{score} af {total} rigtige</p>
              <p className="text-sm text-muted-foreground">
                {pct >= 90 ? "Fantastisk! 🎉" : pct >= 70 ? "Godt gået! 👍" : pct >= 50 ? "Ikke dårligt, men øv dig lidt mere" : "Bliv ved med at øve! 💪"}
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-medium text-foreground">Dine svar</h2>
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {sessionAnswers.map((a, i) => (
                  <div key={i} className={cn("px-3 py-2.5 text-sm flex items-start gap-2", a.correct ? "bg-card" : "bg-destructive/5")}>
                    {a.skipped ? <SkipForward className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> : a.correct ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{a.prompt}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className={cn("font-medium", a.correct ? "text-primary" : "text-destructive")}>{a.skipped ? "—" : a.givenAnswer}</span>
                      {!a.correct && !a.skipped && <p className="text-xs text-muted-foreground mt-0.5">Rigtigt: <span className="text-foreground">{a.correctAnswer}</span></p>}
                      {a.skipped && <p className="text-xs text-muted-foreground mt-0.5">Svar: <span className="text-foreground">{a.correctAnswer}</span></p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => setState("setup")}><ArrowLeft className="h-4 w-4 mr-1" /> Indstillinger</Button>
              <Button onClick={startQuiz}><RotateCcw className="h-4 w-4 mr-1" /> Prøv igen</Button>
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
              {current.hint ? (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{questionTypeBadge(current.questionType)}</p>
                  <p className="text-sm text-muted-foreground">{current.hint}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground font-mono tracking-wide">{current.prompt}</p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{direction.fromLabel}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">{current.prompt}</p>
                </>
              )}
              <span className={cn("inline-block text-[10px] font-medium uppercase px-2 py-0.5 rounded-full", "bg-muted text-muted-foreground")}>
                {entryTypeLabel(current.entry.type)}
              </span>
            </div>

            {effectiveMode === "choice" ? (
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
                <p className="text-xs text-muted-foreground text-center">
                  {current.questionType === "fill_blank"
                    ? "Udfyld det manglende ord"
                    : current.questionType === "conjugation"
                    ? "Skriv den korrekte bøjningsform"
                    : current.questionType === "noun_form"
                    ? "Skriv den korrekte form"
                    : `Skriv oversættelsen på ${direction.toLabel.toLowerCase()}`}
                </p>
                <form onSubmit={(e) => { e.preventDefault(); if (!showResult && typedAnswer.trim()) submitAnswer(typedAnswer); }} className="flex gap-2">
                  <Input ref={inputRef} value={typedAnswer} onChange={(e) => setTypedAnswer(e.target.value)}
                    disabled={showResult} placeholder="Dit svar…" className="flex-1" autoComplete="off" spellCheck={false} />
                  <Button type="submit" disabled={showResult || !typedAnswer.trim()} size="sm">Svar</Button>
                </form>
                {showResult && (
                  <div className={cn("rounded-lg px-3 py-2 text-sm", isCorrect ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
                    {isCorrect ? (
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Korrekt!</span>
                    ) : (
                      <div>
                        <span className="flex items-center gap-1.5"><XCircle className="h-4 w-4" /> Forkert</span>
                        <p className="mt-1 text-foreground">Rigtigt svar: <strong>{current.answer}</strong></p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              {!showResult ? (
                <Button variant="ghost" size="sm" onClick={() => submitAnswer("__skipped__")} className="text-muted-foreground">
                  <SkipForward className="h-4 w-4 mr-1" /> Spring over
                </Button>
              ) : (
                <div />
              )}
              {showResult && (
                <Button onClick={nextQuestion} size="sm">
                  {currentIdx + 1 >= total ? "Se resultat" : "Næste →"}
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
