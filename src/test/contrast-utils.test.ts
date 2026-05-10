/**
 * Unit tests for contrast utility functions.
 *
 * Validates: Requirements 4.1, 5.2
 */

import { describe, it, expect } from "vitest";
import { hslToHex, wcagContrastRatio, apcaLc } from "./contrast-utils";

// ---------------------------------------------------------------------------
// hslToHex
// ---------------------------------------------------------------------------

describe("hslToHex", () => {
  it("converts white (0, 0%, 100%) to #ffffff", () => {
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
  });

  it("converts black (0, 0%, 0%) to #000000", () => {
    expect(hslToHex(0, 0, 0)).toBe("#000000");
  });

  it("converts mid-grey (0, 0%, 50%) to #808080", () => {
    expect(hslToHex(0, 0, 50)).toBe("#808080");
  });

  it("converts a saturated red (0, 100%, 50%) to #ff0000", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
  });

  it("converts a saturated green (120, 100%, 50%) to #00ff00", () => {
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
  });

  it("converts a saturated blue (240, 100%, 50%) to #0000ff", () => {
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
  });
});

// ---------------------------------------------------------------------------
// wcagContrastRatio
// ---------------------------------------------------------------------------

describe("wcagContrastRatio", () => {
  it("returns 21 for black text on white background", () => {
    // The maximum possible WCAG 2.x contrast ratio is 21:1
    expect(wcagContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("returns 21 for white text on black background (order-independent)", () => {
    expect(wcagContrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colors (no contrast)", () => {
    expect(wcagContrastRatio("#808080", "#808080")).toBeCloseTo(1, 5);
  });

  it("returns a ratio ≥ 4.5 for dark text on light background (typical body text)", () => {
    // Near-black on near-white — should comfortably exceed 4.5:1
    expect(wcagContrastRatio("#1a1a1a", "#f5f5f5")).toBeGreaterThanOrEqual(4.5);
  });

  it("accepts HSL strings as input", () => {
    // HSL black (0 0% 0%) on HSL white (0 0% 100%) should also give ~21
    expect(wcagContrastRatio("0 0% 0%", "0 0% 100%")).toBeCloseTo(21, 1);
  });
});

// ---------------------------------------------------------------------------
// apcaLc
// ---------------------------------------------------------------------------

describe("apcaLc", () => {
  it("returns a large positive Lc for black text on white background (body text pair)", () => {
    // APCA Lc for #000000 on #ffffff is approximately 106 (dark text on light bg → positive)
    const lc = apcaLc("#000000", "#ffffff");
    expect(lc).toBeGreaterThan(100);
  });

  it("returns a negative Lc for white text on black background (WoB polarity)", () => {
    // Light text on dark background → negative Lc
    const lc = apcaLc("#ffffff", "#000000");
    expect(lc).toBeLessThan(-100);
  });

  it("returns 0 for identical colors (no contrast)", () => {
    expect(apcaLc("#808080", "#808080")).toBe(0);
  });

  it("returns Lc ≥ 75 for a typical dark body-text pair (Requirement 5.2)", () => {
    // Validates: Requirements 5.2
    // Near-black text on white background — should meet the WCAG 3.0 draft body-text threshold
    const lc = apcaLc("#1a1a1a", "#ffffff");
    expect(lc).toBeGreaterThanOrEqual(75);
  });
});
