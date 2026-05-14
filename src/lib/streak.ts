// Feature: streak + daily goal + progress aggregation
// Pure functions over QuizSessionRecord[] and LexisEntry[]. No DOM, no React.

import type { QuizSessionRecord } from "./quizHistory";
import type { LexisEntry } from "./lexicon";
import type { BoxState } from "./quizHistory";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_GOAL_KEY = "lexikon-daily-goal";
export const DEFAULT_DAILY_GOAL = 10;

// ---------------------------------------------------------------------------
// Daily goal (localStorage)
// ---------------------------------------------------------------------------

export function getDailyGoal(): number {
  try {
    const raw = localStorage.getItem(DAILY_GOAL_KEY);
    if (!raw) return DEFAULT_DAILY_GOAL;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_GOAL;
  } catch {
    return DEFAULT_DAILY_GOAL;
  }
}

export function setDailyGoal(n: number): void {
  try {
    localStorage.setItem(DAILY_GOAL_KEY, String(Math.max(1, Math.floor(n))));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Day key helpers — local time, calendar day
// ---------------------------------------------------------------------------

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

export interface StreakInfo {
  current: number;
  longest: number;
  lastActiveDay: string | null;
  practicedToday: boolean;
}

/**
 * Streak = consecutive calendar days (local time) ending today or yesterday
 * that contain at least one non-skipped quiz answer.
 * If the most recent active day is older than yesterday, current streak is 0.
 */
export function computeStreak(history: readonly QuizSessionRecord[], now: number = Date.now()): StreakInfo {
  const days = new Set<string>();
  for (const s of history) {
    const hasAnswer = s.answers.some((a) => !a.skipped);
    if (hasAnswer) days.add(dayKey(s.date));
    else if (s.answers.length === 0 && s.total > 0) days.add(dayKey(s.date)); // legacy sessions w/o per-answer records
  }
  if (days.size === 0) {
    return { current: 0, longest: 0, lastActiveDay: null, practicedToday: false };
  }

  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(now - DAY_MS);
  const sortedDayTs = [...days].map((k) => startOfDay(new Date(k).getTime())).sort((a, b) => a - b);

  // longest run
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sortedDayTs.length; i++) {
    if (sortedDayTs[i] - sortedDayTs[i - 1] === DAY_MS) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // current streak — walk back from today (or yesterday if today not active)
  let current = 0;
  const startKey = days.has(todayKey) ? todayKey : days.has(yesterdayKey) ? yesterdayKey : null;
  if (startKey) {
    let cursor = startOfDay(new Date(startKey).getTime());
    while (days.has(dayKey(cursor))) {
      current++;
      cursor -= DAY_MS;
    }
  }

  const lastActiveDay = dayKey(sortedDayTs[sortedDayTs.length - 1]);
  return { current, longest, lastActiveDay, practicedToday: days.has(todayKey) };
}

/**
 * Count unique entry IDs answered (non-skipped) today.
 * Falls back to counting non-skipped answers when entryId is missing on legacy records.
 */
export function wordsPracticedToday(history: readonly QuizSessionRecord[], now: number = Date.now()): number {
  const today = dayKey(now);
  const ids = new Set<string>();
  let fallbackCount = 0;
  for (const s of history) {
    if (dayKey(s.date) !== today) continue;
    for (const a of s.answers) {
      if (a.skipped) continue;
      if (a.entryId) ids.add(a.entryId);
      else fallbackCount++;
    }
  }
  return ids.size + fallbackCount;
}

// ---------------------------------------------------------------------------
// Weekly aggregations
// ---------------------------------------------------------------------------

/** ISO-like week start (Monday) at local midnight, returned as ms timestamp. */
function startOfWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sun
  const offset = (dow + 6) % 7; // days since Monday
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

export interface WeeklyPoint {
  weekStart: number;
  label: string; // ISO date YYYY-MM-DD of the Monday
  value: number;
}

/** Words added per ISO week from the lexicon (uses entry.createdAt). */
export function wordsAddedPerWeek(entries: readonly LexisEntry[], weeks: number = 12, now: number = Date.now()): WeeklyPoint[] {
  return bucketByWeek(entries.map((e) => ({ ts: e.createdAt, value: 1 })), weeks, now, sumReducer);
}

/** Accuracy (0..100) per week from quiz history. Weeks with zero answers are reported as null-equivalent (value 0). */
export function accuracyTrendPerWeek(history: readonly QuizSessionRecord[], weeks: number = 12, now: number = Date.now()): WeeklyPoint[] {
  const items: { ts: number; correct: number; total: number }[] = [];
  for (const s of history) {
    let correct = 0;
    let total = 0;
    for (const a of s.answers) {
      if (a.skipped) continue;
      total++;
      if (a.correct) correct++;
    }
    if (total > 0) items.push({ ts: s.date, correct, total });
  }
  return bucketByWeek(
    items.map((i) => ({ ts: i.ts, value: i })),
    weeks,
    now,
    (acc: { correct: number; total: number } | null, v) => {
      const cur = acc ?? { correct: 0, total: 0 };
      const x = v as { correct: number; total: number };
      return { correct: cur.correct + x.correct, total: cur.total + x.total };
    },
  ).map((p) => {
    const agg = (p.value as unknown as { correct: number; total: number } | null) ?? { correct: 0, total: 0 };
    return { ...p, value: agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0 };
  });
}

function sumReducer(acc: number | null, v: unknown): number {
  return (acc ?? 0) + (typeof v === "number" ? v : 1);
}

function bucketByWeek<T>(
  rows: { ts: number; value: T }[],
  weeks: number,
  now: number,
  reducer: (acc: unknown, v: T) => unknown,
): WeeklyPoint[] {
  const currentWeek = startOfWeek(now);
  const buckets = new Map<number, unknown>();
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.set(currentWeek - i * 7 * DAY_MS, null);
  }
  for (const row of rows) {
    const wk = startOfWeek(row.ts);
    if (!buckets.has(wk)) continue;
    buckets.set(wk, reducer(buckets.get(wk), row.value));
  }
  return [...buckets.entries()].map(([weekStart, value]) => ({
    weekStart,
    label: dayKey(weekStart),
    value: typeof value === "number" ? value : (value as number) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Time-to-mastery
// ---------------------------------------------------------------------------

export interface MasteryStats {
  masteredCount: number;
  averageDays: number | null;
}

/**
 * Mastery = box 5 in the SM-2 lite scheme. Time-to-mastery is approximated as
 * (lastReviewedAt - first review of that entry in history).
 */
export function timeToMastery(history: readonly QuizSessionRecord[], boxStates: ReadonlyMap<string, BoxState>): MasteryStats {
  const firstSeen = new Map<string, number>();
  // Walk history oldest-first
  const sorted = [...history].sort((a, b) => a.date - b.date);
  for (const s of sorted) {
    for (const a of s.answers) {
      if (!a.entryId) continue;
      if (!firstSeen.has(a.entryId)) firstSeen.set(a.entryId, s.date);
    }
  }
  let masteredCount = 0;
  let totalDays = 0;
  for (const [id, st] of boxStates) {
    if (st.box < 5) continue;
    const first = firstSeen.get(id);
    if (!first || !st.lastReviewedAt) continue;
    masteredCount++;
    totalDays += Math.max(0, (st.lastReviewedAt - first) / DAY_MS);
  }
  return {
    masteredCount,
    averageDays: masteredCount > 0 ? totalDays / masteredCount : null,
  };
}
