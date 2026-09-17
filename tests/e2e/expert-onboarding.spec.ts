import { expect, test, type Page } from "@playwright/test";
import type { ExpertApprovalSettings } from "../../apps/web/src/api";

// Browser fixtures only: every API request is intercepted. These checks cannot
// grant a real mandate, change an account or contact a delivery provider.
async function fixture(
  page: Page,
  options: {
    policy?: "expired" | "active";
    canManage?: boolean;
    revoked?: boolean;
  } = {},
) {
  const now = Date.now();
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const unexpected: string[] = [];
  const data: ExpertApprovalSettings = {
    canManage: options.canManage ?? true,
    day: new Date(now).toISOString().slice(0, 10),
    connections: [
      {
        connectionId: "fixture-other-connection",
        clientId: "fixture-other-client",
        status: "active",
        policy: null,
        usage: { count: 0, ceilingMinor: 0 },
      },
      {
        connectionId: "fixture-selected-connection",
        clientId: "fixture-selected-client",
        status: options.revoked ? "revoked" : "active",
        policy: options.policy
          ? {
              enabled: true,
              revision: 2,
              channels: ["fax"],
              maxPerDispatchMinor: 235,
              maxDailyMinor: 1800,
              maxDailyCount: 12,
              expiresAt: new Date(
                now + (options.policy === "expired" ? -1 : 1) * 86_400_000,
              ).toISOString(),
              updatedAt: new Date(now - 2 * 86_400_000).toISOString(),
            }
          : null,
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
        organization: { id: "fixture-onboarding", name: "Atelier fictif" },
        user: {
          id: "fixture-user",
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
      path === "/api/account/expert-approval/fixture-selected-connection" &&
      method === "PUT"
    ) {
      const input = route.request().postDataJSON();
      calls.push({ path, body: input });
      data.connections[1].policy = {
        ...input,
        revision: 3,
        updatedAt: new Date().toISOString(),
      };
      body = data;
    } else {
      unexpected.push(`${method} ${path}`);
      status = 500;
      body = {
        error: { code: "UNEXPECTED_UI_REQUEST", message: "Fixture missing" },
      };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return { calls, unexpected };
}

const selectedUrl = "/#/app/account?connection=fixture-selected-connection";

test("a direct link focuses only the selected connection without granting authority", async ({
  page,
  isMobile,
}, info) => {
  const { calls, unexpected } = await fixture(page);
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${selectedUrl}&enabled=true&maxPerDispatchMinor=99999`);
  const connection = page.getByRole("article", {
    name: "Connexion choisie dans ChatGPT",
  });
  await expect(connection.getByRole("heading", { level: 3 })).toBeFocused();
  await expect(page.locator(".expert-form")).toHaveCount(1);
  await expect(connection).toContainText(
    "Ouvrir ce lien n’accorde aucune autorisation",
  );
  await expect(
    connection.getByLabel("Plafond par envoi (€)", { exact: true }),
  ).toHaveValue("5");
  const agreement = connection.getByRole("checkbox", {
    name: /^J’autorise la délégation/,
  });
  await expect(agreement).not.toBeChecked();
  const fax = connection.getByRole("checkbox", { name: "Fax", exact: true });
  if (isMobile) {
    await fax.tap();
    await expect(fax).not.toBeChecked();
    await fax.tap();
  } else {
    await page.keyboard.press("Tab");
    await expect(fax).toBeFocused();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await connection.screenshot({
    path: `test-results/expert-onboarding-${info.project.name}.png`,
  });
  await connection
    .getByRole("button", { name: "Confirmer l’activation" })
    .click();
  await expect(agreement).toBeFocused();
  expect(calls).toEqual([]);
  await agreement.check();
  await connection
    .getByRole("button", { name: "Confirmer l’activation" })
    .click();
  await expect(connection.getByRole("status")).toBeFocused();
  await expect(connection.getByRole("status")).toContainText(
    "Revenez dans ChatGPT et dites « reprends l’envoi »",
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toMatchObject({
    enabled: true,
    channels: ["fax"],
    maxPerDispatchMinor: 500,
    maxDailyMinor: 2500,
    maxDailyCount: 20,
    acknowledgement: "delegate-approval-v1",
  });
  expect(unexpected).toEqual([]);
});

test("an expired mandate keeps its limits and requires an explicit renewal", async ({
  page,
}) => {
  const { calls, unexpected } = await fixture(page, { policy: "expired" });
  await page.goto(selectedUrl);
  const connection = page.getByRole("article", {
    name: "Connexion choisie dans ChatGPT",
  });
  await expect(connection).toContainText("Délégation expirée");
  await expect(
    connection.getByLabel("Plafond par envoi (€)", { exact: true }),
  ).toHaveValue("2.35");
  await expect(
    connection.getByLabel("Plafond par jour (€)", { exact: true }),
  ).toHaveValue("18");
  await expect(
    connection.getByLabel("Nombre maximal d’envois par jour"),
  ).toHaveValue("12");
  await expect(
    connection.getByRole("checkbox", { name: /^J’autorise la délégation/ }),
  ).not.toBeChecked();
  await connection
    .getByRole("button", { name: "Annuler", exact: true })
    .click();
  const renew = connection.getByRole("button", {
    name: "Renouveler la délégation",
  });
  await expect(renew).toBeFocused();
  await renew.press("Enter");
  await connection
    .getByRole("checkbox", { name: /^J’autorise la délégation/ })
    .check();
  expect(calls).toEqual([]);
  await connection
    .getByRole("button", { name: "Confirmer le renouvellement" })
    .click();
  expect(calls).toHaveLength(1);
  expect(calls[0].body.maxPerDispatchMinor).toBe(235);
  const expiresAt = Date.parse(calls[0].body.expiresAt as string);
  expect(expiresAt).toBeGreaterThan(Date.now());
  expect(expiresAt).toBeLessThanOrEqual(Date.now() + 30 * 86_400_000);
  expect(unexpected).toEqual([]);
});

test("an active mandate is focused without opening or renewing its form", async ({
  page,
}) => {
  const { calls, unexpected } = await fixture(page, { policy: "active" });
  await page.goto(selectedUrl);
  const connection = page.getByRole("article", {
    name: "Connexion choisie dans ChatGPT",
  });
  await expect(connection.getByRole("heading", { level: 3 })).toBeFocused();
  await expect(connection).toContainText("Délégation active");
  await expect(page.locator(".expert-form")).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("foreign and malformed connection links disclose no record and trigger no mutation", async ({
  page,
}) => {
  const { calls, unexpected } = await fixture(page);
  await page.goto(selectedUrl);
  await expect(page.locator(".expert-form")).toHaveCount(1);
  for (const selection of ["foreign-connection", "%", ""]) {
    await page.goto(`/#/app/account?connection=${selection}`);
    const notice = page.getByRole("status").filter({
      hasText: "Cette connexion n’est pas disponible dans votre compte",
    });
    await expect(notice).toBeFocused();
    await expect(page.locator(".expert-form")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Connexion choisie dans ChatGPT" }),
    ).toHaveCount(0);
  }
  expect(calls).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("a direct link never opens grant controls for a member or a revoked connection", async ({
  page,
}) => {
  for (const options of [{ canManage: false }, { revoked: true }]) {
    await page.unroute("**/api/**");
    const { calls, unexpected } = await fixture(page, options);
    await page.goto(selectedUrl);
    await page.reload();
    const connection = page.getByRole("article", {
      name: "Connexion choisie dans ChatGPT",
    });
    await expect(connection.getByRole("heading", { level: 3 })).toBeFocused();
    await expect(connection.locator("form")).toHaveCount(0);
    await expect(connection.getByRole("button")).toHaveCount(0);
    expect(calls).toEqual([]);
    expect(unexpected).toEqual([]);
  }
});
