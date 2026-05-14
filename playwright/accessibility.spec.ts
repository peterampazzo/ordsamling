// Feature: wcag-3-accessibility, Property 11
// Property 11: axe-core zero critical/serious violations — all pages (E2E)
// Validates: Requirements 15.3, 15.4

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/app", "/import", "/quiz", "/progress", "/privacy"];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 375, height: 812 },
];

for (const path of PAGES) {
  for (const viewport of VIEWPORTS) {
    test(`${path} — zero critical/serious axe violations at ${viewport.width}px (${viewport.name})`, async ({ page }) => {
      // Feature: wcag-3-accessibility, Property 11
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();

      const critical = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(
        critical,
        `Page "${path}" at ${viewport.width}px has ${critical.length} critical/serious violation(s):\n` +
          critical
            .map(
              (v) =>
                `  [${v.impact}] ${v.id}: ${v.description}\n` +
                v.nodes
                  .map((n) => `    - ${n.html}`)
                  .join("\n")
            )
            .join("\n")
      ).toHaveLength(0);
    });
  }
}
