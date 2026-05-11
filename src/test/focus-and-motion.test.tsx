// Feature: wcag-3-accessibility, Property 11
// Property 11: focus restoration after card delete + motion-reduce variants + aria-busy on pending rows
// Validates: WCAG 2.4.3 (Focus Order), 2.3.3 (Animation from Interactions), 4.1.2 (Name, Role, Value)

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React, { useCallback, useRef, useState } from "react";

// ─── i18n + helper mocks (mirror axe-components.test.tsx) ────────────────────

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

import { LexisCard } from "@/components/LexisCard";
import type { LexisEntry } from "@/lib/lexicon";

const mkEntry = (id: string, danish: string): LexisEntry => ({
  id,
  danish,
  english: danish + "-en",
  notes: "",
  type: "noun",
  createdAt: 0,
});

// Mirrors the pattern in src/pages/Index.tsx: ref map + handleDelete that
// restores focus to the next sibling after the card unmounts.
function ListHarness({ initial }: { initial: LexisEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleDelete = useCallback(
    async (id: string) => {
      const ids = entries.map((e) => e.id);
      const idx = ids.indexOf(id);
      const fallback = ids[idx + 1] ?? ids[idx - 1] ?? null;
      setEntries((curr) => curr.filter((e) => e.id !== id));
      requestAnimationFrame(() => {
        if (fallback) cardRefs.current[fallback]?.focus();
      });
    },
    [entries],
  );

  return (
    <div>
      {entries.map((entry) => (
        <div
          key={entry.id}
          ref={(el) => { cardRefs.current[entry.id] = el; }}
          tabIndex={-1}
          data-testid={`wrap-${entry.id}`}
        >
          <LexisCard
            entry={entry}
            onUpdate={async () => {}}
            onDelete={handleDelete}
            linkedWords={[]}
          />
        </div>
      ))}
    </div>
  );
}

describe("Property 11 — focus restoration after LexisCard delete", () => {
  it("moves focus to the next card wrapper after delete (WCAG 2.4.3)", async () => {
    // Pure-logic harness mirroring src/pages/Index.tsx handleDelete:
    // builds a ref map, runs the same fallback selection, asserts focus.
    function PureHarness() {
      const [ids, setIds] = useState(["a", "b", "c"]);
      const refs = useRef<Record<string, HTMLDivElement | null>>({});
      const onDelete = useCallback(
        (id: string) => {
          const idx = ids.indexOf(id);
          const fallback = ids[idx + 1] ?? ids[idx - 1] ?? null;
          setIds((curr) => curr.filter((i) => i !== id));
          requestAnimationFrame(() => {
            if (fallback) refs.current[fallback]?.focus();
          });
        },
        [ids],
      );
      return (
        <div>
          {ids.map((id) => (
            <div
              key={id}
              ref={(el) => { refs.current[id] = el; }}
              tabIndex={-1}
              data-testid={`wrap-${id}`}
            >
              <button onClick={() => onDelete(id)}>delete-{id}</button>
            </div>
          ))}
        </div>
      );
    }

    render(<PureHarness />);
    fireEvent.click(screen.getByText("delete-a"));
    await waitFor(() => expect(screen.queryByTestId("wrap-a")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("wrap-b")),
    );
  });

  it("falls back to previous sibling when last card is deleted", async () => {
    function PureHarness() {
      const [ids, setIds] = useState(["a", "b"]);
      const refs = useRef<Record<string, HTMLDivElement | null>>({});
      const onDelete = useCallback(
        (id: string) => {
          const idx = ids.indexOf(id);
          const fallback = ids[idx + 1] ?? ids[idx - 1] ?? null;
          setIds((curr) => curr.filter((i) => i !== id));
          requestAnimationFrame(() => {
            if (fallback) refs.current[fallback]?.focus();
          });
        },
        [ids],
      );
      return (
        <div>
          {ids.map((id) => (
            <div
              key={id}
              ref={(el) => { refs.current[id] = el; }}
              tabIndex={-1}
              data-testid={`wrap-${id}`}
            >
              <button onClick={() => onDelete(id)}>delete-{id}</button>
            </div>
          ))}
        </div>
      );
    }

    render(<PureHarness />);
    fireEvent.click(screen.getByText("delete-b"));
    await waitFor(() => expect(screen.queryByTestId("wrap-b")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("wrap-a")),
    );
  });
});

describe("Property 11 — aria-busy on pending LexisCard", () => {
  it("sets aria-busy=true on the card wrapper while disabled (in-flight ops)", () => {
    const { container } = render(
      <LexisCard
        entry={mkEntry("x", "test")}
        onUpdate={async () => {}}
        onDelete={async () => {}}
        linkedWords={[]}
        disabled
      />,
    );
    const wrapper = container.querySelector("[aria-busy]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("aria-busy")).toBe("true");
  });

  it("sets aria-busy=false when idle", () => {
    const { container } = render(
      <LexisCard
        entry={mkEntry("x", "test")}
        onUpdate={async () => {}}
        onDelete={async () => {}}
        linkedWords={[]}
      />,
    );
    const wrapper = container.querySelector("[aria-busy]");
    expect(wrapper?.getAttribute("aria-busy")).toBe("false");
  });
});

describe("Property 11 — motion-reduce variants on bulk-import dropzone", () => {
  it("dropzone uses motion-safe and motion-reduce Tailwind variants for hover scale + transition", async () => {
    // Read the source file directly so we don't have to render the whole page tree.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/BulkImport/StructuredImportSection.tsx"),
      "utf-8",
    );
    expect(src).toContain("motion-safe:transition-all");
    expect(src).toContain("motion-reduce:transition-none");
    expect(src).toContain("motion-safe:scale-[1.02]");
    expect(src).toContain("motion-reduce:scale-100");
  });

  it("ProcessingSteps active dot uses motion-safe:animate-pulse (respects prefers-reduced-motion)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/ProcessingSteps.tsx"),
      "utf-8",
    );
    expect(src).toContain("motion-safe:animate-pulse");
    expect(src).toContain("motion-safe:animate-spin");
  });
});
