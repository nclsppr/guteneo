import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/preview-e2e",
  outputDir: "test-results/preview",
  fullyParallel: true,
  timeout: 45000,
  expect: { timeout: 12000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/preview-playwright.json" }],
  ],
  use: {
    baseURL: process.env.GUTENEO_PREVIEW_URL || "http://127.0.0.1:8790",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
  ...(process.env.GUTENEO_PREVIEW_URL
    ? {}
    : {
        webServer: {
          command:
            "npx wrangler dev --config wrangler.preview.jsonc --port 8790 --ip 127.0.0.1",
          url: "http://127.0.0.1:8790",
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
      }),
});
