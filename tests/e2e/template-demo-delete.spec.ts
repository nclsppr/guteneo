import { mkdir } from "node:fs/promises";
import { test, expect, type Page } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type { TemplateView } from "../../packages/contracts/src/template-workflow";

async function login(page: Page) {
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  const session = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  expect(session.simulation).toBe(true);
}

async function createDemo(page: Page, name: string) {
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/templates") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: `Créer ma copie privée de ${name}`,
      exact: true,
    })
    .click();
  const response = await created;
  expect(response.status(), await response.text()).toBe(201);
  const model = (await response.json()) as TemplateView;
  expect(model.visibility).toBe("private");
  expect(model.canDelete).toBe(true);
  await expect(page).toHaveURL(new RegExp(`#/app/template/${model.id}$`));
  await expect(page.getByLabel("Nom du modèle", { exact: true })).toHaveValue(
    name,
  );
  return model;
}

async function findLibraryModel(page: Page, name: string) {
  const row = page.locator(".studio-list-row").filter({
    has: page.getByRole("link", { name, exact: true }),
  });
  await expect
    .poll(async () => {
      if (await row.count()) return true;
      const more = page.getByRole("button", {
        name: "Afficher la suite",
        exact: true,
      });
      if (await more.count()) await more.click();
      return false;
    })
    .toBe(true);
  return row;
}

async function assertRemoved(page: Page, id: string) {
  const missing = await page.request.get(`/api/templates/${id}`);
  expect(missing.status()).toBe(404);
  const direct = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/templates/${id}`) &&
      response.request().method() === "GET",
  );
  await page.goto(`/#/app/template/${id}`);
  expect((await direct).status()).toBe(404);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Nom du modèle", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.locator('a.back-link[href="#/app/templates"]'),
  ).toBeVisible();
}

