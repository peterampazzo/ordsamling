/**
 * Contrast token fixture for WCAG 3 accessibility tests.
 *
 * All HSL values are taken directly from src/index.css.
 * The `wcag22Ratio` and `apcaLc` fields are left undefined here —
 * they are computed at test time by contrast-utils.ts.
 *
 * Usage categories:
 *   "body"         — normal-size body text (< 18pt / 14pt bold) → WCAG 4.5:1, APCA Lc ≥ 75
 *   "large-text"   — large text (≥ 18pt / 14pt bold) or headings → WCAG 3:1, APCA Lc ≥ 60
 *   "ui-component" — non-text UI components (icons, borders, focus rings) → WCAG 3:1
 *   "muted"        — muted / supplementary labels, placeholder text → WCAG 4.5:1, APCA Lc ≥ 45
 *   "placeholder"  — placeholder text (same threshold as muted)
 */

export interface ContrastTokenPair {
  /** Human-readable description, e.g. "foreground on background (light)" */
  name: string;
  /** HSL string without the hsl() wrapper, e.g. "220 40% 13%" */
  foreground: string;
  /** HSL string without the hsl() wrapper */
  background: string;
  usage: "body" | "large-text" | "ui-component" | "muted" | "placeholder";
  theme: "light" | "dark";
  /** Computed WCAG 2.x contrast ratio — populated by tests */
  wcag22Ratio?: number;
  /** Computed APCA Lc value — populated by tests */
  apcaLc?: number;
}

// ---------------------------------------------------------------------------
// Light theme token pairs
// ---------------------------------------------------------------------------

const LIGHT_PAIRS: ContrastTokenPair[] = [
  // --- Body text ---
  {
    name: "foreground on background (light)",
    foreground: "220 40% 13%",
    background: "40 33% 97%",
    usage: "body",
    theme: "light",
  },
  {
    name: "card-foreground on card (light)",
    foreground: "220 40% 13%",
    background: "40 30% 99%",
    usage: "body",
    theme: "light",
  },
  {
    name: "secondary-foreground on secondary (light)",
    foreground: "220 40% 13%",
    background: "40 20% 93%",
    usage: "body",
    theme: "light",
  },
  {
    name: "popover-foreground on popover (light)",
    foreground: "220 40% 13%",
    background: "40 30% 99%",
    usage: "body",
    theme: "light",
  },

  // --- Large text / headings ---
  {
    name: "foreground on background — large text (light)",
    foreground: "220 40% 13%",
    background: "40 33% 97%",
    usage: "large-text",
    theme: "light",
  },
  {
    name: "primary on background — large text (light)",
    foreground: "180 30% 35%",
    background: "40 33% 97%",
    usage: "large-text",
    theme: "light",
  },
  {
    name: "accent-foreground on accent — large text (light)",
    foreground: "180 30% 25%",
    background: "180 25% 90%",
    usage: "large-text",
    theme: "light",
  },

  // --- UI components (icons, borders, focus rings) ---
  {
    name: "primary on background — UI component (light)",
    foreground: "180 30% 35%",
    background: "40 33% 97%",
    usage: "ui-component",
    theme: "light",
  },
  {
    name: "primary-foreground on primary — UI component (light)",
    foreground: "40 33% 97%",
    background: "180 30% 35%",
    usage: "ui-component",
    theme: "light",
  },
  {
    name: "destructive on background — UI component (light)",
    foreground: "0 65% 50%",
    background: "40 33% 97%",
    usage: "ui-component",
    theme: "light",
  },
  {
    name: "ring on background — focus indicator (light)",
    foreground: "180 30% 35%",
    background: "40 33% 97%",
    usage: "ui-component",
    theme: "light",
  },

  // --- Muted / supplementary labels ---
  {
    name: "muted-foreground on background (light)",
    foreground: "220 14% 38%",
    background: "40 33% 97%",
    usage: "muted",
    theme: "light",
  },
  {
    name: "muted-foreground on card (light)",
    foreground: "220 14% 38%",
    background: "40 30% 99%",
    usage: "muted",
    theme: "light",
  },
  {
    name: "muted-foreground on muted (light)",
    foreground: "220 14% 38%",
    background: "40 15% 92%",
    usage: "muted",
    theme: "light",
  },
  {
    name: "muted-foreground on secondary (light)",
    foreground: "220 14% 38%",
    background: "40 20% 93%",
    usage: "muted",
    theme: "light",
  },

  // --- Language accent labels (light, on cream bg) ---
  {
    name: "lang-da on background — language label (light)",
    foreground: "210 60% 45%",
    background: "40 33% 97%",
    usage: "muted",
    theme: "light",
  },
  {
    name: "lang-en on background — language label (light)",
    foreground: "350 55% 48%",
    background: "40 33% 97%",
    usage: "muted",
    theme: "light",
  },
  {
    name: "lang-it on background — language label (light)",
    foreground: "140 40% 34%",
    background: "40 33% 97%",
    usage: "muted",
    theme: "light",
  },

  // --- Status badge pairs (light) ---
  // Emerald badge: text on badge background
  {
    name: "emerald badge text on emerald badge bg (light)",
    foreground: "161 94% 20%",   // emerald-900 approx
    background: "152 76% 80%",   // emerald-200 approx
    usage: "muted",
    theme: "light",
  },
  // Amber badge
  {
    name: "amber badge text on amber badge bg (light)",
    foreground: "32 95% 20%",    // amber-900 approx
    background: "48 96% 77%",    // amber-200 approx
    usage: "muted",
    theme: "light",
  },
  // Blue badge
  {
    name: "blue badge text on blue badge bg (light)",
    foreground: "224 76% 22%",   // blue-900 approx
    background: "213 97% 87%",   // blue-200 approx
    usage: "muted",
    theme: "light",
  },
  // Red / destructive badge
  {
    name: "red badge text on red badge bg (light)",
    foreground: "0 74% 22%",     // red-900 approx
    background: "0 93% 82%",     // red-200 approx
    usage: "muted",
    theme: "light",
  },
];

