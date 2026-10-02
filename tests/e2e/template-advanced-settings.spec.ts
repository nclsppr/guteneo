import { test, expect } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type { TemplateView } from "../../packages/contracts/src/template-workflow";
import { invoiceTemplate, textBlock } from "../../packages/templates/gallery";

test("business rules edited in the studio persist and govern real PDF totals, defaults and visibility", async ({
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
  envelope.name = `Règles métier ${crypto.randomUUID().slice(0, 8)}`;
  envelope.inputSchema.properties!.showTotal = {
    type: "boolean",
    title: "Afficher le total",
  };
  envelope.inputSchema.properties!.note = { type: "string", title: "Mention" };
  envelope.inputSchema.properties!.paymentMethod = {
    type: "string",
    title: "Mode de règlement",
  };
  envelope.sampleData.showTotal = true;
  envelope.definition.schemas[0].push(
    textBlock("note", "", 20, 153, 170, 10),
    textBlock("paymentMethod", "", 20, 171, 170, 10),
  );
  for (const field of ["note", "paymentMethod"])
    envelope.bindings.push({
      block: field,
      path: field,
      kind: "value",
      format: "text",
      required: false,
    });
  const total = envelope.bindings.find((binding) => binding.block === "total")!;
  delete total.multiplyBy;
  total.format = "integer";
  const created = await page.request.post("/api/templates", {
    headers,
    data: { envelope },
  });
  expect(created.status(), await created.text()).toBe(201);
  const model = (await created.json()) as TemplateView;
  const publication = await page.request.post(
    `/api/templates/${model.id}/publish`,
    {
      headers,
      data: { expectedRevision: model.revision },
    },
  );
  expect(publication.status(), await publication.text()).toBe(200);
  await page.goto(`/#/app/template/${model.id}`);

  await page
    .getByText("Champs requis et valeurs par défaut", { exact: true })
    .click();
  await page
    .getByLabel("Champ métier à configurer", { exact: true })
    .selectOption("note");
  await page.getByLabel("Champ métier obligatoire", { exact: true }).check();
  await page
    .getByLabel("Déclarer une valeur par défaut", { exact: true })
    .check();
  await page
    .getByLabel("Valeur par défaut déclarée", { exact: true })
    .fill("MENTION PAR DÉFAUT");
  await page
    .getByRole("button", { name: "Appliquer les règles du champ", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByText("Champs requis et valeurs par défaut", { exact: true })
    .click();

  await page
    .getByText("Formats, calculs et conditions", { exact: true })
    .click();
  await page
    .getByLabel("Bloc à configurer", { exact: true })
    .selectOption("total");
  await page
    .getByLabel("Valeur à additionner", { exact: true })
    .selectOption("unitPriceMinor");
  await page
    .getByLabel("Multiplier chaque valeur par", { exact: true })
    .selectOption("quantity");
  await page
    .getByLabel("Format de ce bloc", { exact: true })
    .selectOption("money");
  await page
    .getByLabel("Devise de ce bloc", { exact: true })
    .selectOption("CHF");
  await page
    .getByLabel("Texte avant la valeur", { exact: true })
    .fill("À régler : ");
  await page
    .getByLabel("Afficher ce bloc", { exact: true })
    .selectOption("equals");
  await page
    .getByLabel("Champ de la condition", { exact: true })
    .selectOption("showTotal");
  await page
    .getByLabel("Valeur attendue pour afficher le bloc", { exact: true })
    .selectOption("true");
  await page
    .getByRole("button", { name: "Appliquer les règles du bloc", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page
    .getByLabel("Bloc à configurer", { exact: true })
    .selectOption("paymentMethod");
  await page
    .getByLabel("Déclarer une valeur de remplacement pour ce bloc", {
      exact: true,
    })
    .check();
  await page
    .getByLabel("Valeur de remplacement du bloc", { exact: true })
    .fill("Règlement par virement");
  await page
    .getByRole("button", { name: "Appliquer les règles du bloc", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);

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
  expect(saved.envelope.sampleData).toEqual(envelope.sampleData);
  expect(saved.envelope.inputSchema.required).toContain("note");
  expect(saved.envelope.inputSchema.properties?.note.default).toBe(
    "MENTION PAR DÉFAUT",
  );
  expect(
    saved.envelope.bindings.find((binding) => binding.block === "total"),
  ).toMatchObject({
    kind: "sum",
    path: "items",
    valuePath: "unitPriceMinor",
    multiplyBy: "quantity",
    format: "money",
    currency: "CHF",
    prefix: "À régler : ",
    when: { path: "showTotal", equals: true },
  });
  expect(
    saved.envelope.bindings.find((binding) => binding.block === "paymentMethod")
      ?.default,
  ).toBe("Règlement par virement");

  await page
    .getByRole("button", { name: "Données et génération", exact: true })
    .click();
  async function preview() {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/templates/${model.id}/preview`) &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Vérifier un aperçu PDF", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(201);
    const document = (await response.json()) as { id: string };
    const pdf = await page.request.get(`/api/documents/${document.id}/content`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(page.locator(".studio-result-preview canvas")).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator(".studio-result-preview")).toContainText(
      "MENTION PAR DÉFAUT",
    );
    await expect(page.locator(".studio-result-preview")).toContainText(
      "Règlement par virement",
    );
  }
  await preview();
  await expect(page.locator(".studio-result-preview")).toContainText(
    /À régler : 25,00\s+CHF/,
  );
  await page.getByLabel("Afficher le total", { exact: true }).uncheck();
  await preview();
  await expect(page.locator(".studio-result-preview")).not.toContainText(
    "À régler :",
  );
  // An absent required value with a declared default must not be blocked by
  // HTML form validation; the server applies the same default on generation.
  await page.getByLabel("Mention *", { exact: true }).fill("");
  const generationResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/generation-jobs") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Générer le PDF sans envoi", exact: true })
    .click();
  const generated = await generationResponse;
  expect(generated.status(), await generated.text()).toBe(202);
  const job = (await generated.json()) as { id: string };
  await expect
    .poll(
      async () => {
        const state = (await (
          await page.request.get(`/api/generation-jobs/${job.id}`)
        ).json()) as { state: string };
        if (["failed", "partial", "cancelled"].includes(state.state))
          throw new Error("Generation ended with " + state.state);
        return state.state;
      },
      { timeout: 90000 },
    )
    .toBe("completed");
});
