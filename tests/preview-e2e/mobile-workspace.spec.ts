import { evidencePath } from "./evidence";
import { expect, test, type Page } from "@playwright/test";

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

test("mobile navigation exposes every destination and returns focus to the opened page", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "iphone",
    "iPhone WebKit interaction coverage",
  );
  await page.goto("/#/app");
  const menu = page.locator(".workspace-navigation");
  const toggle = menu.locator("summary");
  const nav = page.getByRole("navigation", { name: "Navigation de l’atelier" });
  await expect(nav).toBeHidden();
  await toggle.click();
  await expect(nav).toBeVisible();
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(10);
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
  await page.getByLabel("Objet", { exact: true }).fill("Relecture mobile");
  await page
    .getByLabel("Version HTML", { exact: true })
    .fill("<p>Une correspondance relue sur téléphone.</p>");
  await page
    .getByLabel("Version texte", { exact: true })
    .fill("Une correspondance relue sur téléphone.");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  await fits(page);
  await expect(
    page.getByRole("button", { name: "Approuver cette version" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmer l’envoi simulé" }),
  ).toBeVisible();
  await page.goto("/#/app/dispatch/mobile-missing");
  await expect(page.getByRole("alert")).toBeFocused();
  await fits(page);
  expect(writes).toEqual([]);
});