// ---------------------------------------------------------------------------
// Dark theme token pairs
// ---------------------------------------------------------------------------

const DARK_PAIRS: ContrastTokenPair[] = [
  // --- Body text ---
  {
    name: "foreground on background (dark)",
    foreground: "210 40% 98%",
    background: "222.2 84% 4.9%",
    usage: "body",
    theme: "dark",
  },
  {
    name: "card-foreground on card (dark)",
    foreground: "210 40% 98%",
    background: "222.2 84% 4.9%",
    usage: "body",
    theme: "dark",
  },
  {
    name: "secondary-foreground on secondary (dark)",
    foreground: "210 40% 98%",
    background: "217.2 32.6% 17.5%",
    usage: "body",
    theme: "dark",
  },
  {
    name: "popover-foreground on popover (dark)",
    foreground: "210 40% 98%",
    background: "222.2 84% 4.9%",
    usage: "body",
    theme: "dark",
  },
  {
    name: "accent-foreground on accent (dark)",
    foreground: "210 40% 98%",
    background: "217.2 32.6% 17.5%",
    usage: "body",
    theme: "dark",
  },

  // --- Large text / headings ---
  {
    name: "foreground on background — large text (dark)",
    foreground: "210 40% 98%",
    background: "222.2 84% 4.9%",
    usage: "large-text",
    theme: "dark",
  },
  {
    name: "primary on background — large text (dark)",
    foreground: "210 40% 98%",
    background: "222.2 84% 4.9%",
    usage: "large-text",
    theme: "dark",
  },

  // --- UI components ---
  {
    name: "primary-foreground on primary — UI component (dark)",
    foreground: "222.2 47.4% 11.2%",
    background: "210 40% 98%",
    usage: "ui-component",
    theme: "dark",
  },
  {
    name: "ring on background — focus indicator (dark)",
    foreground: "212.7 26.8% 83.9%",
    background: "222.2 84% 4.9%",
    usage: "ui-component",
    theme: "dark",
  },
  {
    name: "destructive-foreground on destructive — UI component (dark)",
    foreground: "210 40% 98%",
    background: "0 62.8% 30.6%",
    usage: "ui-component",
    theme: "dark",
  },

  // --- Muted / supplementary labels ---
  {
    name: "muted-foreground on background (dark)",
    foreground: "215 20.2% 65.1%",
    background: "222.2 84% 4.9%",
    usage: "muted",
    theme: "dark",
  },
  {
    name: "muted-foreground on card (dark)",
    foreground: "215 20.2% 65.1%",
    background: "222.2 84% 4.9%",
    usage: "muted",
    theme: "dark",
  },
  {
    name: "muted-foreground on muted (dark)",
    foreground: "215 20.2% 65.1%",
    background: "217.2 32.6% 17.5%",
    usage: "muted",
    theme: "dark",
  },

  // --- Status badge pairs (dark) ---
  // Emerald badge
  {
    name: "emerald badge text on emerald badge bg (dark)",
    foreground: "152 76% 80%",   // emerald-200 as text on dark badge bg
    background: "161 94% 20%",   // emerald-900 as dark badge bg
    usage: "muted",
    theme: "dark",
  },
  // Amber badge
  {
    name: "amber badge text on amber badge bg (dark)",
    foreground: "48 96% 77%",    // amber-200 as text
    background: "32 95% 20%",    // amber-900 as dark badge bg
    usage: "muted",
    theme: "dark",
  },
  // Blue badge
  {
    name: "blue badge text on blue badge bg (dark)",
    foreground: "213 97% 87%",   // blue-200 as text
    background: "224 76% 22%",   // blue-900 as dark badge bg
    usage: "muted",
    theme: "dark",
  },
  // Red / destructive badge
  {
    name: "red badge text on red badge bg (dark)",
    foreground: "0 93% 82%",     // red-200 as text
    background: "0 74% 22%",     // red-900 as dark badge bg
    usage: "muted",
    theme: "dark",
  },
];

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const TOKEN_PAIRS: ContrastTokenPair[] = [...LIGHT_PAIRS, ...DARK_PAIRS];
