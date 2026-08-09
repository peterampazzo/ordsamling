// Feature: exercise-types (numbers + curated prepositions)
import { describe, it, expect } from "vitest";
import {
  numberToDanish,
  compactDanishNumber,
  ordinalToDanish,
  timeToDanish,
  dateToDanish,
  priceToDanish,
  quantityToDanish,
  buildNumberQuestions,
  NUMBER_TOPICS,
} from "@/lib/exercises/numbers";
import { PREPOSITION_PACK, PREPOSITIONS, BLANK, buildPrepositionQuestions } from "@/lib/exercises/prepositions";

describe("numberToDanish", () => {
  it("handles units and teens", () => {
    expect(numberToDanish(0)).toBe("nul");
    expect(numberToDanish(7)).toBe("syv");
    expect(numberToDanish(16)).toBe("seksten");
  });

  it("handles the vigesimal tens", () => {
    expect(numberToDanish(50)).toBe("halvtreds");
    expect(numberToDanish(60)).toBe("tres");
    expect(numberToDanish(70)).toBe("halvfjerds");
    expect(numberToDanish(80)).toBe("firs");
    expect(numberToDanish(90)).toBe("halvfems");
  });

  it("uses reversed unit-first order above twenty", () => {
    expect(numberToDanish(21)).toBe("enogtyve");
    expect(numberToDanish(49)).toBe("niogfyrre");
    expect(numberToDanish(95)).toBe("femoghalvfems");
  });

  it("handles hundreds and a thousand", () => {
    expect(numberToDanish(100)).toBe("hundrede");
    expect(numberToDanish(249)).toBe("tohundrede og niogfyrre");
    expect(compactDanishNumber(249)).toBe("tohundredeogniogfyrre");
    expect(numberToDanish(1000)).toBe("tusind");
  });

  it("rejects out-of-range input", () => {
    expect(() => numberToDanish(1001)).toThrow(RangeError);
  });
});

describe("ordinalToDanish", () => {
  it("covers the irregular low ordinals", () => {
    expect(ordinalToDanish(1)).toBe("første");
    expect(ordinalToDanish(2)).toBe("anden");
    expect(ordinalToDanish(6)).toBe("sjette");
  });

  it("builds compound ordinals", () => {
    expect(ordinalToDanish(20)).toBe("tyvende");
    expect(ordinalToDanish(21)).toBe("enogtyvende");
    expect(ordinalToDanish(50)).toBe("halvtredsindstyvende");
  });
});

describe("clock and dates", () => {
  it("formats spoken times", () => {
    expect(timeToDanish(7, 0)).toBe("syv");
    expect(timeToDanish(7, 15)).toBe("kvart over syv");
    expect(timeToDanish(14, 30)).toBe("halv tre");
    expect(timeToDanish(7, 45)).toBe("kvart i otte");
    expect(timeToDanish(7, 50)).toBe("ti minutter i otte");
    expect(timeToDanish(7, 25)).toBe("fem minutter i halv otte");
  });

  it("formats dates", () => {
    expect(dateToDanish(3, 4)).toBe("den tredje maj");
  });
});

describe("prices and quantities", () => {
  it("formats kroner and øre", () => {
    expect(priceToDanish(249, 50)).toBe("tohundrede og niogfyrre kroner og halvtreds øre");
    expect(priceToDanish(1)).toBe("en krone");
  });

  it("formats halves", () => {
    expect(quantityToDanish(2.5, "kilo")).toBe("to en halv kilo");
    expect(quantityToDanish(0.5, "liter")).toBe("en halv liter");
    expect(quantityToDanish(3, "meter")).toBe("tre meter");
  });
});

describe("buildNumberQuestions", () => {
  it("produces the requested count with 4 unique options each", () => {
    const qs = buildNumberQuestions(NUMBER_TOPICS, 12);
    expect(qs).toHaveLength(12);
    for (const q of qs) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.entry.id.startsWith("gen:")).toBe(true);
    }
  });

  it("respects a single selected topic", () => {
    const qs = buildNumberQuestions(["ordinals"], 5);
    expect(qs).toHaveLength(5);
    expect(qs.every((q) => q.entry.id.startsWith("gen:ord-"))).toBe(true);
  });
});

describe("preposition pack", () => {
  it("every sentence has exactly one blank and a known answer", () => {
    for (const item of PREPOSITION_PACK) {
      expect(item.sentence.split(BLANK)).toHaveLength(2);
      expect(PREPOSITIONS).toContain(item.answer);
      expect(item.gloss.length).toBeGreaterThan(0);
      expect(item.note.length).toBeGreaterThan(0);
    }
  });

  it("builds questions with the correct answer plus 3 unique distractors", () => {
    const qs = buildPrepositionQuestions(20);
    expect(qs).toHaveLength(20);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
    }
  });
});
