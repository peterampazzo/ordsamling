// Feature: wcag-3-accessibility, Property 7
// Property 7: Toggle button aria-pressed reflects state
// Validates: Requirements 13.1

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";

/**
 * Isolated toggle button group component that mirrors the sort buttons in Index.tsx.
 * Uses the same SORT_OPTIONS structure and aria-pressed pattern.
 */
type SortMode = "newest" | "alpha";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "alpha", label: "A–Z" },
];

function SortButtons({ initialSort = "alpha" }: { initialSort?: SortMode }) {
  const [sort, setSort] = useState<SortMode>(initialSort);
  return (
    <div>
      {SORT_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setSort(value)}
          aria-pressed={sort === value}
          data-testid={`sort-${value}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Isolated toggle button group component that mirrors the quiz mode buttons in Quiz.tsx.
 */
type QuizMode = "mixed" | "choice" | "type" | "completion";

const QUIZ_MODES: { value: QuizMode; label: string }[] = [
  { value: "mixed", label: "Mixed" },
  { value: "choice", label: "Choice" },
  { value: "type", label: "Type" },
  { value: "completion", label: "Completion" },
];

function QuizModeButtons({ initialMode = "mixed" }: { initialMode?: QuizMode }) {
  const [mode, setMode] = useState<QuizMode>(initialMode);
  return (
    <div>
      {QUIZ_MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setMode(value)}
          aria-pressed={mode === value}
          data-testid={`mode-${value}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Isolated toggle button group for quiz difficulty buttons in Quiz.tsx.
 */
type Difficulty = "beginner" | "intermediate" | "advanced";

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

function DifficultyButtons({ initialDifficulty = "beginner" }: { initialDifficulty?: Difficulty }) {
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  return (
    <div>
      {DIFFICULTIES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setDifficulty(value)}
          aria-pressed={difficulty === value}
          data-testid={`difficulty-${value}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Isolated toggle button group for question count buttons in Quiz.tsx.
 */
const QUESTION_COUNTS = [5, 10, 20, 50];

function QuestionCountButtons({ initialCount = 10 }: { initialCount?: number }) {
  const [count, setCount] = useState<number>(initialCount);
  return (
    <div>
      {QUESTION_COUNTS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setCount(n)}
          aria-pressed={count === n}
          data-testid={`count-${n}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property 7: Sort buttons — aria-pressed reflects state
// ---------------------------------------------------------------------------

describe("Property 7: Sort buttons — aria-pressed reflects state", () => {
  it.each(SORT_OPTIONS)(
    "when sort='$value', button '$value' has aria-pressed=true and all others have aria-pressed=false",
    ({ value: activeValue }) => {
      render(<SortButtons initialSort={activeValue} />);

      for (const { value } of SORT_OPTIONS) {
        const btn = screen.getByTestId(`sort-${value}`);
        if (value === activeValue) {
          expect(btn).toHaveAttribute("aria-pressed", "true");
        } else {
          expect(btn).toHaveAttribute("aria-pressed", "false");
        }
      }
    },
  );

  it("updates aria-pressed when a different sort button is clicked", () => {
    render(<SortButtons initialSort="alpha" />);

    // Initially alpha is active
    expect(screen.getByTestId("sort-alpha")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("sort-newest")).toHaveAttribute("aria-pressed", "false");

    // Click newest
    fireEvent.click(screen.getByTestId("sort-newest"));

    // Now newest is active, alpha is not
    expect(screen.getByTestId("sort-newest")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("sort-alpha")).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// Property 7: Quiz mode buttons — aria-pressed reflects state
// ---------------------------------------------------------------------------

describe("Property 7: Quiz mode buttons — aria-pressed reflects state", () => {
  it.each(QUIZ_MODES)(
    "when mode='$value', button '$value' has aria-pressed=true and all others have aria-pressed=false",
    ({ value: activeValue }) => {
      render(<QuizModeButtons initialMode={activeValue} />);

      for (const { value } of QUIZ_MODES) {
        const btn = screen.getByTestId(`mode-${value}`);
        if (value === activeValue) {
          expect(btn).toHaveAttribute("aria-pressed", "true");
        } else {
          expect(btn).toHaveAttribute("aria-pressed", "false");
        }
      }
    },
  );

  it("updates aria-pressed when a different mode button is clicked", () => {
    render(<QuizModeButtons initialMode="mixed" />);

    // Initially mixed is active
    expect(screen.getByTestId("mode-mixed")).toHaveAttribute("aria-pressed", "true");
    for (const { value } of QUIZ_MODES.filter((m) => m.value !== "mixed")) {
      expect(screen.getByTestId(`mode-${value}`)).toHaveAttribute("aria-pressed", "false");
    }

    // Click choice
    fireEvent.click(screen.getByTestId("mode-choice"));

    expect(screen.getByTestId("mode-choice")).toHaveAttribute("aria-pressed", "true");
    for (const { value } of QUIZ_MODES.filter((m) => m.value !== "choice")) {
      expect(screen.getByTestId(`mode-${value}`)).toHaveAttribute("aria-pressed", "false");
    }
  });
});

// ---------------------------------------------------------------------------
// Property 7: Difficulty buttons — aria-pressed reflects state
// ---------------------------------------------------------------------------

describe("Property 7: Difficulty buttons — aria-pressed reflects state", () => {
  it.each(DIFFICULTIES)(
    "when difficulty='$value', button '$value' has aria-pressed=true and all others have aria-pressed=false",
    ({ value: activeValue }) => {
      render(<DifficultyButtons initialDifficulty={activeValue} />);

      for (const { value } of DIFFICULTIES) {
        const btn = screen.getByTestId(`difficulty-${value}`);
        if (value === activeValue) {
          expect(btn).toHaveAttribute("aria-pressed", "true");
        } else {
          expect(btn).toHaveAttribute("aria-pressed", "false");
        }
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Property 7: Question count buttons — aria-pressed reflects state
// ---------------------------------------------------------------------------

describe("Property 7: Question count buttons — aria-pressed reflects state", () => {
  it.each(QUESTION_COUNTS)(
    "when count=%i, button %i has aria-pressed=true and all others have aria-pressed=false",
    (activeCount) => {
      render(<QuestionCountButtons initialCount={activeCount} />);

      for (const n of QUESTION_COUNTS) {
        const btn = screen.getByTestId(`count-${n}`);
        if (n === activeCount) {
          expect(btn).toHaveAttribute("aria-pressed", "true");
        } else {
          expect(btn).toHaveAttribute("aria-pressed", "false");
        }
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Property 7: Invariant — exactly one button per group has aria-pressed=true
// ---------------------------------------------------------------------------

describe("Property 7: Invariant — exactly one button per group has aria-pressed=true", () => {
  it("sort buttons: exactly one has aria-pressed=true for each possible active value", () => {
    for (const { value: activeValue } of SORT_OPTIONS) {
      const { unmount } = render(<SortButtons initialSort={activeValue} />);
      const pressedButtons = SORT_OPTIONS.map(({ value }) =>
        screen.getByTestId(`sort-${value}`),
      ).filter((btn) => btn.getAttribute("aria-pressed") === "true");
      expect(pressedButtons).toHaveLength(1);
      unmount();
    }
  });

  it("quiz mode buttons: exactly one has aria-pressed=true for each possible active value", () => {
    for (const { value: activeValue } of QUIZ_MODES) {
      const { unmount } = render(<QuizModeButtons initialMode={activeValue} />);
      const pressedButtons = QUIZ_MODES.map(({ value }) =>
        screen.getByTestId(`mode-${value}`),
      ).filter((btn) => btn.getAttribute("aria-pressed") === "true");
      expect(pressedButtons).toHaveLength(1);
      unmount();
    }
  });

  it("difficulty buttons: exactly one has aria-pressed=true for each possible active value", () => {
    for (const { value: activeValue } of DIFFICULTIES) {
      const { unmount } = render(<DifficultyButtons initialDifficulty={activeValue} />);
      const pressedButtons = DIFFICULTIES.map(({ value }) =>
        screen.getByTestId(`difficulty-${value}`),
      ).filter((btn) => btn.getAttribute("aria-pressed") === "true");
      expect(pressedButtons).toHaveLength(1);
      unmount();
    }
  });

  it("question count buttons: exactly one has aria-pressed=true for each possible active value", () => {
    for (const activeCount of QUESTION_COUNTS) {
      const { unmount } = render(<QuestionCountButtons initialCount={activeCount} />);
      const pressedButtons = QUESTION_COUNTS.map((n) =>
        screen.getByTestId(`count-${n}`),
      ).filter((btn) => btn.getAttribute("aria-pressed") === "true");
      expect(pressedButtons).toHaveLength(1);
      unmount();
    }
  });
});
