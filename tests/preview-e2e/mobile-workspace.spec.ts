import { evidencePath } from "./evidence";
import { expect, test, type Page } from "@playwright/test";
import { deferAnimationFrames } from "../fixtures/deferred-animation-frames";

async function fits(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  for (const table of await page.locator("main .table-scroll").all()) {
    expect(
      await table.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
}

test(`mobile navigation exposes every destination and returns focus to the opened page`, async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/app");
  const menu = page.locator(".workspace-navigation");
  const toggle = menu.locator("summary");
  const nav = page.getByRole("navigation", {
    name: "Navigation de l’atelier",
  });
  await expect(nav).toBeHidden();
  await toggle.click();
  await expect(nav).toBeVisible();
  const links = nav.getByRole("link");
  const destinations = [
    // The New dispatch shortcut stays on every page.
    "#/app/prepare",
    "#/app",
    "#/app/connection",
    "#/app/documents",
    "#/app/dispatches",
    "#/app/campaigns",
    "#/app/senders",
    "#/app/usage",
    "#/app/pdf-checks",
    "#/app/billing",
    "#/app/admin",
  ];
  await expect(links).toHaveCount(destinations.length);
  expect(
    await links.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")),
    ),
  ).toEqual(destinations);
  for (const link of await links.all()) {
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await link.boundingBox())?.width).toBeGreaterThanOrEqual(44);
  }
  await nav.getByRole("link", { name: "Facturation", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Facturation");
  await expect(nav).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Documents", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
  const account = page.locator(
    '.sidebar-account a.workspace-identity-profile[href="#/app/account"]',
  );
  await expect(account).toHaveCount(1);
  // One account row outside the navigation opens the profile link.
  const trigger = page.locator(".sidebar-account .workspace-identity-trigger");
  await expect(trigger).toBeVisible();
  expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(account).toBeVisible();
  expect((await account.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await account.boundingBox())?.width).toBeGreaterThanOrEqual(44);
  await account.click();
  await expect(page).toHaveURL(/#\/app\/account$/);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("main")).toBeFocused();
  await expect(account).toHaveAttribute("aria-current", "page");
  await expect(nav).toBeHidden();
});

test(`mobile Escape closes native details before its queued toggle reaches React`, async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/app");
  const menu = page.locator(".workspace-navigation");
  const summary = menu.locator("summary");
  const nav = menu.locator("nav");
  await expect(nav).toBeHidden();
  const immediate = await menu.evaluate((element: HTMLDetailsElement) => {
    // Native activation changes open synchronously; its toggle event is a
    // later task. Keep Escape in this task to reproduce that exact ordering.
    const toggle = element.querySelector("summary")!;
    toggle.click();
    const opened = element.open;
    const destination = element.querySelector<HTMLAnchorElement>(
      'a[href="#/app/documents"]',
    )!;
    destination.focus();
    destination.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    return {
      opened,
      closed: !element.open,
      summaryFocused: document.activeElement === toggle,
    };
  });
  expect(immediate).toEqual({
    opened: true,
    closed: true,
    summaryFocused: true,
  });
  await expect(nav).toBeHidden();
  await expect(summary).toBeFocused();
  // The coalesced native toggle must not restore the previous open state.
  await summary.press("Enter");
  await expect(nav).toBeVisible();
  await nav
    .getByRole("link", { name: "Documents", exact: true })
    .press("Escape");
  await expect(nav).toBeHidden();
  await expect(summary).toBeFocused();
});

