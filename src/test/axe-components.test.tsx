// Feature: wcag-3-accessibility, Property 10

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { axe } from "vitest-axe";
import "vitest-axe/extend-expect";

// ─── Mocks (same as lang-sync.test.tsx) ──────────────────────────────────────

vi.mock("@/i18n/da.yaml", () => ({
  default: {
    common: { edit: "Rediger", delete: "Slet", actions: "Handlinger", cancel: "Annuller", deleting: "Sletter…" },
    lexisCard: { translations: "Oversættelser", english: "Engelsk", deleteTitle: "Slet opslag", deleteDescription: "Slet {word}?" },
    directions: { danish: "Dansk" },
    addEntry: { danishPlaceholder: "Skriv dansk ord…" },
  },
}));

vi.mock("@/i18n/en.yaml", () => ({
  default: {
    common: { edit: "Edit", delete: "Delete", actions: "Actions", cancel: "Cancel", deleting: "Deleting…" },
    lexisCard: { translations: "Translations", english: "English", deleteTitle: "Delete entry", deleteDescription: "Delete {word}?" },
    directions: { danish: "Danish" },
    addEntry: { danishPlaceholder: "Enter Danish word…" },
  },
}));

vi.mock("@/hooks/useVisibleLanguages", () => ({
  useExtraLanguages: () => [],
  useVisibleLanguages: () => ["danish", "english"],
}));

vi.mock("@/lib/settings", () => ({
  getLanguageLabel: (code: string) => code,
  getExtraLanguages: () => [],
  getGeminiApiKey: () => null,
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { LexisCard } from "@/components/LexisCard";
import { CloudSyncIndicator } from "@/components/CloudSyncIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LexisEntry } from "@/lib/lexicon";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WCAG_TAGS = { runOnly: { type: "tag" as const, values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } };

function criticalOrSerious(violations: { impact?: string | null }[]) {
  return violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

const SAMPLE_ENTRY: LexisEntry = {
  id: "axe-test-1",
  danish: "hund",
  english: "dog",
  notes: "",
  type: "noun",
  createdAt: 0,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

/**
 * Property 10: axe-core zero critical/serious violations — all key components
 * Validates: Requirements 15.1, 15.2
 */

describe("Property 10 — axe-core zero critical/serious violations", () => {
  it("LexisCard has no critical or serious WCAG 2.x violations", async () => {
    // Feature: wcag-3-accessibility, Property 10
    const { container } = render(
      React.createElement(LexisCard, {
        entry: SAMPLE_ENTRY,
        onUpdate: async () => {},
        onDelete: async () => {},
        linkedWords: [],
      }),
    );

    const results = await axe(container, WCAG_TAGS);
    const blocking = criticalOrSerious(results.violations);
    expect(blocking).toHaveLength(0);
  });

  it("CloudSyncIndicator has no critical or serious WCAG 2.x violations", async () => {
    // Feature: wcag-3-accessibility, Property 10
    const { container } = render(
      <TooltipProvider>
        <CloudSyncIndicator status="idle" lastSyncAt={null} onClick={() => {}} />
      </TooltipProvider>,
    );

    const results = await axe(container, WCAG_TAGS);
    const blocking = criticalOrSerious(results.violations);
    expect(blocking).toHaveLength(0);
  });
});
