import { evidencePath } from "./evidence";
import { expect, test } from "@playwright/test";

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
