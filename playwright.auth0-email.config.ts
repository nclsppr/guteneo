import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/auth0-email-e2e",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: "list",
  outputDir: "reports/auth0-email-browser",
  use: {
    browserName: "chromium",
    viewport: { width: 320, height: 740 },
    trace: "retain-on-failure",
  },
});
