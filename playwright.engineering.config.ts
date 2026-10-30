import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/engineering-e2e",
  outputDir: "test-results/engineering",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "test-results/engineering-report", open: "never" },
    ],
  ],
  use: { baseURL: "http://127.0.0.1:4325", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command:
      "npm exec --prefix apps/engineering -- wrangler dev --config apps/engineering/wrangler.jsonc --local --ip 127.0.0.1 --port 4325",
    url: "http://127.0.0.1:4325",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
