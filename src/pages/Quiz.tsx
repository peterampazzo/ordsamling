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
  PenLine,
  Timer,
  Shuffle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLexicon, isLocalStorageMode } from "@/hooks/useLexicon";
import type { LexisEntry } from "@/hooks/useLexicon";
import { entryTypeLabel, type EntryGrammar } from "@/lib/lexicon";
import { saveSession, type QuizAnswerRecord } from "@/lib/quizHistory";
import { t } from "@/i18n";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type QuizMode = "choice" | "type" | "completion" | "mixed";
type Difficulty = "beginner" | "intermediate" | "advanced";

type LangDirection = {
  from: "danish" | "english";
  to: "danish" | "english";
  fromLabel: string;
  toLabel: string;
};

const DIRECTIONS: LangDirection[] = [
  { from: "danish", to: "english", fromLabel: t("directions.danish"), toLabel: t("directions.english") },
  { from: "english", to: "danish", fromLabel: t("directions.english"), toLabel: t("directions.danish") },
];

const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: "beginner", label: t("quiz.diffBeginner"), description: t("quiz.diffBeginnerDesc") },
  { value: "intermediate", label: t("quiz.diffIntermediate"), description: t("quiz.diffIntermediateDesc") },
  { value: "advanced", label: t("quiz.diffAdvanced"), description: t("quiz.diffAdvancedDesc") },
];

const TIMER_SECONDS: Record<Difficulty, number> = {
  beginner: 30,
  intermediate: 20,
  advanced: 15,
};

type QuestionType = "translate" | "conjugation" | "noun_form" | "fill_blank";

interface QuizQuestion {
  entry: LexisEntry;
  prompt: string;
  answer: string;
  options: string[];
  questionType: QuestionType;
  hint?: string;
  direction: LangDirection;
  /** For completion mode: the masked version */
  masked?: string;
  /** For mixed mode: which display mode this question uses */
  displayMode?: "choice" | "type" | "completion";
}

type QuizState = "setup" | "playing" | "result";

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/** Reject empty, placeholder, or junk strings */
function isValid(s: string | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t || t === "-" || t === "–" || t === "—" || t === "..." || t === "?") return false;
  return true;
}

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

/** Split an answer like "imagine/invent" or "to imagine / to invent" into alternatives. */
function splitAlternatives(s: string): string[] {
  return s
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Check if a given answer matches the correct answer, accepting any slash-separated alternative. */
function matchesAnswer(given: string, correct: string): boolean {
  const g = normalize(given);
  const alts = splitAlternatives(correct).map(normalize);
  if (alts.includes(g)) return true;
  // Also accept the full string as-is
  return normalize(correct) === g;
}

/** Pick the primary form of a multi-alternative answer (first slash segment). */
function primaryForm(s: string): string {
  const alts = splitAlternatives(s);
  return alts[0] ?? s;
}

/** Create a word completion mask: show first, last, and ~40% of chars */
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

function getGrammarValue(entry: LexisEntry, key: keyof EntryGrammar): string | undefined {
  const v = entry.grammar?.[key]?.trim();
  return isValid(v) ? v : undefined;
}

/* ------------------------------------------------------------------ */
/*  Question builders                                                  */
/* ------------------------------------------------------------------ */

function buildConjugationQuestions(entries: LexisEntry[], dir: LangDirection): QuizQuestion[] {
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
          direction: dir,
        });
      }
    }
  }
  return questions;
}

function buildNounFormQuestions(entries: LexisEntry[], dir: LangDirection): QuizQuestion[] {
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
          direction: dir,
        });
      }
    }
  }
  return questions;
}

function buildFillBlankQuestions(entries: LexisEntry[], dir: LangDirection): QuizQuestion[] {
  const eligible = entries.filter((e) => isValid(e[dir.to]) && e[dir.to].trim().length >= 3);
  return eligible.map((entry) => {
    const fullAnswer = entry[dir.to];
    const primary = primaryForm(fullAnswer);
    return {
      entry,
      prompt: makeBlank(primary),
      answer: primary, // accept only the primary form in completion mode
      options: [],
      questionType: "fill_blank" as QuestionType,
      hint: `Udfyld: ${entry[dir.from]}`,
      direction: dir,
      masked: makeBlank(primary),
    };
  });
}

