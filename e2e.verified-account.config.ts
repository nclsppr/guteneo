import type { E2EConfig } from "e2e";
import strict from "./e2e.config";

/** Separate run: the default fourteen strict scenarios retain their policy. */
export default {
  ...strict,
  projectId: "guteneo-verified-account-distribution",
  tests: "tests/distribution-verified-e2e/**/*.e2e.ts",
  targets: strict.targets.map((target) => ({
    ...target,
    app: {
      ...target.app,
      command: {
        ...target.app.command,
        env: {
          ...target.app.command.env,
          GUTENEO_DISTRIBUTION_E2E_AUTHENTICATION: "verified_account",
        },
      },
    },
  })),
} satisfies E2EConfig;
