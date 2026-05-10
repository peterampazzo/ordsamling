/**
 * Playwright config for CI — used by the accessibility E2E job.
 * Does not depend on lovable-agent-playwright-config.
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";

export default defineConfig({
  testDir: "./playwright",
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
