import { defineConfig, devices } from "@playwright/test";

/** API fixtures only: this suite never opens a real account or invokes a provider. */
export default defineConfig({
  testDir: "tests/experience-e2e",
  outputDir: "test-results/experience",
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ??
          "reports/experience-playwright.json",
      },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:8850",
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command:
      process.env.EXPERIENCE_TEST_BUILD === "1"
        ? "node node_modules/vite/bin/vite.js preview --config apps/experience/vite.config.ts --host 127.0.0.1"
        : "node node_modules/vite/bin/vite.js --config apps/experience/vite.config.ts --host 127.0.0.1",
    url: "http://127.0.0.1:8850",
    reuseExistingServer:
      !process.env.CI && process.env.EXPERIENCE_TEST_BUILD !== "1",
    timeout: 60_000,
  },
});
