/**
 * Unit tests for parseVerbFormsResponse — the pure parser used by
 * autocompleteVerbForms (AI verb-form helper, plan item #10).
 *
 * Mirrors the testing conventions of gemini.bugCondition.test.ts:
 * we exercise the parser directly rather than mocking the Gemini SDK.
 */

import { describe, it, expect } from "vitest";
import { parseVerbFormsResponse } from "./gemini";

describe("parseVerbFormsResponse", () => {
  it("parses a clean JSON object", () => {
    const out = parseVerbFormsResponse(
      JSON.stringify({ present: "går", past: "gik", perfect: "har gået" }),
    );
    expect(out).toEqual({ present: "går", past: "gik", perfect: "har gået" });
  });

  it("parses JSON wrapped in markdown fences", () => {
    const raw = "```json\n" +
      JSON.stringify({ present: "spiser", past: "spiste", perfect: "har spist" }) +
      "\n```";
    const out = parseVerbFormsResponse(raw);
    expect(out).toEqual({ present: "spiser", past: "spiste", perfect: "har spist" });
  });

  it("parses JSON surrounded by explanatory prose", () => {
    const raw = `Here are the forms:\n${JSON.stringify({
      present: "lærer",
      past: "lærte",
      perfect: "har lært",
    })}\nHope it helps!`;
    expect(parseVerbFormsResponse(raw)).toEqual({
      present: "lærer",
      past: "lærte",
      perfect: "har lært",
    });
  });

  it("trims whitespace on each form", () => {
    const out = parseVerbFormsResponse(
      JSON.stringify({ present: "  går  ", past: "gik\n", perfect: " har gået " }),
    );
    expect(out).toEqual({ present: "går", past: "gik", perfect: "har gået" });
  });

  it("returns partial result when only some forms are present", () => {
    const out = parseVerbFormsResponse(
      JSON.stringify({ present: "kommer", past: "", perfect: "er kommet" }),
    );
    expect(out).toEqual({ present: "kommer", past: "", perfect: "er kommet" });
  });

  it("returns null for non-JSON garbage", () => {
    expect(parseVerbFormsResponse("not json at all")).toBeNull();
  });

  it("returns null when the parsed value is an array", () => {
    expect(parseVerbFormsResponse(JSON.stringify(["går", "gik"]))).toBeNull();
  });

  it("returns null when no usable form is present", () => {
    expect(
      parseVerbFormsResponse(JSON.stringify({ present: "", past: "", perfect: "" })),
    ).toBeNull();
  });
});
