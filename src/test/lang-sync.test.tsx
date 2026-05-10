// Feature: wcag-3-accessibility, Property 8
// Feature: wcag-3-accessibility, Property 9

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Mock the YAML imports that the i18n module loads.
// The @modyfi/vite-plugin-yaml plugin has a known issue with certain
// Unicode strings in da.yaml, so we stub the YAML modules here.
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

// Mock useExtraLanguages to return an empty array (no extra languages enabled)
vi.mock("@/hooks/useVisibleLanguages", () => ({
  useExtraLanguages: () => [],
  useVisibleLanguages: () => ["danish", "english"],
}));

// Mock getLanguageLabel to avoid settings dependency
vi.mock("@/lib/settings", () => ({
  getLanguageLabel: (code: string) => code,
  getExtraLanguages: () => [],
  getGeminiApiKey: () => null,
}));

// ─── Property 8: Language attribute synchronization ───────────────────────────
// Validates: Requirements 11.2

describe("Property 8: Language attribute synchronization", () => {
  beforeEach(() => {
    // Reset to a neutral state before each test
    document.documentElement.lang = "";
    // Clear localStorage to avoid stored lang preference interfering
    localStorage.clear();
  });

  it("sets document.documentElement.lang to 'da' when setLang('da') is called", async () => {
    const { setLang } = await import("@/i18n/index");
    setLang("da");
    expect(document.documentElement.lang).toBe("da");
  });

  it("sets document.documentElement.lang to 'en' when setLang('en') is called", async () => {
    const { setLang } = await import("@/i18n/index");
    setLang("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("syncs lang attribute for all supported language codes", async () => {
    const { setLang, AVAILABLE_LANGS } = await import("@/i18n/index");
    for (const code of AVAILABLE_LANGS) {
      setLang(code);
      expect(document.documentElement.lang).toBe(code);
    }
  });
});

// ─── Property 9: Word entry cross-language marking ────────────────────────────
// Validates: Requirements 11.3, 11.4

import { LexisCard } from "@/components/LexisCard";
import type { LexisEntry } from "@/lib/lexicon";

const SAMPLE_ENTRY: LexisEntry = {
  id: "test-1",
  danish: "hund",
  english: "dog",
  notes: "",
  type: "noun",
  createdAt: 0,
};

function renderLexisCard(entry: LexisEntry = SAMPLE_ENTRY) {
  return render(
    React.createElement(LexisCard, {
      entry,
      onUpdate: async () => {},
      onDelete: async () => {},
      linkedWords: [],
    }),
  );
}

describe("Property 9: Word entry cross-language marking", () => {
  it("marks the Danish headword element with lang='da'", () => {
    const { container } = renderLexisCard();
    const daElement = container.querySelector("[lang='da']");
    expect(daElement).not.toBeNull();
    expect(daElement?.textContent).toContain(SAMPLE_ENTRY.danish);
  });

  it("marks the English translation element with lang='en'", () => {
    const { container } = renderLexisCard();
    const enElement = container.querySelector("[lang='en']");
    expect(enElement).not.toBeNull();
    expect(enElement?.textContent).toContain(SAMPLE_ENTRY.english);
  });

  it("lang='da' and lang='en' are distinct elements", () => {
    const { container } = renderLexisCard();
    const daElement = container.querySelector("[lang='da']");
    const enElement = container.querySelector("[lang='en']");
    expect(daElement).not.toBe(enElement);
  });
});
