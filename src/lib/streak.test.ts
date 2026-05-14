// Feature: streak + daily goal + progress aggregation
import { describe, it, expect, beforeEach } from "vitest";
import {
  computeStreak,
  wordsPracticedToday,
  wordsAddedPerWeek,
  accuracyTrendPerWeek,
  timeToMastery,
  getDailyGoal,
  setDailyGoal,
  DEFAULT_DAILY_GOAL,
  dayKey,
} from "./streak";
import type { QuizSessionRecord } from "./quizHistory";
import type { BoxState } from "./quizHistory";
import type { LexisEntry } from "./lexicon";

const DAY = 24 * 60 * 60 * 1000;
// Pick a fixed local-noon timestamp so tests are TZ-stable.
const NOON_TODAY = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
})();

function session(date: number, answers: { correct: boolean; skipped?: boolean; entryId?: string }[] = [{ correct: true }]): QuizSessionRecord {
  return {
    id: `s-${date}-${Math.random()}`,
    date,
    mode: "choice",
    fromLabel: "Danish",
    toLabel: "English",
    score: answers.filter((a) => a.correct).length,
    total: answers.length,
    answers: answers.map((a, i) => ({
      prompt: "p",
      correctAnswer: "a",
      givenAnswer: a.correct ? "a" : "x",
      correct: a.correct,
      skipped: a.skipped ?? false,
      fromLang: "danish",
      toLang: "english",
      entryId: a.entryId ?? `e-${i}`,
    })),
  };
}

beforeEach(() => localStorage.clear());

describe("dayKey", () => {
  it("formats local YYYY-MM-DD", () => {
    expect(dayKey(NOON_TODAY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dayKey(NOON_TODAY)).toBe(dayKey(NOON_TODAY + 60_000));
  });
});

describe("getDailyGoal / setDailyGoal", () => {
  it("returns default when unset", () => {
    expect(getDailyGoal()).toBe(DEFAULT_DAILY_GOAL);
  });
  it("persists positive integers", () => {
    setDailyGoal(25);
    expect(getDailyGoal()).toBe(25);
  });
  it("ignores invalid values", () => {
    localStorage.setItem("lexikon-daily-goal", "not-a-number");
    expect(getDailyGoal()).toBe(DEFAULT_DAILY_GOAL);
  });
});

describe("computeStreak", () => {
  it("returns zeros when there is no history", () => {
    expect(computeStreak([], NOON_TODAY)).toEqual({
      current: 0,
      longest: 0,
      lastActiveDay: null,
      practicedToday: false,
    });
  });

  it("counts a one-day streak when only today is active", () => {
    const r = computeStreak([session(NOON_TODAY)], NOON_TODAY);
    expect(r.current).toBe(1);
    expect(r.longest).toBe(1);
    expect(r.practicedToday).toBe(true);
  });

  it("includes yesterday when today is not active yet", () => {
    const r = computeStreak([session(NOON_TODAY - DAY)], NOON_TODAY);
    expect(r.current).toBe(1);
    expect(r.practicedToday).toBe(false);
  });

  it("breaks the streak when most recent activity is older than yesterday", () => {
    const r = computeStreak([session(NOON_TODAY - 3 * DAY)], NOON_TODAY);
    expect(r.current).toBe(0);
    expect(r.longest).toBe(1);
  });

  it("computes the longest run across history", () => {
    const r = computeStreak(
      [
        session(NOON_TODAY - 10 * DAY),
        session(NOON_TODAY - 9 * DAY),
        session(NOON_TODAY - 8 * DAY),
        session(NOON_TODAY - 5 * DAY),
        session(NOON_TODAY),
      ],
      NOON_TODAY,
    );
    expect(r.longest).toBe(3);
    expect(r.current).toBe(1);
  });

  it("ignores skipped-only sessions", () => {
    const r = computeStreak([session(NOON_TODAY, [{ correct: false, skipped: true }])], NOON_TODAY);
    expect(r.current).toBe(0);
  });
});

describe("wordsPracticedToday", () => {
  it("counts unique non-skipped entry ids today", () => {
    const h = [
      session(NOON_TODAY, [
        { correct: true, entryId: "a" },
        { correct: false, entryId: "a" }, // dedup
        { correct: true, entryId: "b" },
        { correct: false, skipped: true, entryId: "c" }, // skipped excluded
      ]),
      session(NOON_TODAY - DAY, [{ correct: true, entryId: "z" }]),
    ];
    expect(wordsPracticedToday(h, NOON_TODAY)).toBe(2);
  });
});

describe("wordsAddedPerWeek", () => {
  it("buckets entries into the requested number of weeks ending now", () => {
    const entries: LexisEntry[] = [
      { id: "1", danish: "a", english: "a", notes: "", type: "word", createdAt: NOON_TODAY },
      { id: "2", danish: "b", english: "b", notes: "", type: "word", createdAt: NOON_TODAY - 8 * DAY },
      { id: "3", danish: "c", english: "c", notes: "", type: "word", createdAt: NOON_TODAY - 100 * DAY },
    ];
    const r = wordsAddedPerWeek(entries, 4, NOON_TODAY);
    expect(r).toHaveLength(4);
    expect(r[r.length - 1].value).toBe(1); // this week
    // entry 3 is way outside the 4-week window
    expect(r.reduce((s, p) => s + p.value, 0)).toBe(2);
  });
});

describe("accuracyTrendPerWeek", () => {
  it("returns 0 for empty weeks and percentage for active weeks", () => {
    const r = accuracyTrendPerWeek(
      [
        session(NOON_TODAY, [
          { correct: true, entryId: "a" },
          { correct: true, entryId: "b" },
          { correct: false, entryId: "c" },
          { correct: false, entryId: "d" },
        ]),
      ],
      2,
      NOON_TODAY,
    );
    expect(r).toHaveLength(2);
    expect(r[0].value).toBe(0); // last week — no data
    expect(r[1].value).toBe(50); // this week
  });
});

describe("timeToMastery", () => {
  it("averages days from first review to mastery for box-5 entries only", () => {
    const history = [
      session(NOON_TODAY - 30 * DAY, [{ correct: true, entryId: "x" }]),
      session(NOON_TODAY - 10 * DAY, [{ correct: true, entryId: "y" }]),
    ];
    const states = new Map<string, BoxState>([
      ["x", { entryId: "x", box: 5, lastReviewedAt: NOON_TODAY, nextDueAt: 0 }],
      ["y", { entryId: "y", box: 3, lastReviewedAt: NOON_TODAY, nextDueAt: 0 }],
    ]);
    const r = timeToMastery(history, states);
    expect(r.masteredCount).toBe(1);
    expect(Math.round(r.averageDays!)).toBe(30);
  });

  it("returns null average when no entries are mastered", () => {
    const r = timeToMastery([], new Map());
    expect(r.masteredCount).toBe(0);
    expect(r.averageDays).toBeNull();
  });
});
