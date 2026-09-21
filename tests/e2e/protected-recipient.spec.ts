import { expect, test } from "@playwright/test";
import { protectedDocumentPage } from "../../apps/api/src/protected-document-page";

const path = `/share/${"t".repeat(43)}`;

test("recipient opens the protected document without an account or scripts", async ({
  page,
}, testInfo) => {
  const writes: string[] = [];
  await page.route(`**${path}**`, async (route) => {
    const request = route.request();
    if (request.method() === "POST") writes.push(request.postData() ?? "");
    const response = protectedDocumentPage(
      path,
      request.method() === "POST" ? "unlocked" : "locked",
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Un document vous attend." }),
  ).toBeVisible();
  await expect(
    page.getByText("Aucun compte Guteneo n’est nécessaire."),
  ).toBeVisible();
  expect(await page.locator("script").count()).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("recipient-locked.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ouvrir le document" }).click();
  expect(writes).toHaveLength(0);
  await page
    .getByLabel("Mot de passe du document")
    .fill("fictional-document-password");
  await page.getByRole("button", { name: "Ouvrir le document" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre document est prêt." }),
  ).toBeVisible();
  expect(writes).toEqual(["password=fictional-document-password"]);
  await expect(
    page.getByRole("link", { name: "Télécharger le PDF" }),
  ).toHaveAttribute("href", `${path}/content`);
  await expect(
    page.getByRole("link", { name: "Consulter le PDF" }),
  ).toHaveAttribute("href", `${path}/content?view=1`);
  await expect(
    page.getByText(/Le PDF téléchargé n’est pas protégé/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("recipient password failure is announced and unavailable links offer recovery", async ({
  page,
}) => {
  let state: "locked" | "unavailable" = "locked";
  await page.route(`**${path}**`, async (route) => {
    const response = protectedDocumentPage(
      path,
      state,
      "Ce mot de passe ne permet pas d’ouvrir le document.",
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await page.goto(path);
  await expect(page.getByRole("alert")).toHaveText(
    "Ce mot de passe ne permet pas d’ouvrir le document.",
  );
  await expect(page.getByLabel("Mot de passe du document")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Mot de passe du document")).toHaveAttribute(
    "aria-describedby",
    "password-help password-error",
  );
  state = "unavailable";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ce document n’est plus accessible." }),
  ).toBeVisible();
  await expect(
    page.getByText("Contactez l’expéditeur pour demander un nouveau lien."),
  ).toBeVisible();
  await expect(page.getByLabel("Mot de passe du document")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
