import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Brain,
  CheckCircle2,
  XCircle,
  SkipForward,
  Keyboard,
  LayoutGrid,
  History,
  Gauge,
  PenLine,
  Timer,
  Shuffle,
  Dumbbell,
  Hash,
  Repeat,
  Type as TypeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout";
import { cn } from "@/lib/utils";
import { useLexicon } from "@/hooks/useLexicon";
import { useQuizSession } from "@/hooks/useQuizSession";
import { QuizResult } from "@/components/QuizResult";
import { fetchDistractors, GeminiKeyMissingError } from "@/lib/gemini";
import { toast } from "@/components/ui/sonner";
import { entryTypeLabel } from "@/lib/lexicon";
import { saveSession, loadBoxStates, pickDue, loadHistory, getMistakeEntryIds } from "@/lib/quizHistory";
import {
  buildQuestions, buildVerbDrillQuestions, DIRECTIONS, isValid, matchesAnswer, normalize,
  shuffle, splitAlternatives, type QuizMode, type Difficulty,
} from "@/lib/exercises/vocabulary";
import {
  EXERCISE_KINDS,
  isExerciseKind,
  isGeneratedEntryId,
  type ExerciseKind,
  type QuestionType,
  type QuizQuestion,
} from "@/lib/exercises/types";
import { buildNumberQuestions, NUMBER_TOPICS, type NumberTopic } from "@/lib/exercises/numbers";
import { buildArticlesExercise } from "@/lib/exercises/prepositions";
import { useVisibleLanguages } from "@/hooks/useVisibleLanguages";
import { t } from "@/i18n";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: "beginner", label: t("quiz.diffBeginner"), description: t("quiz.diffBeginnerDesc") },
  { value: "intermediate", label: t("quiz.diffIntermediate"), description: t("quiz.diffIntermediateDesc") },
  { value: "advanced", label: t("quiz.diffAdvanced"), description: t("quiz.diffAdvancedDesc") },
];

const EXERCISE_ICONS: Record<ExerciseKind, typeof Brain> = {
  vocabulary: Brain,
  verbs: Repeat,
  numbers: Hash,
  articles: TypeIcon,
};

const TIMER_SECONDS: Record<Difficulty, number> = {
  beginner: 30,
  intermediate: 20,
  advanced: 15,
};

const EXERCISE_STORAGE_KEY = "ordsamling-quiz-exercise";

function loadExercise(): ExerciseKind {
  try {
    const raw = localStorage.getItem(EXERCISE_STORAGE_KEY);
    return isExerciseKind(raw) ? raw : "vocabulary";
  } catch {
    return "vocabulary";
  }
}

function saveExercise(kind: ExerciseKind) {
  try {
    localStorage.setItem(EXERCISE_STORAGE_KEY, kind);
  } catch {
    /* storage unavailable — remembering the choice is best-effort */
  }
}

/* ------------------------------------------------------------------ */
/*  AI Distractors                                                     */
/* ------------------------------------------------------------------ */

let _aiKeyToastShown = false;

