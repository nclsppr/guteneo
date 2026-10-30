import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/belvedere-e2e",
  outputDir: "test-results/belvedere",
  workers: 1,
  timeout: 30000,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ||
          "test-results/belvedere/results.json",
      },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:8794",
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node --import tsx scripts/belvedere-preview.mjs",
    url: "http://127.0.0.1:8794",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
