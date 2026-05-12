// Feature: spaced-repetition (SM-2 lite / Leitner boxes)
// Pure-function tests — no DOM, no React.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReadQuizHistory } = vi.hoisted(() => ({
  mockReadQuizHistory: vi.fn(),
}));

vi.mock('@/services/GoogleSheetsService', () => ({
  GoogleSheetsService: vi.fn().mockImplementation(() => ({
    readQuizHistory: mockReadQuizHistory,
  })),
}));

const { mockIsCloudSyncEnabled, mockGetStorageConfig } = vi.hoisted(() => ({
  mockIsCloudSyncEnabled: vi.fn(),
  mockGetStorageConfig: vi.fn(),
}));

vi.mock('@/lib/storageConfig', () => ({
  isCloudSyncEnabled: mockIsCloudSyncEnabled,
  getStorageConfig: mockGetStorageConfig,
}));

const { mockGetValidAccessToken } = vi.hoisted(() => ({
  mockGetValidAccessToken: vi.fn(),
}));

vi.mock('@/lib/googleOAuth', () => ({
  getValidAccessToken: mockGetValidAccessToken,
}));

import {
  fetchHistory,
  loadHistory,
  updateSm2,
  pickDue,
  seedFromHistory,
  DEFAULT_BOX,
  BOX_INTERVALS_MS,
  type BoxState,
  type QuizSessionRecord,
} from "./quizHistory";

const NOW = 1_700_000_000_000;

function state(box: number, nextDueAt = 0, entryId = "e1"): BoxState {
  return { entryId, box, lastReviewedAt: 0, nextDueAt };
}

function makeSession(id: string, date = NOW): QuizSessionRecord {
  return {
    id,
    date,
    mode: 'choice',
    fromLabel: 'Danish',
    toLabel: 'English',
    score: 1,
    total: 1,
    answers: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockIsCloudSyncEnabled.mockReturnValue(false);
  mockGetStorageConfig.mockReturnValue({
    storageSource: 'local',
    spreadsheetId: null,
    connectedEmail: null,
    oauthTokenExpiry: null,
  });
  mockGetValidAccessToken.mockResolvedValue(null);
  mockReadQuizHistory.mockResolvedValue([]);
});

describe("updateSm2", () => {
  it("seeds new entries from DEFAULT_BOX on first correct answer (box up)", () => {
    const next = updateSm2(undefined, true, NOW);
    expect(next.box).toBe(DEFAULT_BOX + 1);
    expect(next.nextDueAt).toBe(NOW + BOX_INTERVALS_MS[DEFAULT_BOX + 1]);
    expect(next.lastReviewedAt).toBe(NOW);
  });

  it("demotes one box on a wrong answer, never below 1", () => {
    expect(updateSm2(state(3), false, NOW).box).toBe(2);
    expect(updateSm2(state(1), false, NOW).box).toBe(1);
  });

  it("promotes one box on a correct answer, never above 5", () => {
    expect(updateSm2(state(4), true, NOW).box).toBe(5);
    expect(updateSm2(state(5), true, NOW).box).toBe(5);
  });

  it("schedules next review using the destination box interval", () => {
    const next = updateSm2(state(2), true, NOW);
    expect(next.nextDueAt).toBe(NOW + BOX_INTERVALS_MS[3]);
  });
});

describe("pickDue", () => {
  it("returns only entries with nextDueAt <= now, oldest-due first", () => {
    const states = new Map<string, BoxState>([
      ["a", state(2, NOW - 1000, "a")],
      ["b", state(2, NOW + 1000, "b")],
      ["c", state(2, NOW - 5000, "c")],
    ]);
    expect(pickDue(states, ["a", "b", "c"], NOW)).toEqual(["c", "a"]);
  });

  it("treats unknown entries as immediately due", () => {
    const states = new Map<string, BoxState>([["a", state(2, NOW + 99999, "a")]]);
    expect(pickDue(states, ["a", "b"], NOW)).toEqual(["b"]);
  });
});

describe("fetchHistory", () => {
  it("returns local history when cloud sync is disabled", async () => {
    mockIsCloudSyncEnabled.mockReturnValue(false);
    const session = makeSession('local-1', NOW);
    localStorage.setItem('lexikon-quiz-history', JSON.stringify([session]));

    await expect(fetchHistory()).resolves.toEqual([session]);
  });

  it("fetches remote history when cloud sync is enabled", async () => {
    mockIsCloudSyncEnabled.mockReturnValue(true);
    mockGetStorageConfig.mockReturnValue({
      storageSource: 'google_sheets',
      spreadsheetId: 'sheet-123',
      connectedEmail: 'test@example.com',
      oauthTokenExpiry: null,
    });
    mockGetValidAccessToken.mockResolvedValue('token');

    const local = makeSession('local-1', NOW - 1000);
    const remoteNew = makeSession('remote-1', NOW + 1000);
    const remoteOld = makeSession('remote-2', NOW - 2000);

    mockReadQuizHistory.mockResolvedValue([remoteOld, remoteNew]);
    localStorage.setItem('lexikon-quiz-history', JSON.stringify([local]));

    await expect(fetchHistory()).resolves.toEqual([remoteNew, local, remoteOld]);
    expect(mockReadQuizHistory).toHaveBeenCalledWith('sheet-123', 'token');
  });

  it("falls back to local history when remote fetch fails", async () => {
    mockIsCloudSyncEnabled.mockReturnValue(true);
    mockGetStorageConfig.mockReturnValue({
      storageSource: 'google_sheets',
      spreadsheetId: 'sheet-123',
      connectedEmail: 'test@example.com',
      oauthTokenExpiry: null,
    });
    mockGetValidAccessToken.mockResolvedValue('token');

    const local = makeSession('local-1', NOW);
    mockReadQuizHistory.mockRejectedValue(new Error('read failed'));
    localStorage.setItem('lexikon-quiz-history', JSON.stringify([local]));

    await expect(fetchHistory()).resolves.toEqual([local]);
  });
});

describe("seedFromHistory (migration)", () => {
  it("seeds DEFAULT_BOX for entries appearing in history but missing from states", () => {
    const session: QuizSessionRecord = {
      id: "s1",
      date: NOW,
      mode: "mixed",
      fromLabel: "Danish",
      toLabel: "English",
      score: 1,
      total: 1,
      answers: [
        { prompt: "p", correctAnswer: "a", givenAnswer: "a", correct: true, skipped: false, fromLang: "danish", toLang: "english", entryId: "x" },
      ],
    };
    const states = seedFromHistory(new Map(), [session]);
    expect(states.get("x")?.box).toBe(DEFAULT_BOX);
    expect(states.get("x")?.nextDueAt).toBe(0);
  });

  it("does not overwrite existing states", () => {
    const existing = new Map<string, BoxState>([["x", state(5, NOW + 1000, "x")]]);
    const session: QuizSessionRecord = {
      id: "s1", date: NOW, mode: "mixed", fromLabel: "", toLabel: "", score: 0, total: 0,
      answers: [{ prompt: "p", correctAnswer: "a", givenAnswer: "a", correct: true, skipped: false, fromLang: "danish", toLang: "english", entryId: "x" }],
    };
    expect(seedFromHistory(existing, [session]).get("x")?.box).toBe(5);
  });
});