async function fetchSmartDistractors(
  question: QuizQuestion,
  difficulty: Difficulty,
  scoreRatio: number,
): Promise<{ distractors: string[]; aiActive: boolean }> {
  // Generated exercises (numbers, curated prepositions, articles) ship their own
  // distractors and must not be sent to the AI.
  const aiTypes = ["translate", "conjugation", "noun_form", "fill_blank"] as const;
  type AiQuestionType = (typeof aiTypes)[number];
  if (!(aiTypes as readonly string[]).includes(question.questionType)) {
    return { distractors: [], aiActive: false };
  }

  const trimmed = question.answer.trim();
  const lower = trimmed.toLowerCase();
  let answerPrefix: string | undefined;
  if (lower.startsWith("at ")) answerPrefix = "at";
  else if (lower.startsWith("to ")) answerPrefix = "to";

  try {
    const distractors = await fetchDistractors({
      correctAnswer: question.answer,
      questionType: question.questionType as AiQuestionType,

      entryType: question.entry.type,
      difficulty,
      scoreRatio,
      prompt: question.prompt,
      answerLang: question.direction.to,
      existingAnswers: question.options,
      answerPrefix,
    });
    const correctAlts = new Set(splitAlternatives(question.answer).map(normalize));
    const filtered = distractors.filter(
      (d) => isValid(d) && !correctAlts.has(normalize(d)) && normalize(d) !== normalize(question.answer),
    );
    return { distractors: filtered, aiActive: filtered.length > 0 };
  } catch (err) {
    if (err instanceof GeminiKeyMissingError) {
      if (!_aiKeyToastShown) {
        _aiKeyToastShown = true;
        toast("Add a Gemini API key in Settings to enable AI distractors");
      }
    }
    return { distractors: [], aiActive: false };
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Quiz = () => {
  const { allEntries } = useLexicon();
  const visibleLangs = useVisibleLanguages();
  const activeDirections = useMemo(
    () => DIRECTIONS.filter((d) => visibleLangs.includes(d.from) && visibleLangs.includes(d.to)),
    [visibleLangs],
  );

  const [exercise, setExercise] = useState<ExerciseKind>(() => loadExercise());
  const [numberTopics, setNumberTopics] = useState<NumberTopic[]>([...NUMBER_TOPICS]);
  const [mode, setMode] = useState<QuizMode>("mixed");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [questionCount, setQuestionCount] = useState(10);
  const [smartPractice, setSmartPractice] = useState(false);

  useEffect(() => {
    saveExercise(exercise);
  }, [exercise]);


  const {
    phase: state, setPhase: setState, questions, setQuestions, currentIdx, score, answered,
    typedAnswer, setTypedAnswer, showResult, timeLeft, answers: sessionAnswers,
    start, submitAnswer, finish, next,
  } = useQuizSession(matchesAnswer);
  const [aiActive, setAiActive] = useState(false);
  const [mistakeIds, setMistakeIds] = useState<Set<string>>(() => getMistakeEntryIds(loadHistory()));

  const inputRef = useRef<HTMLInputElement>(null);

  const current = questions[currentIdx] ?? null;
  const total = questions.length;
  const progress = total > 0 ? ((currentIdx + (showResult ? 1 : 0)) / total) * 100 : 0;
  const timerMax = TIMER_SECONDS[difficulty];
  const timerPct = timerMax > 0 ? (timeLeft / timerMax) * 100 : 100;

  const eligibleCount = useMemo(() => {
    return allEntries.filter((e) => isValid(e.danish) && isValid(e.english)).length;
  }, [allEntries]);

  const verbCount = useMemo(
    () => allEntries.filter((e) => e.type === "verb" && e.grammar && Object.keys(e.grammar).length > 0).length,
    [allEntries],
  );

  const articleCount = useMemo(
    () => allEntries.filter((e) => e.type === "noun" && (e.grammar?.article || e.grammar?.singularDefinite)).length,
    [allEntries],
  );

  /** Numbers and prepositions are generated, so they never depend on saved words. */
  const needsEntries = exercise === "vocabulary" || exercise === "verbs";
  const availableForExercise = exercise === "verbs" ? verbCount : eligibleCount;

  // Focus input for typing modes
  useEffect(() => {
    const dm = current?.displayMode ?? mode;
    if (state === "playing" && (dm === "type" || dm === "completion") && !showResult) {
      const timeout = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timeout);
    }
  }, [state, mode, showResult, currentIdx, current?.displayMode]);

  // Fetch AI distractors for current question (all difficulties + choice mode)
  useEffect(() => {
    const dm = current?.displayMode ?? mode;
    if (
      state !== "playing" ||
      (dm !== "choice") ||
      !current ||
      showResult
    )
      return;

    const scoreRatio = total > 0 ? score / Math.max(currentIdx, 1) : 0;
    let cancelled = false;

    fetchSmartDistractors(current, difficulty, scoreRatio).then(({ distractors, aiActive: active }) => {
      if (cancelled || distractors.length === 0) return;
      setAiActive(active);
      setQuestions((prev) => {
        const next = [...prev];
        const q = { ...next[currentIdx] };
        const kept = q.options.filter((o) => matchesAnswer(o, q.answer));
        const aiOptions = distractors.slice(0, 3);
        q.options = shuffle([...kept, ...aiOptions]).filter(isValid);
        if (!q.options.some((o) => matchesAnswer(o, q.answer))) {
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

  const startQuiz = useCallback((opts?: { restrictIds?: Set<string> }) => {
    let q: QuizQuestion[];

    if (exercise === "numbers") {
      q = buildNumberQuestions(numberTopics, questionCount);
    } else if (exercise === "articles") {
      q = buildArticlesExercise(allEntries, questionCount);
    } else {
      let pool = allEntries;
      if (exercise === "verbs") {
        pool = pool.filter((e) => e.type === "verb");
      }
      if (opts?.restrictIds && opts.restrictIds.size > 0) {
        pool = pool.filter((e) => opts.restrictIds!.has(e.id));
      } else if (exercise === "vocabulary" && smartPractice) {
        const dueIds = new Set(pickDue(loadBoxStates(), pool.map((e) => e.id)));
        const dueEntries = pool.filter((e) => dueIds.has(e.id));
        // Fall back to full pool if there isn't enough due material to build a quiz.
        if (dueEntries.length >= 4) pool = dueEntries;
      }
      const directions = activeDirections.length > 0 ? activeDirections : DIRECTIONS;
      q = exercise === "verbs"
        ? buildVerbDrillQuestions(pool, questionCount, mode, directions)
        : buildQuestions(pool, questionCount, difficulty, mode, directions);
    }

    if (q.length < 2) return;
    start(q, TIMER_SECONDS[difficulty]);
    setAiActive(false);
  }, [allEntries, questionCount, difficulty, mode, activeDirections, smartPractice, exercise, numberTopics, start]);


  const trainableMistakeIds = useMemo(
    () => new Set([...mistakeIds].filter((id) => allEntries.some((e) => e.id === id))),
    [mistakeIds, allEntries],
  );

  const finishQuiz = useCallback(async () => {
    try {
      await finish(snapshot => saveSession({
        id: snapshot.id,
        date: Date.now(),
        mode,
        exercise,
        fromLabel: t("quiz.dirMixed"),
        toLabel: t("quiz.dirMixed"),
        score: snapshot.score,
        total: snapshot.questions.length,
        answers: snapshot.answers,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this session. Please try again.");
    }
    setMistakeIds(getMistakeEntryIds(loadHistory()));
  }, [mode, exercise, finish]);


  const nextQuestion = useCallback(() => {
    if (currentIdx + 1 >= total) finishQuiz();
    else next(TIMER_SECONDS[difficulty]);
  }, [currentIdx, total, finishQuiz, difficulty, next]);

  const isCorrect = answered !== null && matchesAnswer(answered, current?.answer ?? "");
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

  /** Monospaced, letter-spaced prompt only suits masked/short forms — not full sentences. */
  const monoPrompt =
    current?.questionType === "fill_blank" ||
    currentDisplayMode === "completion";

  const questionTypeBadge = (qt: QuestionType) => {
    return t(`quiz.questionTypes.${qt}`);
  };


  /* ---- Setup screen ---- */
  if (state === "setup") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PageHeader
          backTo="/app"
          pageLabel={t("quiz.title")}
          actions={
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/progress?tab=sessions" aria-label={t("quiz.history")}>
                <History className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline" aria-hidden="true">{t("quiz.history")}</span>
              </Link>
            </Button>
          }
        />

        <main id="main" className="flex-1 max-w-md mx-auto w-full px-4 py-6 sm:py-8 space-y-8">
          {/* Exercise picker */}
          <section className="space-y-3">
            <h2 id="exercise-label" className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Dumbbell className="h-4 w-4" aria-hidden /> {t("quiz.exercise.title")}
            </h2>
            <div role="radiogroup" aria-labelledby="exercise-label" className="grid grid-cols-2 gap-2">
              {EXERCISE_KINDS.map((kind) => {
                const Icon = EXERCISE_ICONS[kind];
                const selected = exercise === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setExercise(kind)}
                    className={cn(
                      "flex flex-col items-start gap-1 px-3 py-3 rounded-lg border text-left transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card text-foreground border-border hover:border-primary/40",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="text-sm font-medium">{t(`quiz.exercise.${kind}`)}</span>
                    <span className={cn("text-xs", selected ? "text-primary-foreground" : "text-muted-foreground")}>
                      {t(`quiz.exercise.${kind}Desc`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {needsEntries && availableForExercise < 2 ? (
            <div className="text-center py-10 text-muted-foreground space-y-2">
              <Brain className="h-10 w-10 mx-auto opacity-30" aria-hidden />
              <p className="text-base">
                {exercise === "verbs" ? t("quiz.exercise.needVerbs") : t("quiz.minWordsNeeded")}
              </p>

              <Button variant="outline" asChild className="mt-4"><Link to="/app">{t("quiz.addWords")}</Link></Button>
            </div>
          ) : (
            <>
              {/* Difficulty — vocabulary only */}
              {exercise === "vocabulary" && (
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
                        aria-pressed={difficulty === d.value}
                        className={cn(
                          "px-3 py-3 rounded-lg border text-sm transition-colors text-left",
                          difficulty === d.value
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card text-foreground border-border hover:border-primary/40",
                        )}
                      >
                        <span className="font-medium">{d.label}</span>
                        <p className={cn("text-xs mt-0.5", difficulty === d.value ? "text-primary-foreground" : "text-muted-foreground")}>{d.description}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Mode — vocabulary and verbs */}
              {(exercise === "vocabulary" || exercise === "verbs") && (
                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-foreground">{t("quiz.mode")}</h2>
                  <div className={cn("grid gap-2", exercise === "verbs" ? "grid-cols-3" : "grid-cols-4")}>
                    <button type="button" onClick={() => setMode("mixed")} aria-pressed={mode === "mixed"}
                      className={cn("flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                        mode === "mixed" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                      <Shuffle className="h-4 w-4" />
                      <span className="text-xs">{t("quiz.modeMixed")}</span>
                    </button>
                    <button type="button" onClick={() => setMode("choice")} aria-pressed={mode === "choice"}
                      className={cn("flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                        mode === "choice" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                      <LayoutGrid className="h-4 w-4" />
                      <span className="text-xs">{t("quiz.modeChoice")}</span>
                    </button>
                    <button type="button" onClick={() => setMode("type")} aria-pressed={mode === "type"}
                      className={cn("flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                        mode === "type" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                      <Keyboard className="h-4 w-4" />
                      <span className="text-xs">{t("quiz.modeType")}</span>
                    </button>
                    {exercise === "vocabulary" && (
                      <button type="button" onClick={() => setMode("completion")} aria-pressed={mode === "completion"}
                        className={cn("flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                          mode === "completion" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                        <PenLine className="h-4 w-4" />
                        <span className="text-xs">{t("quiz.modeCompletion")}</span>
                      </button>
                    )}
                  </div>
                </section>
              )}

              {/* Number sub-topics */}
              {exercise === "numbers" && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-foreground mb-2">{t("quiz.numbers.topics")}</legend>
                  {NUMBER_TOPICS.map((topic) => {
                    const checked = numberTopics.includes(topic);
                    return (
                      <label key={topic} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setNumberTopics((prev) => {
                              const next = e.target.checked ? [...prev, topic] : prev.filter((p) => p !== topic);
                              return next.length > 0 ? next : prev;
                            })
                          }
                          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-foreground">{t(`quiz.numbers.${topic}`)}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">{t(`quiz.numbers.${topic}Desc`)}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              )}

              {/* Articles & prepositions info */}
              {exercise === "articles" && (
                <p className="text-xs text-muted-foreground">{t("quiz.articles.info", { count: articleCount })}</p>
              )}

              {/* Smart practice (spaced repetition) — vocabulary only */}
              {exercise === "vocabulary" && (
                <section className="space-y-2">
                  <label className="flex items-start gap-3 px-3 py-3 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={smartPractice}
                      onChange={(e) => setSmartPractice(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                      aria-describedby="smart-practice-desc"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{t("quiz.smartPractice")}</span>
                      <span id="smart-practice-desc" className="block text-xs text-muted-foreground mt-0.5">
                        {t("quiz.smartPracticeDesc")}
                      </span>
                    </span>
                  </label>
                </section>
              )}
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-foreground">{t("quiz.questionCount")}</h2>
                <div className="flex gap-2">
                  {[5, 10, 20, 50].map((n) => (
                    <button key={n} type="button" onClick={() => setQuestionCount(n)}
                      aria-pressed={questionCount === n}
                      className={cn("px-3 py-2 rounded-lg border text-sm transition-colors min-w-[3rem]",
                        questionCount === n ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40")}>
                      {n}
                    </button>
                  ))}
                </div>
                {needsEntries && (
                  <p className="text-xs text-muted-foreground">{t("quiz.questionsAvailable", { count: eligibleCount })}</p>
                )}
              </section>

              <div className="space-y-2">
                <Button onClick={() => startQuiz()} disabled={needsEntries && availableForExercise < 2} className="w-full h-11 text-base">
                  {t("quiz.startQuiz")}
                </Button>
                {exercise === "vocabulary" && (
                  <Button
                    variant="outline"
                    onClick={() => startQuiz({ restrictIds: trainableMistakeIds })}
                    disabled={trainableMistakeIds.size < 2}
                    className="w-full h-11 text-base"
                    title={trainableMistakeIds.size < 2 ? t("quiz.trainMistakesNone") : undefined}
                  >
                    {t("quiz.trainMistakes", { count: trainableMistakeIds.size })}
                  </Button>
                )}
              </div>
            </>
          )}

        </main>
      </div>
    );
  }

  /* ---- Result screen ---- */
  if (state === "result") {
    return <QuizResult score={score} total={total} answers={sessionAnswers}
      onSetup={() => setState("setup")} onRestart={() => startQuiz()}
      onTrain={ids => startQuiz({ restrictIds: ids })} />;
  }

  /* ---- Playing screen ---- */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageHeader
        srHeading={t("quiz.title")}
        actions={
          <>
            {aiActive && (
              <span className="text-[9px] uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold">
                {t("settings.aiActive")}
              </span>
            )}
            <span className="text-sm font-medium text-foreground tabular-nums">{currentIdx + 1} / {total}</span>
            <div className={cn(
              "flex items-center gap-1 text-sm font-mono tabular-nums transition-colors ml-2",
              timeLeft <= 5 && !showResult ? "text-destructive animate-pulse" : "text-muted-foreground",
            )}>
              <Timer className="h-4 w-4" />
              <span>{timeLeft}s</span>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums ml-2">{t("quiz.correctCount", { count: score })}</span>
          </>
        }
        subRow={
          <div className="space-y-2">
            <div className="flex items-center">
              <span className={cn(
                "text-[10px] uppercase px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground",
              )}>
                {current?.direction.fromLabel} → {current?.direction.toLabel}
              </span>
            </div>
            <Progress value={progress} className="h-1.5" />
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
        }
      />

      <main id="main" className="flex-1 flex items-center justify-center px-4 py-8">
        {current && (
          <div className="max-w-md w-full space-y-8">
            {/* Question prompt */}
            <div className="text-center space-y-2">
              {current.hint ? (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{questionTypeBadge(current.questionType)}</p>
                  <p className="text-sm text-muted-foreground">{current.hint}</p>
                  <p className={cn("font-bold text-foreground", monoPrompt ? "text-2xl sm:text-3xl font-mono tracking-[0.25em]" : "text-xl sm:text-2xl leading-snug")}>{current.prompt}</p>
                </>
              ) : currentDisplayMode === "completion" && current.masked ? (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("quiz.fillWord")}</p>
                  <p className="text-sm text-muted-foreground">{current.prompt} ({current.direction.fromLabel})</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground font-mono tracking-[0.25em]">{current.masked}</p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{current.direction.fromLabel}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">{current.prompt}</p>
                  {isValid(current.entry.notes) ? (
                    <p className="text-xs text-muted-foreground italic">{t("quiz.context")}: {current.entry.notes}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">({entryTypeLabel(current.entry.type)})</p>
                  )}
                </>
              )}
              {!isGeneratedEntryId(current.entry.id) && (
                <span className={cn("inline-block text-[10px] font-medium uppercase px-2 py-0.5 rounded-full", "bg-muted text-muted-foreground")}>
                  {entryTypeLabel(current.entry.type)}
                </span>
              )}
            </div>


            {/* Answer area */}
            {effectiveMode === "choice" ? (
              <div className="grid grid-cols-1 gap-2.5">
                {current.options.filter(isValid).map((opt, i) => {
                  const isThis = answered === opt;
                  const isRight = matchesAnswer(opt, current.answer);
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
                    aria-label={t("quiz.yourAnswerPlaceholder")}
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
                        {splitAlternatives(current.answer).length > 1 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("quiz.acceptedAlternatives")}: {splitAlternatives(current.answer).join(" · ")}
                          </p>
                        )}
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

            {/* Curated explanation (prepositions) */}
            {showResult && current.note && (
              <p className="text-xs text-muted-foreground text-center">{current.note}</p>
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
