import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/status-e2e",
  outputDir: "test-results/status",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 5000 },
  reporter: [
    ...(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME
      ? [
          ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME }] as [
            "json",
            { outputFile: string },
          ],
        ]
      : []),
    ["list"],
    ["html", { outputFolder: "playwright-report/status", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:8799",
    locale: "fr-FR",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "node scripts/tests/status-preview.mjs",
    url: "http://127.0.0.1:8799",
    reuseExistingServer: false,
    timeout: 10000,
  },
});
