import { test, expect } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type { TemplateView } from "../../packages/contracts/src/template-workflow";
import { invoiceTemplate } from "../../packages/templates/gallery";

test("web table column creates an optional money field and renders missing values blank", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Graphical template settings are qualified on desktop.");
  test.setTimeout(120000);
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  const session = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  expect(session.simulation).toBe(true);
  const headers = {
    Origin: "http://localhost:8787",
    "X-CSRF-Token": session.csrfToken,
  };
  const envelope = invoiceTemplate();
  envelope.name = `TVA facultative ${crypto.randomUUID().slice(0, 8)}`;
  const created = await page.request.post("/api/templates", {
    headers,
    data: { envelope },
  });
  expect(created.status(), await created.text()).toBe(201);
  const model = (await created.json()) as TemplateView;
  const publication = await page.request.post(
    `/api/templates/${model.id}/publish`,
    { headers, data: { expectedRevision: model.revision } },
  );
  expect(publication.status(), await publication.text()).toBe(200);
  await page.goto(`/#/app/template/${model.id}`);
  await page
    .getByText("Langue, en-tête, pied de page et nouvelles colonnes", {
      exact: true,
    })
    .click();
  await page
    .getByLabel("Libellé de la nouvelle colonne", { exact: true })
    .fill("TVA");
  await page
    .getByLabel("Identifiant de la nouvelle colonne", { exact: true })
    .fill("tvaCentimes");
  await page
    .getByLabel("Format de la nouvelle colonne", { exact: true })
    .selectOption({ label: "Montant en centimes EUR" });
  await page
    .getByRole("button", { name: "Ajouter cette colonne", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Modifications non enregistrées." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Toutes les modifications sont enregistrées." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publier la version", exact: true })
    .click();
  await expect(page.getByText(/Version publiée 2/)).toBeVisible();
  const saved = (await (
    await page.request.get(`/api/templates/${model.id}`)
  ).json()) as TemplateView;
  expect(saved.currentVersion).toBe(2);
  const itemSchema = saved.envelope.inputSchema.properties?.items.items;
  expect(itemSchema?.properties?.tvaCentimes).toEqual({
    type: "integer",
    title: "TVA",
  });
  expect(itemSchema?.required ?? []).not.toContain("tvaCentimes");
  expect(saved.envelope.sampleData).toEqual(envelope.sampleData);
  expect(
    saved.envelope.bindings.find((binding) => binding.block === "items")
      ?.columns,
  ).toContainEqual({
    title: "TVA",
    path: "tvaCentimes",
    format: "money",
    currency: "EUR",
    required: false,
  });
  expect(
    saved.envelope.definition.schemas
      .flat()
      .find((block) => block.name === "items")?.head,
  ).toContain("TVA");
  await page
    .getByRole("button", { name: "Données et génération", exact: true })
    .click();
  const previewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/templates/${model.id}/preview`) &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Vérifier un aperçu PDF", exact: true })
    .click();
  const preview = await previewResponse;
  expect(preview.status(), await preview.text()).toBe(201);
  await expect(page.locator(".studio-result-preview canvas")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".studio-result-preview")).toContainText("TVA");
  await expect(page.locator(".studio-result-preview")).not.toContainText(
    "0,00 €",
  );
});
