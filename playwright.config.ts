import { defineConfig, devices } from "@playwright/test";
import bundledChromium from "@sparticuz/chromium";
const launchOptions = process.env.GUTENEO_BUNDLED_CHROMIUM
  ? {
      args: bundledChromium.args.filter(
        (a) =>
          !a.includes("single-process") &&
          !a.includes("allow-running-insecure-content") &&
          !a.includes("disable-web-security") &&
          !a.includes("disable-site-isolation-trials") &&
          !a.startsWith("--disable-features="),
      ),
      executablePath: await bundledChromium.executablePath(),
    }
  : {};
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "reports/playwright.json" }],
  ],
  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], launchOptions } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run db:migrate && npm run db:seed && npm run dev",
    url: "http://localhost:8787",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
