import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("public design and every workspace page render without server data or overflow", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const dataRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/(api|auth|mcp)(\/|\?|$)/.test(new URL(request.url()).pathname))
      dataRequests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Vos mots méritent de parvenir." }),
  ).toBeVisible();
  await expect(
    page.getByText("Aperçu interactif", { exact: false }),
  ).toBeVisible();
  await mkdir("reports/screenshots/preview", { recursive: true });
  await page.screenshot({
    path: `reports/screenshots/preview/landing-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Découvrir l’atelier" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  await page.screenshot({
    path: `reports/screenshots/preview/workspace-${info.project.name}.png`,
    fullPage: true,
  });
  for (const route of [
    "documents",
    "dispatches",
    "campaigns",
    "connection",
    "senders",
    "usage",
    "billing",
    "account",
    "admin",
    "prepare",
  ]) {
    await page.goto(`/#/app/${route}`);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (route === "billing") {
      const credit = page.getByRole("region", {
        name: "Un solde pour toute votre correspondance.",
      });
      await expect(credit).toContainText("EXEMPLE FICTIF");
      await expect(credit).toContainText(/50,00\s*€/);
      await expect(
        credit.getByRole("button", { name: "Ajouter du crédit" }),
      ).toBeDisabled();
      await expect(credit).toContainText(
        "La recharge sera disponible avec Stripe",
      );
      await page.screenshot({
        path: `reports/screenshots/preview/billing-${info.project.name}.png`,
        fullPage: true,
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(dataRequests).toEqual([]);
});

test("email can be prepared, reviewed and simulated in the tab only", async ({
  page,
}) => {
  const outbound: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") outbound.push(r.url());
  });
  await page.goto("/#/app/prepare");
  await page.getByRole("radio", { name: "E-mail", exact: true }).check();
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("preview@example.invalid");
  await page
    .getByLabel("Objet", { exact: true })
    .fill("Courrier de démonstration");
  await page
    .getByLabel("Version HTML", { exact: true })
    .fill("<p>Bonjour depuis l’atelier.</p>");
  await page
    .getByLabel("Version texte", { exact: true })
    .fill("Bonjour depuis l’atelier.");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await page.getByRole("button", { name: "Confirmer l’envoi simulé" }).click();
  await expect(page.locator(".simulation-banner")).toContainText(
    "Aucun fax, e-mail ou courrier réel",
  );
  await expect(page.locator(".status").first()).toContainText(
    /Remis|Transmis|Livré|Accepté|livré|remis/,
  );
  expect(outbound).toEqual([]);
});

test("fixture PDF renders and backend routes refuse remote actions", async ({
  page,
  request,
}) => {
  await page.goto("/#/app/documents");
  await page.locator("tbody .row-link").first().click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Télécharger le PDF d’exemple" }),
  ).toBeVisible();
  for (const path of [
    "/api/dev/login",
    "/api/dispatches",
    "/api/account",
    "/api/billing/customer",
    "/api/admin/members/user_atelier/revoke-access",
    "/mcp",
    "/webhooks/telnyx",
  ]) {
    const response = await request.post(path, { data: {} });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(await response.text()).toContain("PREVIEW_ONLY");
  }
});
