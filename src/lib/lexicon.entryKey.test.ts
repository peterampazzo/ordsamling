import { describe, expect, it } from "vitest";
import { entryKey } from "./lexicon";

const noun = (danish: string) => ({ danish, type: "noun" as const });
const verb = (danish: string) => ({ danish, type: "verb" as const });

describe("entryKey", () => {
  it("lowercases and trims", () => {
    expect(entryKey(noun("  HUND "))).toBe("hund");
  });

  it("collapses internal whitespace", () => {
    expect(entryKey(noun("god   morgen"))).toBe("god morgen");
  });

  it("strips the Danish infinitive marker for verbs", () => {
    expect(entryKey(verb("at gå"))).toBe("gå");
    expect(entryKey(verb("At Spise"))).toBe("spise");
    expect(entryKey(verb("gå"))).toBe("gå");
  });

  it("does not strip 'at' for non-verb types", () => {
    expect(entryKey(noun("at gå"))).toBe("at gå");
  });

  it("makes verb variants collide", () => {
    expect(entryKey(verb("at gå"))).toBe(entryKey(verb("gå")));
  });

  it("makes whitespace variants collide", () => {
    expect(entryKey(noun("hus"))).toBe(entryKey(noun(" hus  ")));
  });

  it("returns empty string for empty input", () => {
    expect(entryKey(noun("   "))).toBe("");
  });
});