test("mobile v2 account menu keeps 44 pixel items and closes on Escape or outside", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/app");
  const trigger = page.locator(".sidebar-account .workspace-identity-trigger");
  const menu = page.locator(".workspace-identity-menu");
  await expect(menu).toBeHidden();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const items = menu.locator("li > :is(a, button)");
  await expect(items).toHaveCount(4);
  for (const item of await items.all())
    expect((await item.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  // The preview has no account switching; theme and sign-out stay available.
  await expect(menu.locator(".theme-toggle")).toBeVisible();
  await expect(
    menu.getByRole("button", { name: "Se déconnecter", exact: true }),
  ).toBeVisible();
  // WebKit's native Tab skips links and buttons: focus the first item there.
  if (browserName === "webkit") await items.first().focus();
  else await page.keyboard.press("Tab");
  expect(
    await menu.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(menu).toBeVisible();
  // The open menu covers the page heading; select an uncovered area instead.
  await page.locator(".sidebar .organization").click();
  await expect(menu).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("mobile navigation preserves restored summary focus after deferred route frames", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "iphone",
    "iPhone WebKit keyboard and route-focus ordering coverage",
  );
  await page.goto("/#/app");
  const toggle = page.locator(".workspace-navigation summary");
  const nav = page.getByRole("navigation", { name: "Navigation de l’atelier" });
  await toggle.click();
  await expect(nav).toBeVisible();

  const frames = await deferAnimationFrames(page);
  try {
    await nav.getByRole("link", { name: "Facturation", exact: true }).click();
    await expect(page.locator("main h1")).toHaveText("Facturation");
    await expect(nav).toBeHidden();
    await frames.settle();
    await expect(page.locator("main")).toBeFocused();
    await toggle.focus();
    await expect(toggle).toBeFocused();
    const resumed = await frames.resume();
    expect(resumed.executed).toBeGreaterThanOrEqual(2);
    expect(resumed.probes).toBe(2);
    expect(resumed.pending).toBe(0);
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(nav).toBeVisible();
  } finally {
    await frames.restore();
  }

  // Selecting the already-open destination still closes the menu and moves
  // focus into the page, even though no route-change effect will run.
  await nav.getByRole("link", { name: "Facturation", exact: true }).click();
  await expect(nav).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(nav).toBeVisible();
});

test("mobile tables retain all fields without horizontal scrolling at 320px and in landscape", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "iphone", "iPhone WebKit reflow coverage");
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of [
      "",
      "/documents",
      "/dispatches",
      "/campaigns",
      "/connection",
      "/senders",
      "/usage",
      "/billing",
      "/account",
      "/admin",
      "/prepare",
    ]) {
      await page.goto(`/#/app${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      await fits(page);
      for (const row of await page
        .locator(".responsive-table tbody tr")
        .all()) {
        for (const cell of await row
          .locator(":scope > td, :scope > th")
          .all()) {
          await expect(cell).toBeVisible();
          await expect(cell.locator(".mobile-cell-label")).toBeVisible();
        }
      }
      for (const select of await page.locator("main select").all()) {
        expect((await select.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
});

test("mobile PDF selection, download control and close retain their focus and page bounds", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "iphone",
    "iPhone WebKit PDF interaction coverage",
  );
  await page.goto("/#/app/documents");
  const document = page.locator("tbody .row-link").first();
  await document.click();
  await expect(page.locator(".document-detail h2")).toBeFocused();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".pdf-canvas-wrap")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const download = page.getByRole("button", {
    name: "Télécharger le PDF d’exemple",
  });
  expect((await download.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await fits(page);
  await page.screenshot({
    path: await evidencePath("mobile/iphone-document.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(document).toBeFocused();
  await expect(page.locator(".document-detail")).toHaveCount(0);
});

test("mobile forms expose native validation, review and errors without a provider request", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "iphone",
    "iPhone WebKit form interaction coverage",
  );
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.goto("/#/app/prepare");
  await expect(
    page.getByRole("button", { name: "Vérifier et préparer" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Choisissez un document pour pouvoir préparer cet envoi."),
  ).toBeVisible();
  await page.getByLabel("Document", { exact: true }).selectOption({ index: 1 });
  const phone = page.getByLabel("Numéro de fax international");
  await phone.fill("123");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(phone).toBeFocused();
  expect(
    await phone.evaluate(
      (input: HTMLInputElement) => input.validity.patternMismatch,
    ),
  ).toBe(true);
  await expect(phone).toHaveAttribute("aria-describedby", /help/);
  await page
    .getByRole("radio", { name: "Courrier postal", exact: true })
    .check();
  await fits(page);
  await page.getByRole("radio", { name: "E-mail", exact: true }).check();
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("mobile@example.invalid");
  await page
    .getByLabel("Objet (facultatif)", { exact: true })
    .fill("Relecture mobile");
  await page
    .getByLabel("Message (facultatif)", { exact: true })
    .fill("Une correspondance relue sur téléphone.");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  await fits(page);
  await expect(
    page.getByRole("button", { name: "Approuver et simuler l’envoi" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Approuver et simuler l’envoi" })
    .click();
  await expect(page.locator(".dispatch-reference .status")).toContainText(
    /Remis|Accepté|livré|remis/,
  );
  await page.goto("/#/app/dispatch/mobile-missing");
  await expect(page.getByRole("alert")).toBeFocused();
  await fits(page);
  expect(writes).toEqual([]);
});
