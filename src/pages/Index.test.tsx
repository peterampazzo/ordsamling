import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/hooks/useLexicon', () => ({
  useLexicon: vi.fn(),
}));

vi.mock('@/hooks/useGoogleSheets', () => ({
  useGoogleSheets: vi.fn(),
}));

vi.mock('@/lib/quizHistory', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    registerPushQuizSession: vi.fn(),
    registerPushStreakEvent: vi.fn(),
    unregisterPushQuizSession: vi.fn(),
    unregisterPushStreakEvent: vi.fn(),
  };
});

import Index from './Index';
import { useLexicon } from '@/hooks/useLexicon';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import * as quizHistory from '@/lib/quizHistory';

const mockUseLexicon = useLexicon as unknown as { mockReturnValue: (value: unknown) => void; mockReset: () => void };
const mockUseGoogleSheets = useGoogleSheets as unknown as { mockReturnValue: (value: unknown) => void; mockReset: () => void };
const mockRegisterPushQuizSession = quizHistory.registerPushQuizSession as unknown as ReturnType<typeof vi.fn>;
const mockRegisterPushStreakEvent = quizHistory.registerPushStreakEvent as unknown as ReturnType<typeof vi.fn>;
const mockUnregisterPushQuizSession = quizHistory.unregisterPushQuizSession as unknown as ReturnType<typeof vi.fn>;
const mockUnregisterPushStreakEvent = quizHistory.unregisterPushStreakEvent as unknown as ReturnType<typeof vi.fn>;

const mockPushQuizSession = vi.fn();
const mockPushStreakEvent = vi.fn();
const mockHookReturn = {
  syncState: {
    status: 'idle',
    lastSyncAt: null,
    spreadsheetId: null,
    connectedEmail: null,
    errorMessage: null,
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  syncNow: vi.fn(),
  pushQuizSession: mockPushQuizSession,
  pushStreakEvent: mockPushStreakEvent,
};

const mockLexiconReturn = {
  entries: [],
  allEntries: [],
  search: '',
  setSearch: vi.fn(),
  addEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  findMatches: vi.fn(),
  findLinkedWords: vi.fn(),
  isLoading: false,
  isSaving: false,
};

describe('Index page integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    mockUseLexicon.mockReturnValue(mockLexiconReturn);
    mockUseGoogleSheets.mockReturnValue(mockHookReturn);
  });

  afterEach(() => {
    mockUseLexicon.mockReset();
    mockUseGoogleSheets.mockReset();
    queryClient.clear();
  });

  it('registers quiz session and streak event callbacks when mounted', async () => {
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <Index demo={false} />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockRegisterPushQuizSession).toHaveBeenCalledWith(mockPushQuizSession);
      expect(mockRegisterPushStreakEvent).toHaveBeenCalledWith(mockPushStreakEvent);
    });

    unmount();

    expect(mockUnregisterPushQuizSession).toHaveBeenCalled();
    expect(mockUnregisterPushStreakEvent).toHaveBeenCalled();
  });
});
