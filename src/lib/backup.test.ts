import { beforeEach, describe, expect, it, vi } from "vitest";
import { snapshotLocalData } from "./backup";
import { REAL_STORAGE_KEY } from "./demo";
import { HISTORY_KEY } from "./syncQueue";
import type { LexisEntry } from "./lexicon";

const entry = (id: string): LexisEntry => ({
  id, danish: "hund", english: "dog", notes: "", type: "noun", createdAt: 0, updatedAt: 0,
});

function backupKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("ordsamling-backup-")) keys.push(k);
  }
  return keys;
}

describe("snapshotLocalData", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it("stores a snapshot of entries and quiz history", () => {
    localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify([entry("a")]));
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ id: "s1" }]));
    snapshotLocalData("connect");

    const keys = backupKeys();
    expect(keys).toHaveLength(1);
    const backup = JSON.parse(localStorage.getItem(keys[0])!);
    expect(backup.reason).toBe("connect");
    expect(backup.entries).toHaveLength(1);
    expect(backup.quizHistory).toHaveLength(1);
    expect(typeof backup.savedAt).toBe("number");
  });

  it("keeps at most two snapshots", () => {
    localStorage.setItem(REAL_STORAGE_KEY, "[]");
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(1000 + i);
      snapshotLocalData("connect");
    }
    const keys = backupKeys();
    expect(keys).toHaveLength(2);
    // newest two retained
    expect(keys.some((k) => k.endsWith("1003"))).toBe(true);
    expect(keys.some((k) => k.endsWith("1002"))).toBe(true);
  });

  it("never throws on storage failures", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => snapshotLocalData("connect")).not.toThrow();
    setItem.mockRestore();
  });
});
