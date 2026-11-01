import { describe, expect, it } from "vitest";
import { lowercaseLeadingWord, normalizeImportedEntry } from "./lexicon";

describe("lowercaseLeadingWord", () => {
  it.each([
    ["Gave", "gave"],
    ["Stå i kø", "stå i kø"],
    ["VM", "VM"],
    ["VVS'er", "VVS'er"],
    ["I", "I"],
    ["I'm sorry", "I'm sorry"],
    ["hus", "hus"],
    ["", ""],
  ])("%s -> %s", (input, expected) => {
    expect(lowercaseLeadingWord(input)).toBe(expected);
  });
});

describe("normalizeImportedEntry", () => {
  it("cleans case and whitespace in danish, english and grammar", () => {
    expect(normalizeImportedEntry({
      danish: "  Lektor ",
      english: "Lecturer",
      type: "noun",
      notes: " Hun er lektor ",
      grammar: { article: "En", singularDefinite: "Lektoren", pluralIndefinite: "Lektorer", pluralDefinite: " " },
    })).toEqual({
      danish: "lektor",
      english: "lecturer",
      type: "noun",
      notes: "Hun er lektor",
      grammar: { article: "en", singularDefinite: "lektoren", pluralIndefinite: "lektorer" },
    });
  });

  it("strips infinitive markers from verbs and lowercases perfect forms", () => {
    expect(normalizeImportedEntry({
      danish: "at  Tømme",
      english: "to empty",
      type: "verb",
      notes: "",
      grammar: { present: "Tømmer", past: "Tømte", perfect: "Har tømt" },
    })).toMatchObject({
      danish: "tømme",
      english: "empty",
      grammar: { present: "tømmer", past: "tømte", perfect: "har tømt" },
    });
  });

  it("keeps notes and translations casing but drops empty translations", () => {
    expect(normalizeImportedEntry({
      danish: "Hus",
      english: "house",
      type: "word",
      notes: "Jeg har et hus",
      translations: { it: " Casa ", de: " " },
    })).toEqual({ danish: "hus", english: "house", type: "word", notes: "Jeg har et hus", translations: { it: "Casa" } });
  });
});
