import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessingIndicator } from './ProcessingIndicator';

// Mock the i18n module
vi.mock('@/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      'bulkImport.stepReadFile': 'Read file',
      'bulkImport.stepAi': 'Send to AI',
      'bulkImport.stepAiSub': 'Chunk {current} of {total}',
      'bulkImport.stepAiSubSingle': 'Calling AI…',
      'bulkImport.stepDone': 'Done',
      'bulkImport.processingProgress': 'Processing {completed} of {total}',
      'bulkImport.processingCount': '{completed} of {total} processed',
      'bulkImport.cancelProcessing': 'Cancel processing',
      'bulkImport.cancel': 'Cancel',
    };
    
    let result = translations[key] || key;
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, String(v));
      });
    }
    
    return result;
  },
}));

describe('ProcessingIndicator', () => {
  it('renders with initial progress (reading phase)', () => {
    const onCancel = vi.fn();
    render(
      <ProcessingIndicator
        progress={{ completed: 0, total: 5 }}
        onCancel={onCancel}
      />
    );

    // Check that the component renders
    expect(screen.getByRole('status')).toBeInTheDocument();
    
    // Check progress text
    expect(screen.getByText('0 of 5 processed')).toBeInTheDocument();
    
    // Check cancel button
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders with AI processing phase', () => {
    const onCancel = vi.fn();
    render(
      <ProcessingIndicator
        progress={{ completed: 2, total: 5 }}
        onCancel={onCancel}
      />
    );

    // Check progress text
    expect(screen.getByText('2 of 5 processed')).toBeInTheDocument();
    
    // Check progress bar
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '40'); // 2/5 = 40%
  });

  it('renders with completed progress', () => {
    const onCancel = vi.fn();
    render(
      <ProcessingIndicator
        progress={{ completed: 5, total: 5 }}
        onCancel={onCancel}
      />
    );

    // Check progress text
    expect(screen.getByText('5 of 5 processed')).toBeInTheDocument();
    
    // Check progress bar is at 100%
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    
    render(
      <ProcessingIndicator
        progress={{ completed: 2, total: 5 }}
        onCancel={onCancel}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('displays correct progress percentage', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ProcessingIndicator
        progress={{ completed: 1, total: 4 }}
        onCancel={onCancel}
      />
    );

    let progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '25'); // 1/4 = 25%

    // Update progress
    rerender(
      <ProcessingIndicator
        progress={{ completed: 3, total: 4 }}
        onCancel={onCancel}
      />
    );

    progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '75'); // 3/4 = 75%
  });

  it('handles edge case with zero total', () => {
    const onCancel = vi.fn();
    render(
      <ProcessingIndicator
        progress={{ completed: 0, total: 0 }}
        onCancel={onCancel}
      />
    );

    // Should not crash and should show 0%
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
  });

  it('has proper accessibility attributes', () => {
    const onCancel = vi.fn();
    render(
      <ProcessingIndicator
        progress={{ completed: 2, total: 5 }}
        onCancel={onCancel}
      />
    );

    // Check status region
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');

    // Check progress bar attributes
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    expect(progressBar).toHaveAttribute('aria-label', 'Processing 2 of 5');

    // Check cancel button has aria-label
    const cancelButton = screen.getByRole('button');
    expect(cancelButton).toHaveAttribute('aria-label', 'Cancel processing');
  });
});
