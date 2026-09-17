import { expect, test, type Page } from "./fixtures";
import type { Session } from "../../apps/web/src/api";

const origin = "http://localhost:8787";

async function login(page: Page): Promise<Session> {
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  const response = await page.request.get("/api/session");
  expect(response.status()).toBe(200);
  const session = (await response.json()) as Session;
  expect(session.simulation).toBe(true);
  return session;
}

test("profile changes persist through the browser and current-session revocation returns to login", async ({
  page,
}) => {
  const original = await login(page);
  const suffix = crypto.randomUUID().slice(0, 8);
  const userName = `Profil de contrôle ${suffix}`;
  const organizationName = `Atelier de contrôle ${suffix}`;
  try {
    await page.goto("/#/app/account");
    await page.getByLabel("Votre nom", { exact: true }).fill(userName);
    await page
      .getByLabel("Nom de l’atelier", { exact: true })
      .fill(organizationName);
    await page
      .getByRole("button", { name: "Enregistrer les modifications" })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Votre profil a été enregistré." }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Votre nom", { exact: true })).toHaveValue(
      userName,
    );
    await expect(
      page.getByLabel("Nom de l’atelier", { exact: true }),
    ).toHaveValue(organizationName);
    const persisted = (await (
      await page.request.get("/api/session")
    ).json()) as Session;
    expect(persisted.user.name).toBe(userName);
    expect(persisted.organization.name).toBe(organizationName);
  } finally {
    const restored = await page.request.patch("/api/account", {
      headers: { Origin: origin, "X-CSRF-Token": original.csrfToken },
      data: {
        userName: original.user.name,
        organizationName: original.organization.name,
      },
    });
    expect(restored.status()).toBe(200);
  }
  await page
    .getByRole("button", { name: /^Me déconnecter de la session/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrer dans l’Atelier" }),
  ).toBeVisible();
  expect((await page.request.get("/api/session")).status()).toBe(401);
});

test("the sole admin cannot demote themselves and disconnecting their access refreshes the app", async ({
  page,
}) => {
  const session = await login(page);
  await page.goto("/#/app/admin");
  const team = page.getByRole("region", { name: "Membres de l’atelier" });
  await team
    .getByLabel(`Rôle de ${session.user.name}`, { exact: true })
    .selectOption("viewer");
  await team
    .getByRole("button", {
      name: `Enregistrer le rôle de ${session.user.name}`,
    })
    .click();
  await expect(team.getByRole("alert")).toContainText(
    "au moins un administrateur",
  );
  const unchanged = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  expect(unchanged.user.role).toBe("admin");
  await team
    .getByRole("button", {
      name: `Déconnecter ${session.user.name} de cet atelier`,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrer dans l’Atelier" }),
  ).toBeVisible();
  expect((await page.request.get("/api/session")).status()).toBe(401);
});

test("account, members and billing reject a valid assistant bearer and browser writes require CSRF", async ({
  page,
}) => {
  const session = await login(page);
  const tokenResponse = await page.request.post("/api/dev/mcp-token", {
    headers: { Origin: origin, "X-CSRF-Token": session.csrfToken },
    data: {},
  });
  expect(tokenResponse.status()).toBe(200);
  const { token } = (await tokenResponse.json()) as { token: string };
  for (const path of [
    "/api/account",
    "/api/account/sessions",
    "/api/admin/members",
    "/api/billing",
    "/api/billing/invoices",
    "/api/billing/payments",
  ]) {
    const response = await page.request.get(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status(), path).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: path.startsWith("/api/billing")
          ? "BILLING_BROWSER_REQUIRED"
          : "BROWSER_REQUIRED",
      },
    });
  }
  const rejectedHeaders: Record<string, string>[] = [
    { Origin: origin },
    {
      Origin: "https://other.example.invalid",
      "X-CSRF-Token": session.csrfToken,
    },
  ];
  for (const headers of rejectedHeaders) {
    const profile = await page.request.patch("/api/account", {
      headers,
      data: { organizationName: "Unauthorized change" },
    });
    expect(profile.status()).toBe(403);
    const billing = await page.request.post("/api/billing/customer", {
      headers,
      data: {},
    });
    expect(billing.status()).toBe(403);
    const revoke = await page.request.post(
      `/api/admin/members/${session.user.id}/revoke-access`,
      { headers, data: {} },
    );
    expect(revoke.status()).toBe(403);
  }
  const unchanged = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  expect(unchanged.organization.name).toBe(session.organization.name);
});

test("billing exposes its actual connection mode and simulation consumption without inventing invoices", async ({
  page,
}) => {
  await login(page);
  const response = await page.request.get("/api/billing");
  expect(
    response.status(),
    "Billing overview must succeed before reading its fields",
  ).toBe(200);
  const overview = (await response.json()) as {
    status: string;
    mode: "live" | "test" | "unconfigured";
    portalAvailable: boolean;
    usageLedger: { kind: string };
  };
  expect(overview.usageLedger.kind).toBe("simulation");
  await page.goto("/#/app/billing");
  await expect(
    page.getByRole("heading", { name: "Facturation", exact: true }),
  ).toBeVisible();
  const dossier = page.getByRole("region", {
    name: "Votre dossier de facturation",
  });
  await expect(dossier).toContainText(
    {
      live: "COMPTE RÉEL",
      test: "ENVIRONNEMENT DE TEST",
      unconfigured: "À RACCORDER",
    }[overview.mode],
  );
  await expect(
    page.getByText("Aucune facture enregistrée pour cet espace."),
  ).toBeVisible();
  await expect(
    page.getByText("Aucun paiement enregistré pour cet espace."),
  ).toBeVisible();
  await expect(
    page.getByText("Aucun abonnement enregistré pour cet espace."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Créer mon dossier de facturation" }),
  ).toHaveCount(overview.status === "customer_required" ? 1 : 0);
  await expect(
    page.getByRole("button", { name: "Ouvrir le portail de facturation" }),
  ).toHaveCount(overview.portalAvailable ? 1 : 0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
