import { ArrowLeft, Brain, CheckCircle2, RotateCcw, SkipForward, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { PageHeader } from './layout';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { isGeneratedEntryId } from '@/lib/exercises/types';
import type { QuizAnswerRecord } from '@/lib/quizHistory';

interface Props {
  score: number;
  total: number;
  answers: QuizAnswerRecord[];
  onSetup: () => void;
  onRestart: () => void;
  onTrain: (ids: Set<string>) => void;
}

export function QuizResult({ score, total, answers, onSetup, onRestart, onTrain }: Props) {
  const pct = total ? Math.round(score / total * 100) : 0;
  const wrongIds = new Set(answers.filter(answer =>
    !answer.correct && !answer.skipped && answer.entryId && !isGeneratedEntryId(answer.entryId)).map(answer => answer.entryId));
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageHeader pageLabel={t("quiz.result")} onBack={onSetup} />
      <main id="main" className="flex-1 px-4 py-6 sm:py-8">
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
              {answers.map((answer, index) => (
                <div key={index} className={cn("px-3 py-2.5 text-sm flex items-start gap-2", answer.correct ? "bg-card" : "bg-destructive/5")}>
                  {answer.skipped ? <SkipForward className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> :
                    answer.correct ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> :
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{answer.prompt}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className={cn("font-medium", answer.correct ? "text-primary" : "text-destructive")}>{answer.skipped ? "—" : answer.givenAnswer}</span>
                    {!answer.correct && <p className="text-xs text-muted-foreground mt-0.5">
                      {t(answer.skipped ? "common.answer" : "quiz.correctAnswer")}: <span className="text-foreground">{answer.correctAnswer}</span>
                    </p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Button variant="outline" onClick={onSetup}><ArrowLeft className="h-4 w-4 mr-1" />{t("common.settings")}</Button>
            <Button onClick={onRestart}><RotateCcw className="h-4 w-4 mr-1" />{t("quiz.tryAgain")}</Button>
            {wrongIds.size >= 2 && <Button variant="secondary" onClick={() => onTrain(wrongIds)}>
              <Brain className="h-4 w-4 mr-1" />{t("quiz.trainMistakes", { count: wrongIds.size })}
            </Button>}
          </div>
        </div>
      </main>
    </div>
  );
}
