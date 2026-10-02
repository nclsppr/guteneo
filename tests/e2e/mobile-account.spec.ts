import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// UI-only fixtures: every API request is intercepted. No identity, provider,
// ledger or payment operation is performed by these mobile layout checks.
async function fixture(page: Page) {
  const now = "2026-09-17T10:00:00Z";
  const reference = "fixture_" + "long_reference_".repeat(12);
  const session = {
    organization: {
      id: "mobile-ui-only",
      name: "Atelier de vérification des petites largeurs",
    },
    user: { id: "mobile-user", name: "Camille Exemple", role: "admin" },
    csrfToken: "local-ui-fixture-only",
    simulation: true,
  };
  const unmatched: string[] = [];
  let rejectProfile = true;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    let body: unknown;
    let status = 200;
    if (path === "/session") body = session;
    else if (path === "/capabilities")
      body = { scanner: "disabled_in_local_simulation" };
    else if (path === "/account" && route.request().method() === "PATCH") {
      if (rejectProfile) {
        rejectProfile = false;
        status = 422;
        body = {
          error: {
            code: "INVALID_INPUT",
            message:
              "Ce nom ne peut pas être enregistré. Vérifiez les informations du profil.",
          },
        };
      } else {
        session.user.name = route.request().postDataJSON().userName;
        body = { saved: true };
      }
    } else if (path === "/account/expert-approval")
      body = { canManage: true, day: "2026-09-17", connections: [] };
    else if (path === "/account/sessions")
      body = {
        items: [
          {
            id: reference,
            createdAt: now,
            expiresAt: now,
            mfa: 1,
            development: 1,
            current: 1,
          },
        ],
        hasMore: false,
      };
    else if (path === "/billing")
      body = {
        status: "configuration_required",
        mode: "unconfigured",
        customerLinked: false,
        portalAvailable: false,
        topUpAvailable: false,
        welcomeCredit: {
          kind: "simulation",
          currency: "EUR",
          grantedMinor: 5000,
          reservedMinor: 0,
          spentMinor: 0,
          availableMinor: 5000,
          grantedAt: now,
          status: "simulation",
          renewal: "none",
          topUpAvailable: false,
        },
        subscriptions: [
          {
            id: reference,
            status: "active",
            cancel_at_period_end: 0,
            synced_at: now,
          },
        ],
        usageLedger: { kind: "simulation", period: "2026-09", channels: [] },
      };
    else if (path === "/billing/invoices")
      body = {
        items: [
          {
            id: reference,
            number: "FACTURE-EXEMPLE-2026-09",
            status: "paid",
            currency: "eur",
            total_minor: 1234,
            amount_paid_minor: 1200,
            amount_remaining_minor: 34,
            created: 1789639200,
            synced_at: now,
          },
        ],
        nextCursor: null,
      };
    else if (path === "/billing/payments")
      body = {
        items: [
          {
            id: reference,
            status: "succeeded",
            currency: "eur",
            amount_minor: 1200,
            amount_received_minor: 1200,
            created: 1789639200,
            synced_at: now,
          },
        ],
        nextCursor: null,
      };
    else if (path === "/admin/members")
      body = {
        items: [
          {
            id: "mobile-user",
            name: session.user.name,
            role: "admin",
            joinedAt: now,
            sessions: 2,
            connections: 1,
          },
        ],
        nextCursor: null,
      };
    else if (path === "/admin") body = { controls: [], deadLetters: [] };
    else if (path === "/dispatches") body = { items: [], nextCursor: null };
    else if (path === "/overview")
      body = {
        documents: 0,
        dispatches: {
          total: 0,
          approval: 0,
          in_progress: 0,
          attention: 0,
          done: 0,
        },
      };
    else {
      unmatched.push(`${route.request().method()} ${path}`);
      status = 503;
      body = {
        error: {
          code: "UI_FIXTURE_MISSING",
          message: "Donnée de test manquante.",
        },
      };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return unmatched;
}

async function fits(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  for (const table of await page.locator("main .table-scroll").all())
    expect(
      await table.evaluate((e) => e.scrollWidth - e.clientWidth),
    ).toBeLessThanOrEqual(1);
}

test("mobile private account links errors to fields and keeps every session and member action visible", async ({
  page,
  isMobile,
}, info) => {
  test.skip(!isMobile, "Mobile account layout with intercepted API fixtures");
  const unmatched = await fixture(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#/app/account");
  const name = page.getByLabel("Votre nom", { exact: true });
  await name.fill("Camille Mobile");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAttribute("aria-describedby", "account-form-error");
  await name.fill("Camille Exemple mobile");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Votre profil a été enregistré.",
  );
  await expect(
    page.getByRole("button", { name: /^Me déconnecter de la session/ }),
  ).toBeVisible();
  await fits(page);
  await page.goto("/#/app/admin");
  const team = page.getByRole("region", { name: "Membres de l’atelier" });
  const role = team.getByRole("combobox");
  await expect(role).toBeVisible();
  expect((await role.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expect(
    team.getByRole("button", { name: /^Déconnecter/ }),
  ).toBeVisible();
  await fits(page);
  await mkdir("reports/screenshots/mobile", { recursive: true });
  await page.screenshot({
    path: `reports/screenshots/mobile/team-${info.project.name}.png`,
    fullPage: true,
  });
  expect(unmatched).toEqual([]);
});

test("mobile billing preserves dates, references and all amounts while top-up remains disabled", async ({
  page,
  isMobile,
}, info) => {
  test.skip(!isMobile, "Mobile billing layout with intercepted API fixtures");
  const unmatched = await fixture(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#/app/billing");
  const invoices = page.getByRole("region", { name: "Factures", exact: true });
  await expect(invoices.getByRole("rowheader")).toContainText(
    "FACTURE-EXEMPLE-2026-09",
  );
  await expect(invoices.getByRole("rowheader")).toContainText("Actualisée le");
  for (const amount of [/12,34\s*€/, /12,00\s*€/, /0,34\s*€/])
    await expect(invoices.getByText(amount)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ajouter du crédit" }),
  ).toBeDisabled();
  for (const cell of await page
    .locator(".responsive-table tbody td, .responsive-table tbody th")
    .all()) {
    await expect(cell).toBeVisible();
    await expect(cell.locator(".mobile-cell-label")).toBeVisible();
  }
  await fits(page);
  await mkdir("reports/screenshots/mobile", { recursive: true });
  await page.screenshot({
    path: `reports/screenshots/mobile/billing-${info.project.name}.png`,
    fullPage: true,
  });
  expect(unmatched).toEqual([]);
});