/** Build a pool of questions with true bilingual alternation */
function buildQuestions(
  entries: LexisEntry[],
  count: number,
  difficulty: Difficulty,
  mode: QuizMode,
): QuizQuestion[] {
  let pool: QuizQuestion[] = [];

  // Build questions in BOTH directions for true bilingual mix
  for (const dir of DIRECTIONS) {
    const eligible = entries.filter((e) => isValid(e[dir.from]) && isValid(e[dir.to]));
    if (eligible.length < 2) continue;

    // Translation questions
    const translateQs: QuizQuestion[] = eligible.map((entry) => ({
      entry,
      prompt: entry[dir.from],
      answer: entry[dir.to],
      options: [],
      questionType: "translate" as QuestionType,
      direction: dir,
    }));
    pool.push(...translateQs);

    // Intermediate+: grammar questions (more weight)
    if (difficulty !== "beginner") {
      const conjQs = buildConjugationQuestions(entries, dir);
      const nounQs = buildNounFormQuestions(entries, dir);
      // Double grammar questions for emphasis
      pool.push(...conjQs, ...conjQs, ...nounQs, ...nounQs);
    }

    // Advanced: fill-in-the-blank / completion
    if (difficulty === "advanced") {
      pool.push(...buildFillBlankQuestions(entries, dir));
    }
  }

  // Shuffle and pick, ensuring alternating directions
  const shuffled = shuffle(pool);
  const picked: QuizQuestion[] = [];
  let lastDir: string | null = null;

  // First pass: try alternating directions
  const remaining = [...shuffled];
  while (picked.length < count && remaining.length > 0) {
    const idx = remaining.findIndex(
      (q) => lastDir === null || `${q.direction.from}-${q.direction.to}` !== lastDir,
    );
    const pickIdx = idx >= 0 ? idx : 0;
    const q = remaining.splice(pickIdx, 1)[0];
    picked.push(q);
    lastDir = `${q.direction.from}-${q.direction.to}`;
  }

  // Assign display modes for mixed mode
  const MIXED_CYCLE: ("choice" | "type" | "completion")[] = ["choice", "type", "completion"];
  if (mode === "mixed") {
    for (let i = 0; i < picked.length; i++) {
      picked[i].displayMode = MIXED_CYCLE[i % MIXED_CYCLE.length];
    }
  }

  // For completion mode (or mixed questions that are completion), add masked versions
  for (const q of picked) {
    const isCompletion = mode === "completion" || q.displayMode === "completion";
    if (isCompletion && !q.masked) {
      q.masked = makeBlank(q.answer);
    }
  }

  // Generate local MC options for choice-mode questions (or mixed questions that are choice)
  for (const q of picked) {
    const isChoice = mode === "choice" || q.displayMode === "choice";
    if (!isChoice) continue;
    const dir = q.direction;
    const answerPool =
      q.questionType === "translate"
        ? entries.map((e) => e[dir.to]).filter(isValid)
        : entries
            .flatMap((e) => (e.grammar ? Object.values(e.grammar).filter(isValid) : []))
            .filter((v): v is string => typeof v === "string");

    const unique = [...new Set(answerPool.map((a) => a.trim()))];
    const correctAlts = new Set(splitAlternatives(q.answer).map(normalize));
    const wrong = shuffle(unique.filter((a) => !correctAlts.has(normalize(a)) && normalize(a) !== normalize(q.answer))).slice(0, 3);
    q.options = shuffle([q.answer, ...wrong]).filter(isValid);
  }

  return picked;
}

/* ------------------------------------------------------------------ */
/*  AI Distractors                                                     */
/* ------------------------------------------------------------------ */

