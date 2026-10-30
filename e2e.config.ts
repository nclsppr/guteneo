import type { E2EConfig } from "e2e";
import { distributionWeb } from "./scripts/distribution-e2e-engine";
import { distributionOrigin } from "./scripts/test-distribution-origin.mjs";

// These are deterministic browser tests. No model or hosted browser is configured.
// The command wrapper also disables the framework's telemetry before it loads.
const app = {
  url: distributionOrigin,
  command: {
    executable: process.execPath,
    args: ["scripts/test-distribution-server.mjs"],
    env: {
      E2E_TELEMETRY_DISABLED: "1",
      DO_NOT_TRACK: "1",
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_WRITE_LOGS: "false",
      LIVE_SENDS_ENABLED: "false",
    },
    inheritEnv: [
      "GUTENEO_E2E_PREBUILT",
      "GUTENEO_DISTRIBUTION_E2E_STATE",
      "GUTENEO_DISTRIBUTION_E2E_PORT",
      "GUTENEO_LOCAL_RENDERER_PORT",
    ],
    startupTimeout: 180_000,
    shutdownTimeout: 15_000,
    log: "test-results/distribution-e2e-server.log",
  },
};

export default {
  projectId: "guteneo-secure-distribution",
  tests: "tests/distribution-e2e/**/*.e2e.ts",
  targets: [
    {
      name: "desktop",
      engine: distributionWeb({
        locale: "fr-FR",
        timezoneId: "Europe/Paris",
        viewport: { width: 1440, height: 900 },
      }),
      app,
    },
    {
      name: "phone",
      engine: distributionWeb({
        locale: "fr-FR",
        timezoneId: "Europe/Paris",
        viewport: { width: 390, height: 844 },
      }),
      app,
    },
  ],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  assertionTimeout: 10_000,
  output: "test-results/distribution-e2e",
  reporters: ["list", "junit", "markdown"],
  // Network traces can contain the invitation POST body. Keep evidence scoped
  // to explicit screenshots and the sanitized operation report instead.
  trace: "off",
  video: "off",
  cache: "off",
  failOnSkippedFailure: true,
} satisfies E2EConfig;
