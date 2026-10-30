import { defineConfig, devices } from "@playwright/test";

/** DEV-only browser fixtures; never run these journeys against an authenticated host. */
export default defineConfig({
  testDir: "tests/local-preview-e2e",
  outputDir: "test-results/local-preview",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  expect: { timeout: 12000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ||
          "reports/local-preview-playwright.json",
      },
    ],
  ],
  use: {
    locale: "fr-FR",
    actionTimeout: 12000,
    baseURL: process.env.GUTENEO_LOCAL_PREVIEW_URL || "http://127.0.0.1:8791",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
  ...(process.env.GUTENEO_LOCAL_PREVIEW_URL
    ? {}
    : {
        webServer: {
          command:
            "VITE_PUBLIC_PREVIEW=true npm run dev:web -- --host 127.0.0.1 --port 8791 --strictPort",
          url: "http://127.0.0.1:8791",
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
      }),
});
