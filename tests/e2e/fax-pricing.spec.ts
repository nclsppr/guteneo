import { expect, test, type Page } from "@playwright/test";
import type { FaxPricing } from "../../packages/contracts/src/fax-pricing";

async function faxFixture(page: Page) {
  const writes: unknown[] = [];
  const dispatch = {
    id: "dispatch_fax_pricing",
    channel: "fax",
    mode: "production",
    recipient_json: { phone: "+33123456789" },
    sender_address: "+35212345678",
    status: "prepared",
    estimated_minor: 2,
    ceiling_minor: 100,
    currency: "EUR",
    fingerprint: "a".repeat(64),
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
    faxPricing: {
      version: 3,
      currency: "EUR",
      basis: "qualified_usage_ex_tax",
      estimatedLowNanoeur: 10_000_001,
      estimatedHighNanoeur: 20_000_009,
      ceilingMinor: 100,
      fx: {
        numerator: 9,
        denominator: 10,
        date: "2026-09-17",
        source: "https://www.ecb.europa.eu/",
      },
      settlement: {
        status: "not_reserved",
        customerNanoeur: null,
        chargedMinor: null,
        settledAt: null,
      },
    } as FaxPricing | undefined,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET")
      writes.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        path === "/api/session"
          ? {
              organization: {
                id: "org_fax_pricing",
                name: "Atelier de contrôle",
              },
              user: { id: "user_fax_pricing", name: "Camille", role: "admin" },
              csrfToken: "fixture-only",
              simulation: false,
            }
          : path === "/api/capabilities"
            ? {}
            : { dispatch, attempts: [], events: [], approval: null },
      ),
    });
  });
  return { dispatch, writes };
}

test("fax range and firm cap require approval of the exact version at 320px", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const { dispatch, writes } = await faxFixture(page);
  await page.goto("/#/app/dispatch/dispatch_fax_pricing");
  const facts = page.locator(".dispatch-facts");
  await expect(facts).toContainText("Fourchette estimée HT");
  await expect(facts).toContainText("0,010000001 € à 0,020000009 €");
  await expect(
    page.getByText(/Votre consommation ne dépassera pas 1,00/),
  ).toBeVisible();
  const approval = page.getByRole("button", {
    name: "Approuver cette version",
  });
  const consent = page.getByRole("checkbox", {
    name: /J’accepte une consommation variable/,
  });
  await expect(approval).toBeDisabled();
  await consent.check();
  await approval.click();
  expect(writes).toEqual([{ fingerprint: "a".repeat(64) }]);
  dispatch.fingerprint = "b".repeat(64);
  dispatch.ceiling_minor = 150;
  dispatch.faxPricing!.ceilingMinor = 150;
  await page.getByRole("button", { name: /Actualiser/ }).click();
  await expect(consent).not.toBeChecked();
  await expect(consent).toHaveAccessibleName(/1,50/);
  await expect(approval).toBeDisabled();
  expect(writes).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("fax-range-320.png"),
    fullPage: true,
  });
});

test("delivery can retain a reservation until verified fractional settlement", async ({
  page,
}) => {
  const { dispatch, writes } = await faxFixture(page);
  dispatch.status = "delivered";
  dispatch.faxPricing!.settlement.status = "reserved";
  await page.goto("/#/app/dispatch/dispatch_fax_pricing");
  await expect(
    page.getByText("Crédits en réserve", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Le décompte est en cours/)).toBeVisible();
  await expect(page.getByText("Débit du solde", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Approuver cette version" }),
  ).toHaveCount(0);
  dispatch.faxPricing!.settlement = {
    status: "settled",
    customerNanoeur: 3_000_001,
    chargedMinor: 0,
    settledAt: "2026-09-17T10:15:00Z",
  };
  await page.getByRole("button", { name: /Actualiser/ }).click();
  await expect(
    page.getByText("Crédits en réserve", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Le décompte de ce fax est terminé/),
  ).toBeVisible();
  await expect(page.locator(".dispatch-facts")).toContainText("0,003000001 €");
  await expect(page.locator(".dispatch-facts")).toContainText(
    "Débit du solde0,00 €",
  );
  expect(writes).toEqual([]);
});

test("released and legacy quotes do not claim a settled fax consumption", async ({
  page,
}) => {
  const { dispatch, writes } = await faxFixture(page);
  dispatch.status = "failed";
  dispatch.faxPricing!.settlement.status = "released";
  await page.goto("/#/app/dispatch/dispatch_fax_pricing");
  await expect(
    page.getByText(/La réservation a été libérée sans débit/),
  ).toBeVisible();
  await expect(page.getByText("Débit du solde", { exact: true })).toHaveCount(
    0,
  );
  dispatch.faxPricing = undefined;
  await page.getByRole("button", { name: /Actualiser/ }).click();
  await expect(
    page.getByText("Fourchette estimée HT", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/La réservation a été libérée sans débit/),
  ).toHaveCount(0);
  await expect(page.locator(".dispatch-facts")).toContainText("0,02 €");
  expect(writes).toEqual([]);
});
