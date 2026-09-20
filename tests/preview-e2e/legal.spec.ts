import { evidencePath } from "./evidence";
import { expect, test } from "@playwright/test";

test("privacy, terms and support work without JavaScript or account access", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    const accountRequests: string[] = [];
    page.on("request", (request) => {
      if (/^\/(api|auth|oauth|mcp)\//.test(new URL(request.url()).pathname))
        accountRequests.push(request.url());
    });
    for (const path of ["confidentialite", "conditions", "support"]) {
      const response = await page.goto(`/${path}/`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Sur cette page" }),
      ).toBeVisible();
      const links = page.locator('.legal-index a[href^="#"]');
      for (const link of await links.all()) {
        const target = await link.getAttribute("href");
        await expect(page.locator(target!)).toHaveCount(1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: await evidencePath(
          `homepage/${path}-${testInfo.project.name}.png`,
        ),
      });
    }
    await page
      .getByRole("link", { name: "Confidentialité", exact: true })
      .click();
    await expect(page).toHaveURL(/\/confidentialite\/$/);
    await page
      .getByRole("link", { name: "Exercer vos droits", exact: true })
      .click();
    await expect(page).toHaveURL(/\/confidentialite\/#droits$/);
    await expect(
      page.getByRole("heading", { name: "Exercer vos droits", exact: true }),
    ).toBeInViewport();
    await expect(page.locator("#conservation")).toContainText("90 jours");
    expect(accountRequests).toEqual([]);
  } finally {
    await context.close();
  }
});

test("legal information is public, accurate and returns to the homepage", async ({
  page,
}, testInfo) => {
  await page.goto("/#/mentions-legales");
  await expect(
    page.getByRole("heading", { name: "Mentions légales." }),
  ).toBeVisible();
  await expect(
    page.getByText("59 rue du général de Gaulle", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("57330 Hettange-Grande, France", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/L’activité n’est pas encore immatriculée/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "guteneo@pieper.fr", exact: true }).first(),
  ).toHaveAttribute("href", "mailto:guteneo@pieper.fr");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: await evidencePath(`homepage/legal-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Retour à l’accueil", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Votre assistant prépare. Guteneo transmet.",
    }),
  ).toBeVisible();
});
