// Feature: wcag-3-accessibility, Property 14
// Property 14: Every form input has an associated label
// Validates: Requirements 7.1

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AddEntryForm } from "@/components/AddEntryForm";
import { StructuredImportSection } from "@/components/BulkImport/StructuredImportSection";

// Mock heavy dependencies that are not relevant to label testing
vi.mock("@/lib/gemini", () => ({
  autocompleteSingleWord: vi.fn(),
  GeminiRateLimitError: class GeminiRateLimitError extends Error {},
  GeminiUnavailableError: class GeminiUnavailableError extends Error {},
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock i18n to avoid YAML plugin issues with special characters in da.yaml
vi.mock("@/i18n", () => ({
  t: (key: string) => key,
  getLang: () => "en",
  setLang: vi.fn(),
  AVAILABLE_LANGS: ["da", "en"],
}));

// ---------------------------------------------------------------------------
// Helper: check that every input/textarea/select in a container has a label
// ---------------------------------------------------------------------------

/**
 * Returns true if the given element has an accessible label via:
 *   1. aria-label attribute
 *   2. aria-labelledby attribute pointing to an existing element
 *   3. A <label> element with htmlFor matching the element's id
 */
function hasAccessibleLabel(el: Element, container: Element): boolean {
  // 1. aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim().length > 0) return true;

  // 2. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const ids = labelledBy.trim().split(/\s+/);
    const allPresent = ids.every((id) => container.ownerDocument?.getElementById(id) !== null);
    if (allPresent) return true;
  }

  // 3. <label htmlFor="id"> pairing
  const id = el.getAttribute("id");
  if (id) {
    const label = container.ownerDocument?.querySelector(`label[for="${id}"]`);
    if (label) return true;
  }

  return false;
}

/**
 * Collects all form control elements (input, textarea, select) from a container,
 * excluding hidden inputs (type="hidden") and visually-hidden file inputs
 * that are triggered programmatically (they have aria-label set).
 */
function getFormControls(container: Element): Element[] {
  const selectors = ["input", "textarea", "select"];
  const controls: Element[] = [];
  for (const sel of selectors) {
    container.querySelectorAll(sel).forEach((el) => {
      // Skip hidden inputs (type="hidden") — they don't need visible labels
      if (el.getAttribute("type") === "hidden") return;
      controls.push(el);
    });
  }
  return controls;
}

// ---------------------------------------------------------------------------
// Property 14: AddEntryForm — all inputs have associated labels
// ---------------------------------------------------------------------------

describe("Property 14 — AddEntryForm: every form input has an associated label", () => {
  it("all inputs in AddEntryForm (type=word) have an accessible label", () => {
    const { container } = render(
      <AddEntryForm
        onAdd={vi.fn()}
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        findMatches={() => []}
      />
    );

    const controls = getFormControls(container);
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      const labeled = hasAccessibleLabel(control, container);
      if (!labeled) {
        const tag = control.tagName.toLowerCase();
        const id = control.getAttribute("id") ?? "(no id)";
        const placeholder = control.getAttribute("placeholder") ?? "(no placeholder)";
        throw new Error(
          `Form control <${tag} id="${id}" placeholder="${placeholder}"> has no accessible label`
        );
      }
    }
  });

  it("all inputs in AddEntryForm (type=noun) have an accessible label", () => {
    // Render with a wrapper that sets type to noun to exercise GrammarFields
    const { container, getByText } = render(
      <AddEntryForm
        onAdd={vi.fn()}
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        findMatches={() => []}
      />
    );

    // Click the "substantiv" (noun) type button to switch to noun mode
    // entryTypeLabel("noun") returns "substantiv" (hardcoded Danish label)
    const nounButton = getByText("substantiv");
    fireEvent.click(nounButton);

    const controls = getFormControls(container);
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      const labeled = hasAccessibleLabel(control, container);
      if (!labeled) {
        const tag = control.tagName.toLowerCase();
        const id = control.getAttribute("id") ?? "(no id)";
        const placeholder = control.getAttribute("placeholder") ?? "(no placeholder)";
        throw new Error(
          `Form control <${tag} id="${id}" placeholder="${placeholder}"> has no accessible label`
        );
      }
    }
  });

  it("all inputs in AddEntryForm (type=verb) have an accessible label", () => {
    const { container, getByText } = render(
      <AddEntryForm
        onAdd={vi.fn()}
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        findMatches={() => []}
      />
    );

    // Click the "verbum" (verb) type button to switch to verb mode
    // entryTypeLabel("verb") returns "verbum" (hardcoded Danish label)
    const verbButton = getByText("verbum");
    fireEvent.click(verbButton);

    const controls = getFormControls(container);
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      const labeled = hasAccessibleLabel(control, container);
      if (!labeled) {
        const tag = control.tagName.toLowerCase();
        const id = control.getAttribute("id") ?? "(no id)";
        const placeholder = control.getAttribute("placeholder") ?? "(no placeholder)";
        throw new Error(
          `Form control <${tag} id="${id}" placeholder="${placeholder}"> has no accessible label`
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Property 14: StructuredImportSection — all inputs have associated labels
// ---------------------------------------------------------------------------

describe("Property 14 — StructuredImportSection: every form input has an associated label", () => {
  it("all inputs in StructuredImportSection have an accessible label", () => {
    const { container } = render(
      <StructuredImportSection
        extraLanguages={[]}
        onEntriesParsed={vi.fn()}
        onError={vi.fn()}
      />
    );

    const controls = getFormControls(container);
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      const labeled = hasAccessibleLabel(control, container);
      if (!labeled) {
        const tag = control.tagName.toLowerCase();
        const id = control.getAttribute("id") ?? "(no id)";
        const placeholder = control.getAttribute("placeholder") ?? "(no placeholder)";
        const type = control.getAttribute("type") ?? "(no type)";
        throw new Error(
          `Form control <${tag} type="${type}" id="${id}" placeholder="${placeholder}"> has no accessible label`
        );
      }
    }
  });
});
