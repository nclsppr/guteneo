import { test as base } from "@e2e-dev/web";
import type { Browser } from "@e2e-dev/web";
import { expect, type App, type JsonValue, type Screen } from "e2e";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resetLocalFixtures } from "../e2e/local-fixture-reset";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

export { expect } from "e2e";
export { readSecureCharge } from "./secure-charge-read";

const run = promisify(execFile);

export async function resetRecipientWorkspaceFixture() {
  const state = process.env.GUTENEO_DISTRIBUTION_E2E_STATE;
  if (!state || !/^\.wrangler\/distribution-e2e-[a-f0-9-]{36}$/u.test(state))
    throw new Error("The browser fixture requires the isolated test database.");
  await resetLocalFixtures((timeout) =>
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
        "--persist-to",
        state,
        "--command",
        `INSERT OR IGNORE INTO users(id,name,email,created_at) VALUES('user_e2e_cleanup','Local fixture administrator','fixture-admin@example.invalid',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO memberships(organization_id,user_id,role,created_at) SELECT id,'user_e2e_cleanup','admin',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM organizations WHERE mode='simulation' AND name='Atelier personnel de test';
DELETE FROM browser_sessions WHERE user_id IN ('user_recipient','user_other_recipient') AND organization_id IN (SELECT id FROM organizations WHERE mode='simulation' AND name='Atelier personnel de test');
DELETE FROM personal_http_limits WHERE user_id IN ('user_recipient','user_other_recipient');
DELETE FROM personal_workspace_creations WHERE user_id IN ('user_recipient','user_other_recipient') AND organization_id IN (SELECT id FROM organizations WHERE mode='simulation' AND name='Atelier personnel de test');
DELETE FROM memberships WHERE user_id IN ('user_recipient','user_other_recipient') AND organization_id IN (SELECT id FROM organizations WHERE mode='simulation' AND name='Atelier personnel de test');
DELETE FROM browser_sessions WHERE user_id='user_recipient' AND organization_id IN (SELECT id FROM organizations WHERE id='org_studio' AND mode='simulation' AND name='Studio Papier · Simulation');
DELETE FROM memberships WHERE user_id='user_recipient' AND role='member' AND organization_id IN (SELECT id FROM organizations WHERE id='org_studio' AND mode='simulation' AND name='Studio Papier · Simulation')`,
      ],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        timeout,
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_WRITE_LOGS: "false",
        },
      },
    ),
  );
}

/** Grant only this fictional recipient operator membership in the seeded studio. */
export async function setRecipientStudioMembershipFixture(enabled: boolean) {
  const state = process.env.GUTENEO_DISTRIBUTION_E2E_STATE;
  if (!state || !/^\.wrangler\/distribution-e2e-[a-f0-9-]{36}$/u.test(state))
    throw new Error("The browser fixture requires the isolated test database.");
  await resetLocalFixtures((timeout) =>
    run(
      process.execPath,
      [
        fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
        "d1", "execute", "guteneo-local", "--local", "--persist-to", state,
        "--command",
        enabled
          ? `INSERT OR IGNORE INTO memberships(organization_id,user_id,role,created_at)
SELECT id,'user_recipient','member',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM organizations WHERE id='org_studio' AND mode='simulation' AND name='Studio Papier · Simulation'`
          : `DELETE FROM browser_sessions WHERE user_id='user_recipient' AND organization_id IN (SELECT id FROM organizations WHERE id='org_studio' AND mode='simulation' AND name='Studio Papier · Simulation');
DELETE FROM memberships WHERE user_id='user_recipient' AND role='member' AND organization_id IN (SELECT id FROM organizations WHERE id='org_studio' AND mode='simulation' AND name='Studio Papier · Simulation')`,
      ],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        timeout,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" },
      },
    ),
  );
}

/** Browser-level egress guard: these scenarios may only reach the local fixture app. */
export const test = base.extend<{ localOnly: void }>({
  localOnly: async ({ browser }, use) => {
    await browser.route("**/*", async (route) => {
      const url = new URL(route.request.url);
      if (url.origin === "http://localhost:8787") await route.continue();
      else await route.abort();
    });
    await use();
  },
});

export async function loginWorkshop(
  app: App,
  screen: Screen,
  workshop: "atelier" | "studio" = "atelier",
) {
  await app.open("/#/app");
  await screen
    .getByRole(
      "button",
      workshop === "atelier"
        ? /Entrer dans l’Atelier$/u
        : /Entrer dans le Studio$/u,
    )
    .tap();
  await expect(
    screen.getByText("Aucun fax, e-mail ou courrier réel", { exact: false }),
  ).toBeVisible();
}

export async function uploadSyntheticPdf(
  app: App,
  screen: Screen,
  browser: Browser,
  pages = 2,
) {
  const pdf = await PDFDocument.create();
  for (let page = 1; page <= pages; page++)
    pdf
      .addPage([595, 842])
      .drawText(`Guteneo synthetic confidential document - page ${page}`, {
        x: 45,
        y: 760,
      });
  const bytes = Buffer.from(await pdf.save());
  const directory = new URL(
    "../../test-results/distribution-inputs/",
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const file = new URL(`confidential-${crypto.randomUUID()}.pdf`, directory);
  await writeFile(file, bytes);
  await app.open("/#/app/documents");
  await expect(screen.getByRole("heading", "La matière première.")).toBeVisible();
  // The framework matches response URLs, not HTTP methods. Let the initial
  // GET /documents finish rendering before observing the POST on the same URL.
  await expect(
    browser.locator("main .responsive-table, main .dashboard-document-empty"),
  ).toBeVisible();
  await screen.getByRole("button", "Importer un PDF").tap();
  await screen.getByLabel("Fichier PDF").setInputFiles(fileURLToPath(file));
  const [response] = await Promise.all([
    browser.waitForResponse("**/api/documents"),
    screen.getByRole("button", "Importer et contrôler").tap(),
  ]);
  expect(response.status).toBe(201);
  const document = await response.json<{ id: string }>();
  return { id: document.id, bytes };
}

/** Calls the real local API using the current browser's cookie and CSRF token. */
export async function localApi<T extends JsonValue>(
  browser: Browser,
  path: string,
  method = "GET",
  body: JsonValue = null,
): Promise<{ status: number; body: T }> {
  if (!path.startsWith("/api/") || path.includes("://"))
    throw new Error("The distribution test API is local only.");
  return browser.evaluate(
    async ({ path, method, body }) => {
      const session = await fetch("/api/personal/session");
      const current = (await session.json()) as { csrfToken?: string };
      const response = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": current.csrfToken ?? "",
          ...(method === "GET"
            ? {}
            : { "Idempotency-Key": crypto.randomUUID() }),
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: (await response.json()) as T };
    },
    { path, method, body },
  );
}
