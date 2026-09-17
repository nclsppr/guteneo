import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type { ExpertApprovalSettings } from "../../apps/web/src/api";

// UI contract fixtures only. Every API request is intercepted; no account,
// provider, credit or authorization is changed by this suite.
async function fixture(
  page: Page,
  options: { canManage?: boolean; revoked?: boolean; failWrite?: boolean } = {},
) {
  const calls: {
    path: string;
    body: Record<string, unknown>;
    csrf: string | undefined;
  }[] = [];
  const unknown: string[] = [];
  const data: ExpertApprovalSettings = {
    canManage: options.canManage ?? true,
    day: new Date().toISOString().slice(0, 10),
    connections: [
      {
        connectionId: "fixture-connection",
        clientId: "fixture-client-" + "long-reference-".repeat(8),
        status: options.revoked ? "revoked" : "active",
        policy: null,
        usage: { count: 0, ceilingMinor: 0 },
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown;
    let status = 200;
    if (path === "/api/session")
      body = {
        organization: { id: "expert-ui-only", name: "Atelier fictif" },
        user: {
          id: "expert-ui-user",
          name: "Camille Exemple",
          role: options.canManage === false ? "member" : "admin",
        },
        csrfToken: "fixture-csrf-only",
        simulation: true,
      };
    else if (path === "/api/capabilities")
      body = { scanner: "disabled_in_local_simulation" };
    else if (path === "/api/account/sessions")
      body = { items: [], hasMore: false };
    else if (path === "/api/account/expert-approval" && method === "GET")
      body = data;
    else if (
      path === "/api/account/expert-approval/fixture-connection" &&
      method === "PUT"
    ) {
      const input = route.request().postDataJSON();
      calls.push({
        path,
        body: input,
        csrf: route.request().headers()["x-csrf-token"],
      });
      if (options.failWrite) {
        status = 409;
        body = {
          error: {
            code: "CONNECTION_REVOKED",
            message:
              "Cette connexion a été révoquée. Rechargez vos autorisations.",
          },
        };
      } else {
        data.connections[0].policy = input.enabled
          ? {
              ...input,
              revision: 1,
              updatedAt: new Date().toISOString(),
            }
          : { ...data.connections[0].policy!, enabled: false, revision: 2 };
        body = data;
      }
    } else {
      unknown.push(`${method} ${path}`);
      status = 500;
      body = {
        error: {
          code: "UNEXPECTED_UI_REQUEST",
          message: "Unexpected fixture route",
        },
      };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return { calls, unknown };
}

test("expert delegation is opt-in, binds explicit limits and can be disabled", async ({
  page,
}, info) => {
  const { calls, unknown } = await fixture(page);
  await page.goto("/#/app/account");
  const region = page.getByRole("region", { name: "Mode expert", exact: true });
  await expect(region.getByText("Désactivée", { exact: true })).toBeVisible();
  expect(calls).toEqual([]);
  await region
    .getByRole("button", { name: "Configurer la délégation" })
    .click();
  const agreement = region.getByRole("checkbox", {
    name: /^J’autorise la délégation/,
  });
  await expect(agreement).not.toBeChecked();
  await expect(
    region.getByRole("checkbox", { name: "Fax", exact: true }),
  ).toBeChecked();
  await expect(
    region.getByRole("checkbox", { name: "E-mail", exact: true }),
  ).not.toBeChecked();
  await expect(
    region.getByLabel("Plafond par envoi (€)", { exact: true }),
  ).toHaveValue("5");
  await expect(
    region.getByLabel("Plafond par jour (€)", { exact: true }),
  ).toHaveValue("25");
  await expect(
    region.getByLabel("Nombre maximal d’envois par jour"),
  ).toHaveValue("20");
  await region.getByRole("button", { name: "Confirmer l’activation" }).click();
  expect(calls).toEqual([]);
  await expect(agreement).toBeFocused();
  await region
    .getByLabel("Plafond par envoi (€)", { exact: true })
    .fill("2.35");
  await agreement.check();
  await region.getByRole("button", { name: "Confirmer l’activation" }).click();
  await expect(
    region.getByText("Délégation active", { exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].csrf).toBe("fixture-csrf-only");
  expect(calls[0].body).toMatchObject({
    enabled: true,
    channels: ["fax"],
    maxPerDispatchMinor: 235,
    maxDailyMinor: 2500,
    maxDailyCount: 20,
    acknowledgement: "delegate-approval-v1",
  });
  const expires = Date.parse(calls[0].body.expiresAt as string);
  expect(expires).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  expect(expires).toBeLessThan(Date.now() + 8 * 86_400_000);
  await mkdir("reports/screenshots/expert-ui", { recursive: true });
  await region.screenshot({
    path: `reports/screenshots/expert-ui/active-${info.project.name}.png`,
  });
  await region
    .getByRole("button", { name: "Désactiver la délégation" })
    .click();
  await expect(region.getByText("Désactivée", { exact: true })).toBeVisible();
  expect(calls[1].body).toEqual({ enabled: false });
  await expect(region).toContainText(
    "Les envois déjà acceptés restent inchangés",
  );
  expect(unknown).toEqual([]);
});

test("postal delegation asks separately for the non-sending PDF transfer and fits a narrow screen", async ({
  page,
  isMobile,
}, info) => {
  const { calls, unknown } = await fixture(page);
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#/app/account");
  const region = page.getByRole("region", { name: "Mode expert", exact: true });
  await region
    .getByRole("button", { name: "Configurer la délégation" })
    .click();
  await region
    .getByRole("checkbox", { name: "Courrier postal", exact: true })
    .check();
  const postal = region.getByRole("checkbox", {
    name: /^J’autorise aussi cet assistant/,
  });
  const agreement = region.getByRole("checkbox", {
    name: /^J’autorise la délégation/,
  });
  await expect(postal).not.toBeChecked();
  await expect(agreement).not.toBeChecked();
  await agreement.check();
  await region.getByRole("button", { name: "Confirmer l’activation" }).click();
  expect(calls).toEqual([]);
  await expect(postal).toBeFocused();
  await expect(region).toContainText("Un accès compromis");
  await agreement.uncheck();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  if (isMobile) {
    for (const input of await region.locator(".expert-limits input").all())
      expect(
        await input.evaluate((node) =>
          Number.parseFloat(getComputedStyle(node).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
  }
  await mkdir("reports/screenshots/expert-ui", { recursive: true });
  await region.screenshot({
    path: `reports/screenshots/expert-ui/form-${info.project.name}.png`,
  });
  await postal.check();
  await agreement.check();
  await region.getByRole("button", { name: "Confirmer l’activation" }).click();
  await expect(
    region.getByText("Délégation active", { exact: true }),
  ).toBeVisible();
  expect(calls[0].body.channels).toEqual(["fax", "postal"]);
  expect(unknown).toEqual([]);
});

test("expert form refuses missing channels and a daily limit below the per-send cap", async ({
  page,
}) => {
  const { calls } = await fixture(page);
  await page.goto("/#/app/account");
  const region = page.getByRole("region", { name: "Mode expert", exact: true });
  await region
    .getByRole("button", { name: "Configurer la délégation" })
    .click();
  const fax = region.getByRole("checkbox", { name: "Fax", exact: true });
  const agreement = region.getByRole("checkbox", {
    name: /^J’autorise la délégation/,
  });
  await fax.uncheck();
  await agreement.check();
  await region.getByRole("button", { name: "Confirmer l’activation" }).click();
  await expect(fax).toBeFocused();
  await expect(region).toContainText("Choisissez au moins un canal");
  await fax.check();
  await region.getByLabel("Plafond par jour (€)", { exact: true }).fill("1");
  await agreement.check();
  await region.getByRole("button", { name: "Confirmer l’activation" }).click();
  await expect(
    region.getByLabel("Plafond par jour (€)", { exact: true }),
  ).toBeFocused();
  await expect(region).toContainText("au moins égal au plafond par envoi");
  expect(calls).toEqual([]);
});

test("members and revoked connections cannot enable delegation", async ({
  page,
}) => {
  const { calls } = await fixture(page, { canManage: false });
  await page.goto("/#/app/account");
  const region = page.getByRole("region", { name: "Mode expert", exact: true });
  await expect(region).toContainText("lecture seule");
  await expect(
    region.getByRole("button", { name: "Configurer la délégation" }),
  ).toHaveCount(0);
  expect(calls).toEqual([]);
  await page.unroute("**/api/**");
  const revoked = await fixture(page, { revoked: true });
  await page.reload();
  await expect(region).toContainText("Connexion révoquée");
  await expect(
    region.getByRole("button", { name: "Configurer la délégation" }),
  ).toHaveCount(0);
  expect(revoked.calls).toEqual([]);
});

test("a rejected write never displays an active delegation", async ({
  page,
}) => {
  await fixture(page, { failWrite: true });
  await page.goto("/#/app/account");
  const region = page.getByRole("region", { name: "Mode expert", exact: true });
  await region
    .getByRole("button", { name: "Configurer la délégation" })
    .click();
  await region
    .getByRole("checkbox", { name: /^J’autorise la délégation/ })
    .check();
  await region.getByRole("button", { name: "Confirmer l’activation" }).click();
  await expect(region.getByRole("alert")).toBeFocused();
  await expect(region.getByRole("alert")).toContainText(
    "Cette connexion a été révoquée",
  );
  await expect(
    region.getByText("Délégation active", { exact: true }),
  ).toHaveCount(0);
});
