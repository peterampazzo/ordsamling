import React from 'react';
import { ProcessingSteps, type ProcessingStep } from '@/components/ProcessingSteps';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { t } from '@/i18n';

interface ProcessingIndicatorProps {
  progress: { completed: number; total: number };
  onCancel: () => void;
}

/**
 * ProcessingIndicator displays progress during AI processing (direct mode only).
 * Uses the existing ProcessingSteps component for visual progress indication.
 */
export function ProcessingIndicator({
  progress,
  onCancel,
}: ProcessingIndicatorProps) {
  const { completed, total } = progress;
  
  // Calculate processing state
  const isReadingPhase = completed === 0;
  const isAiPhase = completed > 0 && completed < total;
  const isDone = completed >= total && total > 0;
  
  // Build steps for ProcessingSteps component
  const steps: ProcessingStep[] = [
    {
      id: 'read',
      label: t('bulkImport.stepReadFile'),
      state: isReadingPhase ? 'active' : 'complete',
    },
    {
      id: 'ai',
      label: t('bulkImport.stepAi'),
      sub: isAiPhase
        ? (total > 2
            ? t('bulkImport.stepAiSub', { current: completed, total: total - 1 })
            : t('bulkImport.stepAiSubSingle'))
        : undefined,
      state: isReadingPhase ? 'pending' : isDone ? 'complete' : 'active',
    },
    {
      id: 'done',
      label: t('bulkImport.stepDone'),
      state: isDone ? 'complete' : 'pending',
    },
  ];
  
  // Calculate progress percentage
  const progressPercentage = Math.round((completed / Math.max(total, 1)) * 100);
  
  return (
    <Card className="mt-4">
      <CardContent className="p-4 sm:p-5">
        <div role="status" aria-live="polite">
          <ProcessingSteps steps={steps} />
          
          {/* Progress bar */}
          <div className="mt-4 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
              role="progressbar"
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('bulkImport.processingProgress', { completed, total })}
            />
          </div>
          
          {/* Progress text and cancel button */}
          <div className="mt-3 flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {t('bulkImport.processingCount', { completed, total })}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              aria-label={t('bulkImport.cancelProcessing')}
            >
              {t('bulkImport.cancel')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
