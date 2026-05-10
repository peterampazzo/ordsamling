/**
 * Contrast token property tests for WCAG 3 accessibility.
 *
 * Each describe block corresponds to one correctness property from the design document.
 * Tests iterate over the finite set of design-system token pairs defined in contrast-tokens.ts.
 *
 * Feature: wcag-3-accessibility
 */

import { describe, it, expect } from "vitest";
import { TOKEN_PAIRS } from "./contrast-tokens";
import { wcagContrastRatio, apcaLc } from "./contrast-utils";

// ---------------------------------------------------------------------------
// Property 1: WCAG 2.2 normal-text contrast — all body token pairs
// Validates: Requirements 4.1, 4.4, 4.5
// ---------------------------------------------------------------------------

describe("Property 1 — WCAG 2.2 normal-text contrast (≥ 4.5:1)", () => {
  // Feature: wcag-3-accessibility, Property 1
  const bodyPairs = TOKEN_PAIRS.filter((p) => p.usage === "body");

  it.each(bodyPairs)("$name [$theme]", (pair) => {
    const ratio = wcagContrastRatio(pair.foreground, pair.background);
    expect(
      ratio,
      `Expected contrast ≥ 4.5 for "${pair.name}" [${pair.theme}], got ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5);
  });
});

// ---------------------------------------------------------------------------
// Property 2: WCAG 2.2 large-text and UI-component contrast — all token pairs
// Validates: Requirements 4.2, 4.3
// ---------------------------------------------------------------------------

describe("Property 2 — WCAG 2.2 large-text and UI-component contrast (≥ 3.0:1)", () => {
  // Feature: wcag-3-accessibility, Property 2
  const largePairs = TOKEN_PAIRS.filter(
    (p) => p.usage === "large-text" || p.usage === "ui-component"
  );

  it.each(largePairs)("$name [$theme]", (pair) => {
    const ratio = wcagContrastRatio(pair.foreground, pair.background);
    expect(
      ratio,
      `Expected contrast ≥ 3.0 for "${pair.name}" [${pair.theme}], got ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(3.0);
  });
});

// ---------------------------------------------------------------------------
// Property 3: Status badge contrast — all badge color pairs
// Validates: Requirements 4.6
// ---------------------------------------------------------------------------

describe("Property 3 — Status badge contrast (≥ 4.5:1)", () => {
  // Feature: wcag-3-accessibility, Property 3
  const badgePairs = TOKEN_PAIRS.filter((p) => p.name.toLowerCase().includes("badge"));

  it.each(badgePairs)("$name [$theme]", (pair) => {
    const ratio = wcagContrastRatio(pair.foreground, pair.background);
    expect(
      ratio,
      `Expected contrast ≥ 4.5 for badge pair "${pair.name}" [${pair.theme}], got ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5);
  });
});

// ---------------------------------------------------------------------------
// Property 4: APCA body-text Lc — all body-text token pairs
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------

describe("Property 4 — APCA body-text Lc (|Lc| ≥ 75)", () => {
  // Feature: wcag-3-accessibility, Property 4
  const bodyPairs = TOKEN_PAIRS.filter((p) => p.usage === "body");

  it.each(bodyPairs)("$name [$theme]", (pair) => {
    const lc = apcaLc(pair.foreground, pair.background);
    expect(
      Math.abs(lc),
      `Expected |APCA Lc| ≥ 75 for "${pair.name}" [${pair.theme}], got ${lc.toFixed(1)}`
    ).toBeGreaterThanOrEqual(75);
  });
});

// ---------------------------------------------------------------------------
// Property 5: APCA heading Lc — all heading token pairs
// Validates: Requirements 5.3
// ---------------------------------------------------------------------------

describe("Property 5 — APCA heading Lc (|Lc| ≥ 60)", () => {
  // Feature: wcag-3-accessibility, Property 5
  const headingPairs = TOKEN_PAIRS.filter((p) => p.usage === "large-text");

  it.each(headingPairs)("$name [$theme]", (pair) => {
    const lc = apcaLc(pair.foreground, pair.background);
    expect(
      Math.abs(lc),
      `Expected |APCA Lc| ≥ 60 for "${pair.name}" [${pair.theme}], got ${lc.toFixed(1)}`
    ).toBeGreaterThanOrEqual(60);
  });
});

// ---------------------------------------------------------------------------
// Property 6: APCA muted/placeholder Lc — all muted token pairs
// Validates: Requirements 5.4
// ---------------------------------------------------------------------------

describe("Property 6 — APCA muted/placeholder Lc (|Lc| ≥ 45)", () => {
  // Feature: wcag-3-accessibility, Property 6
  const mutedPairs = TOKEN_PAIRS.filter(
    (p) => p.usage === "muted" || p.usage === "placeholder"
  );

  it.each(mutedPairs)("$name [$theme]", (pair) => {
    const lc = apcaLc(pair.foreground, pair.background);
    expect(
      Math.abs(lc),
      `Expected |APCA Lc| ≥ 45 for "${pair.name}" [${pair.theme}], got ${lc.toFixed(1)}`
    ).toBeGreaterThanOrEqual(45);
  });
});
