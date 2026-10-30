import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test as base } from "@playwright/test";
import { resetLocalFixtures } from "./local-fixture-reset";

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
      // Give each independent scenario its own HTTP/content usage window. The
      // daily upload/render limits remain unchanged and are enforced inside each
      // scenario; repeated full suites must not exhaust yesterday's fixtures.
      // Account language and the retired `classic` layout value are saved on the fictional user;
      // storing `classic` keeps proving that the web ignores it. Reset both for each
      // independent scenario, including after an interrupted preceding test.
      // This only touches the two seeded simulation organizations, never sending
      // credit, sending quotas, limits, customer content or production state.
      // The preceding scenario's local queue may briefly retain the D1 file
      // lock. Repeating these three idempotent statements is safe, but only an
      // explicit SQLITE_BUSY may retry, within one bounded reset budget.
      await resetLocalFixtures((timeoutMs) =>
        run(
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
            "DELETE FROM http_limits WHERE organization_id IN (SELECT id FROM organizations WHERE mode='simulation' AND id IN ('org_atelier','org_studio')); DELETE FROM content_usage WHERE organization_id IN (SELECT id FROM organizations WHERE mode='simulation' AND id IN ('org_atelier','org_studio')); UPDATE users SET preferred_locale=NULL, preferred_dashboard_appearance='classic' WHERE id IN ('user_atelier','user_studio') AND EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=users.id AND o.mode='simulation' AND o.id IN ('org_atelier','org_studio')) AND NOT EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=users.id AND o.mode<>'simulation')",
          ],
          {
            cwd: root,
            timeout: timeoutMs,
            env: {
              ...process.env,
              WRANGLER_SEND_METRICS: "false",
              WRANGLER_LOG: "error",
              WRANGLER_WRITE_LOGS: "false",
            },
          },
        ),
      );
      await use();
    },
    { auto: true },
  ],
});
