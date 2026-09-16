import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));

export const test = base.extend<{ localRateWindow: void }>({
  localRateWindow: [
    async ({ baseURL }, use) => {
      if (baseURL !== "http://localhost:8787")
        throw new Error(
          "Browser fixtures require the local simulation server.",
        );
      // The suite reuses two fictional organizations across all browser projects.
      // Give each independent scenario its own HTTP window without changing the
      // application's production limit or its sending/content budgets.
      await run(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              "../../node_modules/wrangler/bin/wrangler.js",
              import.meta.url,
            ),
          ),
          "d1",
          "execute",
          "guteneo-local",
          "--local",
          "--config",
          fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url)),
          "--command",
          "DELETE FROM http_limits WHERE organization_id IN (SELECT id FROM organizations WHERE mode='simulation' AND id IN ('org_atelier','org_studio'))",
        ],
        {
          cwd: root,
          timeout: 30_000,
          env: {
            ...process.env,
            WRANGLER_SEND_METRICS: "false",
            WRANGLER_LOG: "error",
            WRANGLER_WRITE_LOGS: "false",
          },
        },
      );
      await use();
    },
    { auto: true },
  ],
});
