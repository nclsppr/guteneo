import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page, expiresIn = 2000) {
  const now = Date.parse("2026-09-17T12:00:00.000Z");
  await page.clock.install({ time: new Date(now - 60000) });
  await page.clock.pauseAt(new Date(now));
  const writes: { path: string; body: unknown }[] = [];
  const old = {
    id: "quote_old",
    channel: "fax",
    mode: "production",
    status: "prepared",
    recipient_json: { phone: "+352499866400" },
    sender_address: "+35220000000",
    estimated_minor: 17,
    ceiling_minor: 200,
    currency: "EUR",
    fingerprint: "a".repeat(64),
    quote_expires_at: new Date(now + expiresIn).toISOString(),
    created_at: new Date(now - 898000).toISOString(),
    updated_at: new Date(now - 898000).toISOString(),
  };
  const next = {
    ...old,
    id: "quote_new",
    fingerprint: "b".repeat(64),
    quote_expires_at: new Date(now + 900000).toISOString(),
  };
  const control = { invalidApproval: false, unavailableRenewal: false };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET")
      writes.push({ path, body: route.request().postDataJSON() });
    const error =
      path.endsWith("/approve") && control.invalidApproval
        ? {
            code: "LIVE_QUOTE_INVALID",
            message: "Le devis fax a expiré ou sa configuration a changé.",
          }
        : path.endsWith("/renew-quote") && control.unavailableRenewal
          ? {
              code: "SENDER_NOT_CONFIGURED",
              message: "Configurez et vérifiez un expéditeur pour ce canal.",
            }
          : null;
    let result: unknown;
    if (path === "/api/session")
      result = {
        organization: { id: "org_fixture", name: "Atelier de contrôle" },
        user: { id: "user_fixture", name: "Camille", role: "admin" },
        csrfToken: "fixture-only",
        simulation: false,
      };
    else if (path === "/api/capabilities") result = {};
    else if (path.endsWith("/renew-quote")) {
      if (!error) old.status = "cancelled";
      result = next;
    } else
      result = {
        dispatch: path.endsWith("quote_new") ? next : old,
        attempts: [],
        events: [],
        approval: null,
      };
    await route.fulfill({
      status: error ? 409 : 200,
      contentType: "application/json",
      body: JSON.stringify(error ? { error } : result),
    });
  });
  return { old, next, writes, control };
}

test("expiry disables approval and renewal requires a fresh explicit consent", async ({
  page,
}, testInfo) => {
  const f = await fixture(page);
  await page.goto("/#/app/dispatch/quote_old");
  const consent = page.getByRole("checkbox");
  const approve = page.getByRole("button", { name: "Approuver cette version" });
  await expect(
    page.getByText("Ce devis expire dans moins d’une minute.", { exact: true }),
  ).toBeVisible();
  await consent.check();
  await expect(approve).toBeEnabled();
  await page.clock.fastForward(3000);
  await expect(
    page.getByText("Ce devis a expiré.", { exact: true }),
  ).toBeVisible();
  await expect(approve).toBeDisabled();
  await expect(consent).toBeDisabled();
  await expect(consent).not.toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath("expired-quote.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Renouveler le devis", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/dispatch\/quote_new$/);
  await expect(consent).not.toBeChecked();
  await expect(consent).toBeEnabled();
  await expect(approve).toBeDisabled();
  await expect(page.locator(".dispatch-facts")).toContainText("+352499866400");
  await expect(page.locator(".dispatch-facts")).toContainText("2,00 €");
  expect(f.writes).toEqual([
    { path: "/api/dispatches/quote_old/renew-quote", body: {} },
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("renewed-quote.png"),
    fullPage: true,
  });
});

test("a live quote rejection offers renewal while preserving a real configuration failure", async ({
  page,
}) => {
  const f = await fixture(page, 900000);
  f.control.invalidApproval = true;
  f.control.unavailableRenewal = true;
  await page.goto("/#/app/dispatch/quote_old");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await expect(
    page.getByText("Ce devis n’est plus valable.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Renouveler le devis", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Configurez et vérifiez un expéditeur pour ce canal.",
  );
  await expect(page).toHaveURL(/quote_old$/);
  await expect(
    page.getByRole("button", { name: "Approuver cette version" }),
  ).toBeDisabled();
  expect(f.writes.map((x) => x.path)).toEqual([
    "/api/dispatches/quote_old/approve",
    "/api/dispatches/quote_old/renew-quote",
  ]);
});

for (const status of ["queued", "submission_unknown", "failed", "delivered"]) {
  test(`an expired ${status} dispatch is never offered for renewal`, async ({
    page,
  }) => {
    const f = await fixture(page, -1000);
    f.old.status = status;
    await page.goto("/#/app/dispatch/quote_old");
    await expect(page.locator(".dispatch-reference")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Renouveler le devis", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approuver cette version" }),
    ).toHaveCount(0);
    expect(f.writes).toEqual([]);
  });
}