async function fetchSmartDistractors(
  question: QuizQuestion,
  difficulty: Difficulty,
  scoreRatio: number,
): Promise<string[]> {
  if (isLocalStorageMode()) {
    return [];
  }

  try {
    const res = await fetch("/api/quiz/distractors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        correctAnswer: question.answer,
        questionType: question.questionType,
        entryType: question.entry.type,
        difficulty,
        scoreRatio,
        prompt: question.prompt,
        answerLang: question.direction.to,
        existingAnswers: question.options,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { distractors: string[] };
    return (data.distractors || []).filter(
      (d) => isValid(d) && normalize(d) !== normalize(question.answer),
    );
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Quiz = () => {
  const { allEntries } = useLexicon();

  const [mode, setMode] = useState<QuizMode>("mixed");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [questionCount, setQuestionCount] = useState(10);

  const [state, setState] = useState<QuizState>("setup");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  const answersRef = useRef<QuizAnswerRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = questions[currentIdx] ?? null;
  const total = questions.length;
  const progress = total > 0 ? ((currentIdx + (showResult ? 1 : 0)) / total) * 100 : 0;
  const timerMax = TIMER_SECONDS[difficulty];
  const timerPct = timerMax > 0 ? (timeLeft / timerMax) * 100 : 100;

  const eligibleCount = useMemo(() => {
    return allEntries.filter((e) => isValid(e.danish) && isValid(e.english)).length;
  }, [allEntries]);

  // Timer effect
  useEffect(() => {
    if (!timerActive || showResult) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setTimerActive(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive, showResult]);

  // Auto-submit on timer expiry
  useEffect(() => {
    if (timeLeft === 0 && timerActive === false && state === "playing" && !showResult && answered === null && current) {
      submitAnswer("__timeout__");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, timerActive]);

  // Focus input for typing modes
  useEffect(() => {
    const dm = current?.displayMode ?? mode;
    if (state === "playing" && (dm === "type" || dm === "completion") && !showResult) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state, mode, showResult, currentIdx, current?.displayMode]);

  // Fetch AI distractors for current question (advanced/intermediate + choice mode)
  useEffect(() => {
    const dm = current?.displayMode ?? mode;
    if (
      state !== "playing" ||
      (dm !== "choice") ||
      difficulty === "beginner" ||
      !current ||
      showResult
    )
      return;

    const scoreRatio = total > 0 ? score / Math.max(currentIdx, 1) : 0;
    let cancelled = false;

    fetchSmartDistractors(current, difficulty, scoreRatio).then((distractors) => {
      if (cancelled || distractors.length === 0) return;
      setQuestions((prev) => {
        const next = [...prev];
        const q = { ...next[currentIdx] };
        // Replace random distractors with AI ones
        const kept = q.options.filter((o) => normalize(o) === normalize(q.answer));
        const aiOptions = distractors.slice(0, 3);
        q.options = shuffle([...kept, ...aiOptions]).filter(isValid);
        // Ensure correct answer is always present
        if (!q.options.some((o) => normalize(o) === normalize(q.answer))) {
          q.options[0] = q.answer;
          q.options = shuffle(q.options);
        }
        next[currentIdx] = q;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, state]);

  const startQuiz = useCallback(() => {
    const q = buildQuestions(allEntries, questionCount, difficulty, mode);
    if (q.length < 2) return;
    setQuestions(q);
    setCurrentIdx(0);
    setScore(0);
    setAnswered(null);
    setTypedAnswer("");
    setShowResult(false);
    answersRef.current = [];
    setTimeLeft(TIMER_SECONDS[difficulty]);
    setTimerActive(true);
    setState("playing");
  }, [allEntries, questionCount, difficulty, mode]);

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!current || showResult) return;
      const skipped = answer === "__skipped__";
      const timedOut = answer === "__timeout__";
      const correct = !skipped && !timedOut && normalize(answer) === normalize(current.answer);
      setAnswered(answer);
      setShowResult(true);
      setTimerActive(false);
      if (correct) setScore((s) => s + 1);
      answersRef.current.push({
        prompt: current.hint || current.prompt,
        correctAnswer: current.answer,
        givenAnswer: skipped || timedOut ? "" : answer,
        correct,
        skipped: skipped || timedOut,
        fromLang: current.direction.from,
        toLang: current.direction.to,
        entryId: current.entry.id,
      });
    },
    [current, showResult],
  );

  const finishQuiz = useCallback(async () => {
    try {
      await saveSession({
        id: crypto.randomUUID(),
        date: Date.now(),
        mode,
        fromLabel: t("quiz.dirMixed"),
        toLabel: t("quiz.dirMixed"),
        score,
        total,
        answers: answersRef.current,
      });
    } catch (error) {
      console.error("Failed to save quiz history:", error);
    }
    setState("result");
  }, [mode, score, total]);

  const nextQuestion = useCallback(() => {
    if (currentIdx + 1 >= total) finishQuiz();
    else {
      setCurrentIdx((i) => i + 1);
      setAnswered(null);
      setTypedAnswer("");
      setShowResult(false);
      setTimeLeft(TIMER_SECONDS[difficulty]);
      setTimerActive(true);
    }
  }, [currentIdx, total, finishQuiz, difficulty]);

  const isCorrect = answered !== null && normalize(answered) === normalize(current?.answer ?? "");
  const isTimedOut = answered === "__timeout__";

  // Determine effective input mode for current question
  const currentDisplayMode: QuizMode = current?.displayMode ?? mode;
  const effectiveMode: "choice" | "type" = (() => {
    if (currentDisplayMode === "completion") return "type";
    if (currentDisplayMode === "type") return "type";
    // choice mode but not enough options
    if (current && current.options.filter(isValid).length < 2) return "type";
    return "choice";
  })();

  const questionTypeBadge = (qt: QuestionType) => {
    return t(`quiz.questionTypes.${qt}`);
  };

  /* ---- Setup screen ---- */
  if (state === "setup") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="shrink-0" asChild>
                <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
              </Button>
              <Brain className="h-5 w-5 text-primary" />
              <h1 className="text-base sm:text-lg font-semibold text-foreground">{t("quiz.title")}</h1>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/quiz/history">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">{t("quiz.history")}</span>
              </Link>
            </Button>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 py-8 space-y-8">
          {allEntries.length < 4 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Brain className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-base">{t("quiz.minWordsNeeded")}</p>
              <Button variant="outline" asChild className="mt-4"><Link to="/">{t("quiz.addWords")}</Link></Button>
            </div>
          ) : (
            <>
              {/* Difficulty */}
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Gauge className="h-4 w-4" /> {t("quiz.difficulty")}
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

              {/* Mode */}
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-foreground">{t("quiz.mode")}</h2>
                <div className="grid grid-cols-4 gap-2">
                  <button type="button" onClick={() => setMode("mixed")}
                    className={cn("flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                      mode === "mixed" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                    <Shuffle className="h-4 w-4" />
                    <span className="text-xs">{t("quiz.modeMixed")}</span>
                  </button>
                  <button type="button" onClick={() => setMode("choice")}
                    className={cn("flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                      mode === "choice" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                    <LayoutGrid className="h-4 w-4" />
                    <span className="text-xs">{t("quiz.modeChoice")}</span>
                  </button>
                  <button type="button" onClick={() => setMode("type")}
                    className={cn("flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                      mode === "type" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                    <Keyboard className="h-4 w-4" />
                    <span className="text-xs">{t("quiz.modeType")}</span>
                  </button>
                  <button type="button" onClick={() => setMode("completion")}
                    className={cn("flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                      mode === "completion" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                    <PenLine className="h-4 w-4" />
                    <span className="text-xs">{t("quiz.modeCompletion")}</span>
                  </button>
                </div>
              </section>

              {/* Count */}
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-foreground">{t("quiz.questionCount")}</h2>
                <div className="flex gap-2">
                  {[5, 10, 20, 50].map((n) => (
                    <button key={n} type="button" onClick={() => setQuestionCount(n)}
                      className={cn("px-3 py-2 rounded-lg border text-sm transition-colors min-w-[3rem]",
                        questionCount === n ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("quiz.questionsAvailable", { count: eligibleCount })}</p>
              </section>

              <Button onClick={startQuiz} disabled={eligibleCount < 2} className="w-full h-11 text-base">
                {t("quiz.startQuiz")}
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
        <header className="sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 flex items-center gap-3 py-3">
            <Brain className="h-5 w-5 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold text-foreground">{t("quiz.result")}</h1>
          </div>
        </header>

        <main className="flex-1 px-4 py-8">
          <div className="max-w-md mx-auto space-y-8">
            <div className="text-center space-y-3">
              <div className={cn("text-6xl font-bold", pct >= 80 ? "text-primary" : pct >= 50 ? "text-accent-foreground" : "text-destructive")}>{pct}%</div>
              <p className="text-lg text-foreground">{t("quiz.scoreOf", { score, total })}</p>
              <p className="text-sm text-muted-foreground">
                {pct >= 90 ? t("quiz.feedback90") : pct >= 70 ? t("quiz.feedback70") : pct >= 50 ? t("quiz.feedback50") : t("quiz.feedbackLow")}
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-medium text-foreground">{t("quiz.yourAnswers")}</h2>
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {sessionAnswers.map((a, i) => (
                  <div key={i} className={cn("px-3 py-2.5 text-sm flex items-start gap-2", a.correct ? "bg-card" : "bg-destructive/5")}>
                    {a.skipped ? <SkipForward className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> : a.correct ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{a.prompt}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className={cn("font-medium", a.correct ? "text-primary" : "text-destructive")}>{a.skipped ? "—" : a.givenAnswer}</span>
                      {!a.correct && !a.skipped && <p className="text-xs text-muted-foreground mt-0.5">{t("quiz.correctAnswer")}: <span className="text-foreground">{a.correctAnswer}</span></p>}
                      {a.skipped && <p className="text-xs text-muted-foreground mt-0.5">{t("common.answer")}: <span className="text-foreground">{a.correctAnswer}</span></p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => setState("setup")}><ArrowLeft className="h-4 w-4 mr-1" /> {t("common.settings")}</Button>
              <Button onClick={startQuiz}><RotateCcw className="h-4 w-4 mr-1" /> {t("quiz.tryAgain")}</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ---- Playing screen ---- */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">{currentIdx + 1} / {total}</span>
              <span className={cn(
                "text-[10px] uppercase px-1.5 py-0.5 rounded font-medium",
                "bg-muted text-muted-foreground",
              )}>
                {current?.direction.fromLabel} → {current?.direction.toLabel}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Timer */}
              <div className={cn(
                "flex items-center gap-1 text-sm font-mono tabular-nums transition-colors",
                timeLeft <= 5 && !showResult ? "text-destructive animate-pulse" : "text-muted-foreground",
              )}>
                <Timer className="h-4 w-4" />
                <span>{timeLeft}s</span>
              </div>
              <span className="text-sm text-muted-foreground tabular-nums">{t("quiz.correctCount", { count: score })}</span>
            </div>
          </div>
          <Progress value={progress} className="h-1.5" />
          {/* Timer bar */}
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-linear",
                timerPct > 33 ? "bg-primary" : timerPct > 15 ? "bg-[hsl(var(--warning))]" : "bg-destructive",
              )}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        {current && (
          <div className="max-w-md w-full space-y-8">
            {/* Question prompt */}
            <div className="text-center space-y-2">
              {current.hint ? (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{questionTypeBadge(current.questionType)}</p>
                  <p className="text-sm text-muted-foreground">{current.hint}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground font-mono tracking-wide">{current.prompt}</p>
                </>
              ) : currentDisplayMode === "completion" && current.masked ? (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("quiz.fillWord")}</p>
                  <p className="text-sm text-muted-foreground">{current.prompt} ({current.direction.fromLabel})</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground font-mono tracking-widest">{current.masked}</p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{current.direction.fromLabel}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">{current.prompt}</p>
                </>
              )}
              <span className={cn("inline-block text-[10px] font-medium uppercase px-2 py-0.5 rounded-full", "bg-muted text-muted-foreground")}>
                {entryTypeLabel(current.entry.type)}
              </span>
            </div>

            {/* Answer area */}
            {effectiveMode === "choice" ? (
              <div className="grid grid-cols-1 gap-2.5">
                {current.options.filter(isValid).map((opt, i) => {
                  const isThis = answered === opt;
                  const isRight = normalize(opt) === normalize(current.answer);
                  let cls = "bg-card text-foreground border-border hover:border-primary/40";
                  if (showResult) {
                    if (isRight) cls = "bg-primary/10 text-primary border-primary ring-1 ring-primary/30";
                    else if (isThis && !isRight) cls = "bg-destructive/10 text-destructive border-destructive";
                    else cls = "bg-muted/50 text-muted-foreground border-border opacity-60";
                  }
                  return (
                    <button key={`${opt}-${i}`} type="button" disabled={showResult} onClick={() => submitAnswer(opt)}
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
                  {currentDisplayMode === "completion"
                    ? t("quiz.writeFullWord")
                    : current.questionType === "conjugation"
                    ? t("quiz.writeConjugation")
                    : current.questionType === "noun_form"
                    ? t("quiz.writeNounForm")
                    : t("quiz.writeTranslation", { lang: current.direction.toLabel.toLowerCase() })}
                </p>
                <form onSubmit={(e) => { e.preventDefault(); if (!showResult && typedAnswer.trim()) submitAnswer(typedAnswer); }} className="flex gap-2">
                  <Input ref={inputRef} value={typedAnswer} onChange={(e) => setTypedAnswer(e.target.value)}
                    disabled={showResult} placeholder={t("quiz.yourAnswerPlaceholder")} className="flex-1" autoComplete="off" spellCheck={false} />
                  <Button type="submit" disabled={showResult || !typedAnswer.trim()} size="sm">{t("common.answer")}</Button>
                </form>
                {showResult && (
                  <div className={cn("rounded-lg px-3 py-2.5 text-sm space-y-1", isCorrect ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
                    {isTimedOut ? (
                      <div>
                        <span className="flex items-center gap-1.5"><Timer className="h-4 w-4" /> {t("quiz.timerExpired")}</span>
                        <p className="mt-1 text-foreground">{t("quiz.correctAnswer")}: <strong>{current.answer}</strong></p>
                      </div>
                    ) : isCorrect ? (
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> {t("common.correct")}</span>
                    ) : (
                      <div>
                        <span className="flex items-center gap-1.5"><XCircle className="h-4 w-4" /> {t("common.incorrect")}</span>
                        <p className="mt-1 text-foreground">{t("quiz.correctAnswer")}: <strong>{current.answer}</strong></p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Timeout feedback for choice mode */}
            {effectiveMode === "choice" && showResult && isTimedOut && (
              <div className="rounded-lg px-3 py-2.5 text-sm bg-destructive/10 text-destructive space-y-1">
                <span className="flex items-center gap-1.5"><Timer className="h-4 w-4" /> {t("quiz.timerExpired")}</span>
                <p className="text-foreground">{t("quiz.correctAnswer")}: <strong>{current.answer}</strong></p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center pt-2">
              {!showResult ? (
                <Button variant="ghost" size="sm" onClick={() => submitAnswer("__skipped__")} className="text-muted-foreground">
                  <SkipForward className="h-4 w-4 mr-1" /> {t("common.skip")}
                </Button>
              ) : (
                <div />
              )}
              {showResult && (
                <Button onClick={nextQuestion} size="sm">
                  {currentIdx + 1 >= total ? t("quiz.seeResult") : t("common.next")}
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
