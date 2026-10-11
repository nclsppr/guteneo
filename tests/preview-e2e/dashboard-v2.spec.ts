import { expect, test, type Page } from "@playwright/test";

function observeBusinessRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      /^\/(api|auth|oauth|mcp)(\/|$)/.test(new URL(request.url()).pathname)
    )
      requests.push(`${request.method()} ${request.url()}`);
  });
  return requests;
}

test("the account appearance control sits beside language and persists for this fictional preview", async ({
  page,
}) => {
  const requests = observeBusinessRequests(page);
  await page.goto("/?lang=fr#/app/account");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "classic",
  );
  await expect(page.locator(".sidebar #dashboard-appearance")).toHaveCount(0);
  const preferences = page.locator(".account-display-preferences");
  await expect(preferences.locator('select[name="language"]')).toBeVisible();
  await expect(preferences.locator("#dashboard-appearance")).toBeVisible();
  const originalHash = new URL(page.url()).hash;

  for (const appearance of ["v2", "classic", "v2"]) {
    await page.locator("#dashboard-appearance").selectOption(appearance);
    await expect(page.locator(".workspace")).toHaveAttribute(
      "data-appearance",
      appearance,
    );
    const url = new URL(page.url());
    expect(url.hash).toBe(originalHash);
    expect(url.searchParams.get("lang")).toBe("fr");
    expect(url.searchParams.get("atelier")).toBe(appearance);
  }

  await page.goto("/#/app/documents");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  await page.reload();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  // An explicit link overrides this browser's remembered choice.
  await page.goto("/?atelier=classic#/app");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "classic",
  );
  await page.goto("/#/app");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "classic",
  );
  expect(requests).toEqual([]);
});

test("the appearance control follows all four workspace languages", async ({
  page,
}) => {
  const requests = observeBusinessRequests(page);
  await page.goto("/?atelier=v2#/app/account");
  for (const [locale, label] of [
    ["fr", "Version de l’atelier"],
    ["en", "Workspace version"],
    ["de", "Version des Arbeitsbereichs"],
    ["lb", "Versioun vum Aarbechtsberäich"],
  ]) {
    await page
      .locator('#main-content select[name="language"]')
      .selectOption(locale);
    await expect(
      page.getByRole("combobox", { name: label, exact: true }),
    ).toHaveValue("v2");
  }
  // This host is a fictional model, even with the real-application appearance.
  await expect(page.locator(".simulation-banner")).toBeVisible();
  await expect(page.locator(".dashboard-v2-notice")).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("V2 prioritizes existing correspondence and puts readable content before consent", async ({
  page,
}) => {
  const requests = observeBusinessRequests(page);
  await page.goto("/?atelier=v2#/app");
  const history = page.locator("#main-content table").first();
  await expect(history.locator("tbody tr")).toHaveCount(5);
  await expect(page.locator(".dashboard-daily-shortcuts")).toBeVisible();
  await expect(page.locator(".assistant-welcome")).toHaveCount(0);
  expect(
    await history.evaluate((table) => {
      const support = document.querySelector(".dashboard-daily-shortcuts");
      return !!(
        support &&
        table.compareDocumentPosition(support) &
          Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBe(true);

  await page.goto("/?atelier=v2#/app/dispatch/preview_atelier_dispatch_1");
  const preview = page.locator(".content-preview");
  await expect(preview.locator("canvas")).toBeVisible();
  await expect(
    page
      .frameLocator(".email-preview")
      .getByText("Bonjour Camille,", { exact: true }),
  ).toBeVisible();
  const consent = page.locator(".approval-panel input[type=checkbox]").first();
  await expect(consent).not.toBeChecked();
  // Reading order is shared by keyboard and assistive technology, rather
  // than only changing the visual position of the two desktop columns.
  expect(
    await preview.evaluate((content) => {
      const approval = document.querySelector(".approval-panel");
      return !!(
        approval &&
        content.compareDocumentPosition(approval) &
          Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBe(true);
  await expect(consent).not.toBeChecked();
  await expect(
    page.getByRole("button", {
      name: "Approuver et simuler l’envoi",
      exact: true,
    }),
  ).toBeDisabled();
  await consent.focus();
  await page.keyboard.press("Space");
  await expect(consent).toBeChecked();
  await page.keyboard.press("Space");
  await expect(consent).not.toBeChecked();
  expect(requests).toEqual([]);
});

test("V2 keeps operational pages usable at a 320-pixel viewport without a backend", async ({
  page,
}) => {
  const requests = observeBusinessRequests(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 812 });
  for (const route of [
    "",
    "/documents",
    "/dispatches",
    "/prepare",
    "/account",
    "/admin",
    "/dispatch/preview_atelier_dispatch_1",
  ]) {
    await page.goto(`/?atelier=v2#/app${route}`);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await expect(page.locator(".sidebar #dashboard-appearance")).toHaveCount(0);
    if (route === "/account")
      await expect(page.locator("#dashboard-appearance")).toBeVisible();
    await expect(page.locator(".workspace")).toHaveAttribute(
      "data-appearance",
      "v2",
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(320);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});
