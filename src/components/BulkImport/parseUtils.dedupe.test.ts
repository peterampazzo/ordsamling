import { describe, expect, it } from "vitest";
import { buildEntryLookup, flagBatchDuplicates } from "./parseUtils";
import type { LexisEntry, LexisEntryInput } from "@/lib/lexicon";

const input = (danish: string, type: LexisEntryInput["type"] = "noun"): LexisEntryInput => ({
  danish, english: "", notes: "", type,
});

const stored = (id: string, danish: string, type: LexisEntry["type"] = "noun"): LexisEntry => ({
  id, danish, english: "", notes: "", type, createdAt: 0, updatedAt: 0,
});

describe("flagBatchDuplicates", () => {
  it("flags later occurrences within one batch", () => {
    const flags = flagBatchDuplicates([input("hund"), input("kat"), input("hund")]);
    expect(flags).toEqual([false, false, true]);
  });

  it("flags case/whitespace variants", () => {
    const flags = flagBatchDuplicates([input("hund"), input(" HUND  ")]);
    expect(flags).toEqual([false, true]);
  });

  it("flags verb variants with and without 'at'", () => {
    const flags = flagBatchDuplicates([input("at gå", "verb"), input("gå", "verb")]);
    expect(flags).toEqual([false, true]);
  });

  it("does not flag different types with the same text", () => {
    const flags = flagBatchDuplicates([input("at gå", "noun"), input("gå", "verb")]);
    expect(flags).toEqual([false, false]);
  });

  it("does not flag empty keys", () => {
    const flags = flagBatchDuplicates([input("  "), input("   ")]);
    expect(flags).toEqual([false, false]);
  });
});

describe("buildEntryLookup", () => {
  it("indexes entries by normalized key", () => {
    const lookup = buildEntryLookup([stored("1", "hund"), stored("2", "gå", "verb")]);
    expect(lookup.get("hund")?.id).toBe("1");
    expect(lookup.get("gå")?.id).toBe("2");
  });

  it("an import row with 'at gå' matches a stored verb 'gå'", () => {
    const lookup = buildEntryLookup([stored("2", "gå", "verb")]);
    const row = input("at gå", "verb");
    const hit = lookup.get("gå"); // entryKey(row) === "gå"
    expect(hit?.id).toBe("2");
    expect(row.danish).toBe("at gå");
  });
});
