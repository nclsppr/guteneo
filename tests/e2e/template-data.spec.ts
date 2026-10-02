import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type {
  GenerationJobView,
  GenerationResultView,
  Page as ApiPage,
  TemplateView,
} from "../../packages/contracts/src/template-workflow";
import type { TemplateEnvelope } from "../../packages/contracts/src/templates";
import { makeWorkbook } from "../unit/datasets-fixtures";
import {
  profileDataset,
  suggestDatasetSchemaWithOpenAI,
} from "../../packages/data";
import {
  blankTemplate,
  letterTemplate,
  textBlock,
} from "../../packages/templates/gallery";

const origin = "http://localhost:8787";
const fixture = (name: string) =>
  fileURLToPath(new URL(`../fixtures/datasets/${name}`, import.meta.url));

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
  return { Origin: origin, "X-CSRF-Token": session.csrfToken };
}
async function createPublished(
  page: Page,
  headers: Record<string, string>,
  envelope: TemplateEnvelope,
) {
  envelope.name += ` ${crypto.randomUUID().slice(0, 8)}`;
  const created = await page.request.post("/api/templates", {
    headers,
    data: { envelope },
  });
  expect(created.status(), await created.text()).toBe(201);
  const model = (await created.json()) as TemplateView;
  const published = await page.request.post(
    `/api/templates/${model.id}/publish`,
    { headers, data: { expectedRevision: model.revision } },
  );
  expect(published.status(), await published.text()).toBe(200);
  return (await published.json()) as TemplateView;
}
async function selectPublishedModel(page: Page, id: string) {
  const select = page.getByLabel("Modèle à remplir", { exact: true });
  await expect
    .poll(
      async () => {
        if (await select.locator(`option[value="${id}"]`).count()) return true;
        const next = page
          .getByRole("group", {
            name: "Autres modèles disponibles",
            exact: true,
          })
          .getByRole("button", { name: "Afficher la suite", exact: true });
        if (await next.isVisible()) await next.click();
        return false;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await select.selectOption(id);
}
async function waitGenerated(page: Page, jobId: string, total: number) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/generation-jobs/${jobId}`,
        );
        expect(response.status()).toBe(200);
        const job = (await response.json()) as GenerationJobView;
        if (["failed", "partial"].includes(job.state)) {
          const results = await (
            await page.request.get(`/api/generation-jobs/${jobId}/results`)
          ).json();
          throw new Error(
            `Generation failed: ${JSON.stringify((results.items ?? []).map((item: { state: string; errorCode: string | null }) => ({ state: item.state, errorCode: item.errorCode })))}`,
          );
        }
        return job.generated;
      },
      { timeout: 90000, intervals: [500, 1000, 2000] },
    )
    .toBe(total);
  const results = (await (
    await page.request.get(`/api/generation-jobs/${jobId}/results`)
  ).json()) as ApiPage<GenerationResultView>;
  expect(results.items).toHaveLength(total);
  expect(
    results.items.every(
      (result) =>
        result.state === "generated" &&
        result.documentStatus === "ready" &&
        result.documentHash?.length === 64,
    ),
  ).toBe(true);
  return results.items;
}
async function capture(page: Page, name: string, project: string) {
  await mkdir("reports/templates-data", { recursive: true });
  await page.screenshot({
    path: `reports/templates-data/${name}-${project}.png`,
    fullPage: true,
  });
}

test("API gallery template remains editable in the desktop studio and reusable by API", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(
    isMobile,
    "Graphical editing is qualified on desktop; mobile consultation has its own scenario.",
  );
  test.setTimeout(120000);
  const headers = await login(page);
  const model = await createPublished(page, headers, letterTemplate());
  const originalSchema = structuredClone(model.envelope.inputSchema);
  const originalBindings = structuredClone(model.envelope.bindings);
  await page.goto(`/#/app/template/${model.id}`);
  await expect(
    page.getByRole("heading", { name: model.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.studio-designer [title="reference"]'),
  ).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Libellé", { exact: true }).fill("Référence client");
  await page.getByLabel("Identifiant", { exact: true }).fill("referenceClient");
  await page
    .getByRole("button", { name: "Ajouter au document", exact: true })
    .click();
  await expect(
    page.getByText("referenceClient", { exact: true }).first(),
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
  const updated = (await (
    await page.request.get(`/api/templates/${model.id}`)
  ).json()) as TemplateView;
  expect(updated.currentVersion).toBe(2);
  for (const [name, property] of Object.entries(
    originalSchema.properties ?? {},
  ))
    expect(updated.envelope.inputSchema.properties?.[name]).toEqual(property);
  expect(updated.envelope.bindings).toEqual(
    expect.arrayContaining(originalBindings),
  );
  expect(updated.envelope.bindings).toContainEqual(
    expect.objectContaining({ path: "referenceClient", kind: "value" }),
  );
  await expect(
    page.locator('.studio-designer [title="reference"]'),
  ).toBeVisible({ timeout: 30000 });
  await capture(page, "studio-api-roundtrip", testInfo.project.name);
  const generated = await page.request.post("/api/generation-jobs", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      mode: "generate_only",
      templateId: model.id,
      templateVersion: 2,
      records: [
        {
          recordId: "cross-interface-001",
          data: { ...model.envelope.sampleData, referenceClient: "CLIENT-001" },
        },
      ],
    },
  });
  expect(generated.status(), await generated.text()).toBe(202);
  const job = (await generated.json()) as GenerationJobView;
  const results = await waitGenerated(page, job.id, 1);
  expect(results[0].recordId).toBe("cross-interface-001");
  await page.goto(`/#/app/generation/${job.id}`);
  await expect(
    page.getByRole("heading", { name: "1 / 1 PDF générés" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voir le PDF", exact: true }).click();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30000 });
  await capture(page, "generated-pdf", testInfo.project.name);
});

test("reordered CSV is mapped through the web and generates distinct PDFs without sending", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const headers = await login(page);
  const envelope = blankTemplate();
  envelope.name = "Clients CSV";
  envelope.inputSchema = {
    type: "object",
    properties: {
      customer: {
        type: "object",
        properties: {
          name: { type: "string", title: "Client" },
          postalCode: { type: "string", title: "Code postal" },
        },
        required: ["name", "postalCode"],
      },
    },
    required: ["customer"],
  };
  envelope.sampleData = {
    customer: { name: "Client synthétique", postalCode: "00120" },
  };
  envelope.definition.schemas = [
    [
      textBlock("name", "Client synthétique", 20, 35, 170),
      textBlock("postal", "00120", 20, 55, 170),
    ],
  ];
  envelope.bindings = [
    {
      block: "name",
      kind: "value",
      path: "customer.name",
      format: "text",
      required: true,
    },
    {
      block: "postal",
      kind: "value",
      path: "customer.postalCode",
      format: "text",
      required: true,
    },
  ];
  const model = await createPublished(page, headers, envelope);
  const sendMutations: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /\/api\/(dispatches|distribution-plans)|\/confirm$|\/approve$/.test(
        new URL(request.url()).pathname,
      )
    )
      sendMutations.push(request.url());
  });
  await page.goto("/#/app/datasets");
  await page
    .getByLabel("Fichier de données", { exact: true })
    .setInputFiles(fixture("clients-reordered.csv"));
  await page
    .getByRole("button", {
      name: "Importer et reconnaître les données",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "clients-reordered.csv",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Clé du document / client", { exact: true })
    .selectOption("id");
  await selectPublishedModel(page, model.id);
  await page
    .getByLabel("Colonne pour customer.name", { exact: true })
    .selectOption("name");
  await page
    .getByLabel("Colonne pour customer.postalCode", { exact: true })
    .selectOption("postal");
  await page
    .getByRole("button", { name: "Valider toutes les lignes", exact: true })
    .click();
  await expect(
    page.getByText("2 document(s) attendu(s)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Correspondance validée/)).toBeVisible();
  await capture(page, "csv-mapping", testInfo.project.name);
  await page
    .getByRole("button", { name: "Générer 2 PDF sans envoi", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/generation\/gen_/);
  const jobId = page.url().split("/generation/")[1];
  const results = await waitGenerated(page, jobId, 2);
  expect(new Set(results.map((result) => result.documentId)).size).toBe(2);
  expect(new Set(results.map((result) => result.documentHash)).size).toBe(2);
  expect(results.map((result) => result.recordId).sort()).toEqual([
    "record-2",
    "record-3",
  ]);
  await page
    .getByRole("button", { name: "Actualiser le suivi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 / 2 PDF générés" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Aucun crédit d’envoi réservé." }),
  ).toBeVisible();
  expect(sendMutations).toEqual([]);
  await capture(page, "csv-generated", testInfo.project.name);
});

test("XLSX with title rows exposes sheets and measured ambiguities on desktop and mobile", async ({
  page,
  isMobile,
}, testInfo) => {
  const headers = await login(page);
  await page.goto("/#/app/datasets");
  await page
    .getByLabel("Fichier de données", { exact: true })
    .setInputFiles(fixture("clients-articles.xlsx"));
  await page
    .getByRole("button", {
      name: "Importer et reconnaître les données",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "clients-articles.xlsx",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  const sheet = page.getByLabel("Feuille principale", { exact: true });
  await expect(sheet).toHaveValue("Clients");
  await expect(
    page.getByLabel("Ligne des en-têtes", { exact: true }),
  ).toHaveValue("2");
  await expect(page.getByText("AMBIGUOUS_DATE", { exact: true })).toBeVisible();
  await expect(page.getByText("MERGED_CELLS", { exact: true })).toBeVisible();
  await sheet.selectOption("Articles");
  await expect(page.getByText("Conseil", { exact: true })).toBeVisible();
  await capture(page, "xlsx-recognition", testInfo.project.name);
  if (isMobile) {
    const model = await createPublished(page, headers, letterTemplate());
    await page.goto(`/#/app/template/${model.id}`);
    await expect(
      page.getByText("L’édition graphique demande un écran de bureau.", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Données et génération", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Créer votre PDF", exact: true }),
    ).toBeVisible();
    await capture(page, "mobile-template-consultation", testInfo.project.name);
  }
});

test("profile pages preserve late headers and comma-separated exclusions", async ({
  page,
}, testInfo) => {
  const headers = await login(page);
  const envelope = blankTemplate();
  envelope.name = "Pagination des clients";
  envelope.inputSchema = {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  };
  envelope.sampleData = { name: "Client synthétique" };
  envelope.definition.schemas = [
    [textBlock("name", "Client synthétique", 20, 35, 170)],
  ];
  envelope.bindings = [
    {
      block: "name",
      kind: "value",
      path: "name",
      format: "text",
      required: true,
    },
  ];
  const model = await createPublished(page, headers, envelope);
  const workbook = makeWorkbook([
    {
      name: "Clients",
      rows: [
        ...Array.from({ length: 39 }, (_, index) => [`Notice ${index + 1}`]),
        ["name", "postal"],
        ...Array.from({ length: 35 }, (_, index) => [
          `Client ${index + 1}`,
          "00120",
        ]),
      ],
    },
    {
      name: "Compléments",
      rows: [
        ["name"],
        ...Array.from({ length: 65 }, (_, index) => [
          `Complément ${index + 1}`,
        ]),
      ],
    },
  ]);
  await page.goto("/#/app/datasets");
  await page.getByLabel("Fichier de données", { exact: true }).setInputFiles({
    name: "clients-pagination.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(workbook),
  });
  await page
    .getByRole("button", {
      name: "Importer et reconnaître les données",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "clients-pagination.xlsx",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  const headerRow = page.getByLabel("Ligne des en-têtes", { exact: true });
  // WebKit can leave an off-screen number input unchanged during fill while
  // the surrounding form renders. Enter through the visible, focused control.
  await headerRow.scrollIntoViewIfNeeded();
  await headerRow.click();
  await headerRow.fill("40");
  await expect(headerRow).toHaveValue("40");
  await expect(
    page
      .getByLabel("Clé du document / client", { exact: true })
      .locator("option"),
  ).toContainText(["Une ligne par document", "name", "postal"]);
  await selectPublishedModel(page, model.id);
  await expect(
    page.getByLabel("Colonne pour name", { exact: true }),
  ).toHaveValue("name");
  const preview = page.getByRole("table", { name: /Aperçu original/ });
  await expect(preview).toHaveAccessibleName(/Clients : lignes 1 à 30 sur 75/);
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await expect(preview).toHaveAccessibleName(/Clients : lignes 31 à 60 sur 75/);
  await expect(preview).toContainText("Client 20");
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await expect(preview).toHaveAccessibleName(/Clients : lignes 61 à 75 sur 75/);
  await expect(
    page.getByRole("button", { name: "Page suivante", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Page précédente", exact: true })
    .click();
  await expect(preview).toHaveAccessibleName(/Clients : lignes 31 à 60 sur 75/);
  await page
    .getByRole("button", { name: "Première page", exact: true })
    .click();
  await expect(preview).toHaveAccessibleName(/Clients : lignes 1 à 30 sur 75/);
  await page
    .getByLabel("Feuille de l’aperçu", { exact: true })
    .selectOption("Compléments");
  await expect(preview).toHaveAccessibleName(
    /Compléments : lignes 1 à 30 sur 66/,
  );
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await expect(preview).toHaveAccessibleName(
    /Compléments : lignes 31 à 60 sur 66/,
  );
  await expect(
    page.getByLabel("Feuille principale", { exact: true }),
  ).toHaveValue("Clients");
  await expect(
    page.getByLabel("Ligne des en-têtes", { exact: true }),
  ).toHaveValue("40");
  await expect(
    page.getByLabel("Colonne pour name", { exact: true }),
  ).toHaveValue("name");
  const excluded = page.getByLabel("Lignes à exclure explicitement", {
    exact: true,
  });
  await excluded.pressSequentially("41,");
  await expect(excluded).toHaveValue("41,");
  await excluded.pressSequentially(" 43");
  await expect(excluded).toHaveValue("41, 43");
  await excluded.press("Tab");
  await page
    .getByRole("button", { name: "Valider toutes les lignes", exact: true })
    .click();
  await expect(
    page.getByText("33 document(s) attendu(s)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Correspondance validée/)).toBeVisible();
  await capture(page, "profile-pagination", testInfo.project.name);
});

test("CSV encoding and tab separator are explicit and preserve accented source bytes", async ({
  page,
}) => {
  await login(page);
  await page.goto("/#/app/datasets");
  await page.getByText("Options CSV", { exact: true }).click();
  await page
    .getByLabel("Encodage CSV", { exact: true })
    .selectOption("windows-1252");
  await page
    .getByLabel("Séparateur CSV", { exact: true })
    .selectOption({ label: "Tabulation" });
  await page.getByLabel("Fichier de données", { exact: true }).setInputFiles({
    name: "clients-windows.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id\tname\tpostal\nA\tAndré Müller\t00120\n", "latin1"),
  });
  await page
    .getByRole("button", {
      name: "Importer et reconnaître les données",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "clients-windows.csv",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("André Müller", { exact: true })).toBeVisible();
  await expect(page.getByText("00120", { exact: true })).toBeVisible();
});

test("synthetic AI schema proposal is reviewed before real draft adoption and PDF preview", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await login(page);
  const original = new Uint8Array(
    await readFile(fixture("clients-articles.xlsx")),
  );
  const sourceProfile = await profileDataset(original, "xlsx");
  const sourceField = (source: string, target: string, type = "text") => ({
    source,
    target,
    type,
    required: true,
    dateOrder: null,
    decimalSeparator: null,
    scale: null,
  });
  // Explicit synthetic transport only. Real schema construction/validation runs;
  // the UI adoption routes and document renderer below are not intercepted.
  const syntheticProposal = {
    name:
      "Structure proposée synthétiquement " + crypto.randomUUID().slice(0, 8),
    sourceSheet: "Clients",
    headerRow: 2,
    recordKey: ["ID"],
    fields: [
      sourceField("Nom", "customer.name"),
      sourceField("Code postal", "customer.postalCode"),
    ],
    group: null,
    joins: [
      {
        sheet: "Articles",
        headerRow: 2,
        parentKey: "ID",
        childKey: "Client",
        target: "items",
        cardinality: "one-to-many",
        fields: [
          sourceField("Description", "description"),
          sourceField("Quantité", "quantity", "integer"),
          {
            ...sourceField("Prix", "unitPriceMinor", "minor"),
            decimalSeparator: ",",
            scale: 2,
          },
        ],
      },
    ],
    ambiguities: [],
  };
  const proposed = await suggestDatasetSchemaWithOpenAI(sourceProfile, {
    apiKey: "synthetic-not-a-secret",
    model: "synthetic-contract-model",
    organizationConsent: true,
    remainingCalls: 1,
    fetch: async () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: JSON.stringify(syntheticProposal) },
            ],
          },
        ],
        usage: { input_tokens: 120, output_tokens: 80 },
      }),
  });
  await page.route("**/api/dataset-ai-policy", (route) => route.fulfill({ json: { enabled: true, configured: true, transferApproved: true, dailyLimit: 10, usedToday: 0 } }));
  let proposedCalls = 0;
  await page.route("**/api/datasets/*/analyze", async (route) => {
    expect(route.request().postDataJSON().proposeSchema).toBe(true);
    proposedCalls++;
    const { records, ...validation } = proposed.validation;
    await route.fulfill({
      json: {
        ...proposed,
        validation: { ...validation, examples: records.slice(0, 3) },
      },
    });
  });
  let creations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      ["/api/templates", "/api/mappings"].includes(
        new URL(request.url()).pathname,
      )
    )
      creations++;
  });
  await page.goto("/#/app/datasets");
  await page
    .getByLabel("Fichier de données", { exact: true })
    .setInputFiles(fixture("clients-articles.xlsx"));
  await page
    .getByRole("button", {
      name: "Importer et reconnaître les données",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "clients-articles.xlsx",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Décrire le modèle à proposer", { exact: true })
    .fill(
      "Un document par client, avec les lignes d’articles dans un tableau.",
    );
  await page
    .getByRole("button", {
      name: "Proposer un nouveau modèle avec l’IA",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("table", {
      name: "Champs métier proposés et colonnes source",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("items[].unitPriceMinor", { exact: true }),
  ).toBeVisible();
  const adopt = page.getByRole("button", {
    name: "Créer le brouillon privé et sa correspondance",
    exact: true,
  });
  await expect(adopt).toBeDisabled();
  expect(creations).toBe(0);
  await page
    .getByLabel("J’ai relu les champs et les tableaux proposés.", {
      exact: true,
    })
    .check();
  await adopt.click();
  await expect(page).toHaveURL(/#\/app\/template\/tpl_/);
  expect(creations).toBe(2);
  expect(proposedCalls).toBe(1);
  const templateId = page.url().split("/template/")[1];
  const model = (await (
    await page.request.get(`/api/templates/${templateId}`)
  ).json()) as TemplateView;
  expect(model.state).toBe("draft");
  expect(model.currentVersion).toBeNull();
  expect(model.envelope.sampleDataSynthetic).toBe(true);
  expect(JSON.stringify(model.envelope.sampleData)).not.toContain("Élodie");
  expect(model.envelope.definition.schemas).toHaveLength(2);
  await page
    .getByRole("button", { name: "Données et génération", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Vérifier un aperçu PDF", exact: true })
    .click();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30000 });
  await capture(page, "dataset-schema-adoption", testInfo.project.name);
});
