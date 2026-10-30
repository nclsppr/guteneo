import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

// Deliberately independent of the local application's launcher and fixtures.
// No credentials, model, video, trace, screenshot, retries or replay cache.
export default {
  projectId: "guteneo-anonymous-production",
  tests: "tests/production-e2e/**/*.e2e.ts",
  targets: [
    { name: "desktop", engine: web({ locale: "fr-FR", timezoneId: "Europe/Paris", viewport: { width: 1440, height: 900 } }),
      app: { url: "https://guteneo.com", environment: "production" } },
    { name: "phone", engine: web({ locale: "fr-FR", timezoneId: "Europe/Paris", viewport: { width: 390, height: 844 } }),
      app: { url: "https://guteneo.com", environment: "production" } },
  ],
  workers: 1, retries: 0, timeout: 20000, assertionTimeout: 5000,
  actionTimeout: 12000, maxDuration: 360000,
  output: "test-results/production-e2e-private", reporters: ["list"],
  trace: "off", video: "off", cache: "off", failOnSkippedFailure: true,
} satisfies E2EConfig;