test("demo copy can be edited, saved and deleted from the library after keyboard cancellation", async ({
  page,
  browserName,
  isMobile,
}, testInfo) => {
  await login(page);
  for (const [locale, heading, quote] of [
    ["en", "Demo templates", "Demo quotation"],
    ["de", "Demovorlagen", "Demoangebot"],
    ["lb", "Demo-Virlagen", "Demo-Devis"],
    ["fr", "Modèles de démonstration", "Devis de démonstration"],
  ]) {
    await page.goto("/#/app/account");
    await page.locator(".language-preference select").selectOption(locale);
    await page.locator('form.form-panel button[type="submit"]').click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.goto("/#/app/templates");
    await expect(page.locator('select[name="language"]')).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".studio-gallery article")).toHaveCount(5);
    await expect(
      page
        .locator(".studio-gallery")
        .getByRole("heading", { name: quote, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByText(/Ces exemples contiennent uniquement des données fictives/),
  ).toBeVisible();
  await mkdir("reports/template-demos", { recursive: true });
  await page.locator(".studio-gallery").screenshot({
    path: `reports/template-demos/gallery-${testInfo.project.name}.png`,
  });
  const model = await createDemo(page, "Devis de démonstration");
  const name = `Devis client synthétique ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nom du modèle", { exact: true }).fill(name);
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/templates/${model.id}`) &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  const saved = await savedResponse;
  expect(saved.status(), await saved.text()).toBe(200);
  const updated = (await saved.json()) as TemplateView;
  expect(updated.envelope.name).toBe(name);
  await expect(
    page.getByRole("heading", { name, level: 1, exact: true }),
  ).toBeVisible();
  if (!isMobile)
    await expect(
      page
        .locator(".studio-designer")
        .getByText("Validité du devis", { exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }),
  ).toBeDisabled();
  await page.locator('a.back-link[href="#/app/templates"]').click();
  await expect(page).toHaveURL(/#\/app\/templates$/);
  const row = await findLibraryModel(page, name);
  const trigger = row.getByRole("button", {
    name: `Supprimer le modèle ${name}`,
    exact: true,
  });
  const deleteCalls: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      request.url().endsWith(`/api/templates/${model.id}`)
    )
      deleteCalls.push(request.url());
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const confirm = row.getByRole("button", {
    name: "Supprimer le modèle",
    exact: true,
  });
  await expect(confirm).toBeFocused();
  await expect(row.getByRole("group")).toContainText(`Supprimer « ${name} » ?`);
  await expect(row.getByRole("group")).toContainText(
    "Les PDF déjà créés et leur historique seront conservés.",
  );
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab",
  );
  await expect(
    row.getByRole("button", { name: "Conserver le modèle", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect(trigger).toBeFocused();
  expect(deleteCalls).toEqual([]);
  expect((await page.request.get(`/api/templates/${model.id}`)).status()).toBe(
    200,
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await row.screenshot({
    path: `reports/template-demos/delete-private-${testInfo.project.name}.png`,
  });
  const deletedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/templates/${model.id}`) &&
      response.request().method() === "DELETE",
  );
  await page.keyboard.press("Enter");
  const deleted = await deletedResponse;
  expect(deleted.status(), await deleted.text()).toBe(200);
  expect(deleted.request().postDataJSON()).toEqual({
    expectedRevision: updated.revision,
  });
  await expect(row).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Vos modèles", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("status")).toContainText(
    `Le modèle « ${name} » a été supprimé.`,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Vos modèles", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await assertRemoved(page, model.id);
});

test("owner deletes a shared demo with unsaved edits in one named confirmation", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto("/#/app/templates");
  const model = await createDemo(page, "Bon de livraison de démonstration");
  await page.getByRole("button", { name: "Partage", exact: true }).click();
  await page
    .getByLabel("Visibilité", { exact: true })
    .selectOption("organization");
  await page
    .getByRole("checkbox", { name: /J’ai vérifié que les exemples partagés/ })
    .check();
  const sharedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/templates/${model.id}/share`) &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Enregistrer le partage", exact: true })
    .click();
  const shared = await sharedResponse;
  expect(shared.status(), await shared.text()).toBe(200);
  const updated = (await shared.json()) as TemplateView;
  expect(updated.visibility).toBe("organization");
  expect(updated.canDelete).toBe(true);
  const unsavedName = "Nom client non enregistré — conserver au retour";
  await page.getByLabel("Nom du modèle", { exact: true }).fill(unsavedName);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const trigger = page.getByRole("button", {
    name: `Supprimer le modèle ${model.name}`,
    exact: true,
  });
  await trigger.click();
  const group = page.getByRole("group", {
    name: new RegExp(`Supprimer « ${model.name} »`),
  });
  await expect(group).toContainText(
    "Ce modèle partagé sera retiré pour tous les membres de l’atelier.",
  );
  await expect(group).toContainText(
    "Les modifications non enregistrées seront aussi abandonnées.",
  );
  await group
    .getByRole("button", { name: "Conserver le modèle", exact: true })
    .click();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel("Nom du modèle", { exact: true })).toHaveValue(
    unsavedName,
  );
  expect((await page.request.get(`/api/templates/${model.id}`)).status()).toBe(
    200,
  );
  await trigger.click();
  await mkdir("reports/template-demos", { recursive: true });
  await group.screenshot({
    path: `reports/template-demos/delete-shared-dirty-${testInfo.project.name}.png`,
  });
  const deletedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/templates/${model.id}`) &&
      response.request().method() === "DELETE",
  );
  await group
    .getByRole("button", { name: "Supprimer le modèle", exact: true })
    .click();
  const deleted = await deletedResponse;
  expect(deleted.status(), await deleted.text()).toBe(200);
  expect(deleted.request().postDataJSON()).toEqual({
    expectedRevision: updated.revision,
  });
  await expect(page).toHaveURL(/#\/app\/templates$/);
  expect(dialogs).toEqual([]);
  await assertRemoved(page, model.id);
});
