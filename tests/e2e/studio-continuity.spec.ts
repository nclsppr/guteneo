import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { test, expect, type Page } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type {
  DistributionView,
  GenerationJobView,
  GenerationResultView,
  TemplateView,
} from "../../packages/contracts/src/template-workflow";
import { blankTemplate, textBlock } from "../../packages/templates/gallery";

async function completed(page: Page, id: string, count = 3) {
  await expect
    .poll(
      async () => {
        const value = (await (
          await page.request.get(`/api/generation-jobs/${id}`)
        ).json()) as GenerationJobView;
        if (value.failed)
          throw new Error(`Synthetic generation failed: ${value.state}`);
        return value.generated;
      },
      { timeout: 90_000 },
    )
    .toBe(count);
  const value = (await (
    await page.request.get(`/api/generation-jobs/${id}/results`)
  ).json()) as { items: GenerationResultView[] };
  expect(value.items.every((entry) => entry.documentStatus === "ready")).toBe(
    true,
  );
  return value.items;
}

async function pdfText(page: Page, bytes: Buffer) {
  const reader = await page.context().newPage();
  try {
    await reader.goto("about:blank");
    for (const file of ["pdf.worker.min.mjs", "pdf.min.mjs"])
      await reader.addScriptTag({
        content: await readFile(
          new URL(
            `../../node_modules/pdfjs-dist/legacy/build/${file}`,
            import.meta.url,
          ),
          "utf8",
        ),
        type: "module",
      });
    return await reader.evaluate(async (base64) => {
      const pdfjs = (
        globalThis as typeof globalThis & {
          pdfjsLib: typeof import("pdfjs-dist");
        }
      ).pdfjsLib;
      const task = pdfjs.getDocument({
        data: Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
        useSystemFonts: false,
      });
      const document = await task.promise;
      let text = "";
      for (let number = 1; number <= document.numPages; number++) {
        const content = await (await document.getPage(number)).getTextContent();
        text += content.items
          .filter((item) => "str" in item)
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
      }
      await task.destroy();
      return text;
    }, bytes.toString("base64"));
  } finally {
    await reader.close();
  }
}

// Actual local API, D1/R2 and pdfme renderer. All data and fax preparations are
// synthetic; this scenario never approves, confirms or submits a communication.
test("keeps template and mapping through source correction, then creates exact V2 PDFs without changing prepared V1", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  await page.goto("/#/app");
  await page
    .getByRole("button", { name: "Entrer dans l’espace de travail" })
    .click();
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
  const envelope = blankTemplate();
  envelope.name = `Continuity ${crypto.randomUUID().slice(0, 8)}`;
  envelope.inputSchema = {
    type: "object",
    properties: Object.fromEntries(
      ["name", "subject", "reference", "city"].map((key) => [
        key,
        { type: "string", title: key },
      ]),
    ),
    required: ["name", "subject", "reference", "city"],
  };
  envelope.sampleData = {
    name: "Example person",
    subject: "Example subject",
    reference: "EX-0",
    city: "Example city",
  };
  envelope.definition.schemas[0] = [
    ...["name", "subject", "reference", "city"].map((key, index) => ({
      ...textBlock(
        key,
        String(envelope.sampleData[key]),
        20,
        35 + index * 20,
        160,
      ),
      readOnly: false,
    })),
    textBlock("revision", "Revision one", 20, 130, 160),
  ];
  envelope.bindings = ["name", "subject", "reference", "city"].map((path) => ({
    block: path,
    kind: "value",
    path,
    format: "text",
    required: true,
  }));
  const create = await page.request.post("/api/templates", {
    headers,
    data: { envelope },
  });
  expect(create.status(), await create.text()).toBe(201);
  let model = (await create.json()) as TemplateView;
  const publish = await page.request.post(
    `/api/templates/${model.id}/publish`,
    { headers, data: { expectedRevision: model.revision } },
  );
  expect(publish.ok(), await publish.text()).toBe(true);
  model = (await publish.json()) as TemplateView;

  await page.goto(`/#/app/studio/template/${model.id}`);
  await page
    .getByRole("button", { name: "Données et génération", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Utiliser un fichier de données", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`template=${model.id}.*version=1`));
  const invalid =
    "name,subject,reference,city\nCamille Example,Subject A,REF-A,Paris\nAlex Example,Subject B,REF-B,\nMorgan Example,Subject C,REF-C,Lyon\n";
  await page.locator('input[type="file"]').setInputFiles({
    name: "missing-city.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(invalid),
  });
  await page
    .getByRole("button", {
      name: "Importer et reconnaître les données",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Modèle à remplir", { exact: true }),
  ).toHaveValue(model.id);
  await page
    .getByLabel("Lignes à exclure explicitement", { exact: true })
    .fill("4");
  await page
    .getByRole("button", { name: "Valider toutes les lignes", exact: true })
    .click();
  const warning = page
    .locator(".studio-warning-list")
    .filter({ hasText: "city" });
  await expect(warning).toContainText("Alex Example");
  await expect(warning).toContainText("D3");
  const fileDetails = page
    .locator("details")
    .filter({ has: page.locator('input[type="file"]') });
  await fileDetails.locator("summary").click();
  const corrected = invalid.replace("REF-B,\n", "REF-B,Metz\n");
  const beforeReplacement = page.url();
  await fileDetails.locator('input[type="file"]').setInputFiles({
    name: "corrected.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(corrected),
  });
  await fileDetails.locator("button").click();
  await expect(page).not.toHaveURL(beforeReplacement);
  await expect(
    page.getByLabel("Modèle à remplir", { exact: true }),
  ).toHaveValue(model.id);
  await expect(
    page.getByLabel("Lignes à exclure explicitement", { exact: true }),
  ).toHaveValue("4");
  await expect(
    page.getByLabel("Nom de la correspondance", { exact: true }),
  ).not.toHaveValue("");
  await page
    .getByLabel("Lignes à exclure explicitement", { exact: true })
    .fill("");
  await page
    .getByRole("button", { name: "Valider toutes les lignes", exact: true })
    .click();
  const firstGeneration = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/generation-jobs") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Générer 3 PDF sans envoi/ }).click();
  const generationResponse = await firstGeneration;
  expect(generationResponse.status(), await generationResponse.text()).toBe(
    202,
  );
  const first = (await generationResponse.json()) as GenerationJobView;
  expect(first.total).toBe(3);
  const v1 = await completed(page, first.id);
  await page.reload();
  await expect(
    page.getByRole("rowheader", {
      name: /Camille Example.*Subject A.*REF-A/,
    }),
  ).toBeVisible();
  const originals = new Map<string, Buffer>();
  for (const entry of v1) {
    const content = await page.request.get(
      `/api/documents/${entry.documentId}/content`,
    );
    expect(content.ok()).toBe(true);
    const bytes = await content.body();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      entry.documentHash,
    );
    originals.set(entry.recordId, bytes);
  }
  expect(new Set(v1.map((entry) => entry.documentHash)).size).toBe(3);
  const firstText = await pdfText(page, originals.get("record-2")!);
  expect(firstText).toContain("Revision one");
  expect(await pdfText(page, originals.get("record-3")!)).toContain("Metz");
  await page.getByRole("checkbox", { name: /^Sélectionner record-2/ }).check();
  await page.getByRole("checkbox", { name: /^Sélectionner record-3/ }).check();
  await page
    .getByRole("button", { name: "Préparer une distribution (2)" })
    .click();
  const group = (number: number) =>
    page.getByRole("group", {
      name: `Documents concernés par la destination ${number}`,
      exact: true,
    });
  await group(1)
    .getByRole("checkbox", { name: /Camille Example/ })
    .check();
  await page
    .getByRole("group", { name: "Destination 1", exact: true })
    .getByLabel("Numéro international", { exact: true })
    .fill("+33123456789");
  await page
    .getByRole("button", { name: "Ajouter une destination ou un canal" })
    .click();
  await group(2)
    .getByRole("checkbox", { name: /Alex Example/ })
    .check();
  await page
    .getByRole("group", { name: "Destination 2", exact: true })
    .getByLabel("Numéro international", { exact: true })
    .fill("+33123456780");
  const planned = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/distribution-plans") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Préparer les associations et les devis" })
    .click();
  const prepared = await planned;
  expect(prepared.status(), await prepared.text()).toBe(201);
  const plan = (await prepared.json()) as DistributionView;
  expect(plan.entries.map((entry) => entry.recordId).sort()).toEqual([
    "record-2",
    "record-3",
  ]);
  const frozen = await (
    await page.request.get(`/api/distribution-plans/${plan.id}`)
  ).json();

  await page.goto(`/#/app/studio/generation/${first.id}`);
  await page
    .locator(
      `a[href="#/app/studio/template/${model.id}?generation=${first.id}"]`,
    )
    .click();
  await expect(
    page.getByRole("heading", { name: model.name, exact: true }),
  ).toBeVisible();
  const updated = structuredClone(model.envelope);
  updated.definition.schemas[0].find(
    (block) => block.name === "revision",
  )!.content = "Revision two";
  const saved = await page.request.patch(`/api/templates/${model.id}`, {
    headers,
    data: { expectedRevision: model.revision, envelope: updated },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  model = (await saved.json()) as TemplateView;
  const republish = await page.request.post(
    `/api/templates/${model.id}/publish`,
    { headers, data: { expectedRevision: model.revision } },
  );
  expect(republish.ok(), await republish.text()).toBe(true);
  model = (await republish.json()) as TemplateView;
  await page.reload();
  await page
    .locator(
      `a[href*="/app/studio/dataset/${first.datasetId}?"][href*="version=2"]`,
    )
    .click();
  await expect(
    page.getByLabel("Modèle à remplir", { exact: true }),
  ).toHaveValue(model.id);
  await expect(
    page
      .getByLabel("Modèle à remplir", { exact: true })
      .locator("option:checked"),
  ).toContainText("v2");
  await page
    .getByRole("button", { name: "Valider toutes les lignes", exact: true })
    .click();
  const nextGeneration = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/generation-jobs") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Générer 3 PDF sans envoi/ }).click();
  const second = (await (await nextGeneration).json()) as GenerationJobView;
  expect(second.id).not.toBe(first.id);
  expect(second.templateVersion).toBe(2);
  const v2 = await completed(page, second.id);
  const nextPdf = await (
    await page.request.get(
      `/api/documents/${v2.find((entry) => entry.recordId === "record-2")!.documentId}/content`,
    )
  ).body();
  const nextText = await pdfText(page, nextPdf);
  expect(nextText).toContain("Revision two");
  expect(nextText).not.toContain("Revision one");
  expect(
    v2.find((entry) => entry.recordId === "record-2")!.documentHash,
  ).not.toBe(v1.find((entry) => entry.recordId === "record-2")!.documentHash);
  for (const entry of v1)
    expect(
      await (
        await page.request.get(`/api/documents/${entry.documentId}/content`)
      ).body(),
    ).toEqual(originals.get(entry.recordId));
  expect(
    await (await page.request.get(`/api/distribution-plans/${plan.id}`)).json(),
  ).toEqual(frozen);
  for (const entry of plan.entries) {
    const detail = await (
      await page.request.get(`/api/dispatches/${entry.dispatchId}`)
    ).json();
    expect(detail.approval).toBeFalsy();
    expect(detail.attempts).toHaveLength(0);
  }
  await mkdir("reports/studio-continuity", { recursive: true });
  await writeFile(
    `reports/studio-continuity/${testInfo.project.name}.json`,
    JSON.stringify(
      {
        environment: "local simulation, actual pdfme renderer",
        first: { id: first.id, hashes: v1.map((entry) => entry.documentHash) },
        second: {
          id: second.id,
          hashes: v2.map((entry) => entry.documentHash),
        },
        preparedEntries: plan.entries.length,
        originalBytesUnchanged: true,
        originalPlanUnchanged: true,
        correctedCityPresent: true,
        revisionTextPresent: true,
        approvals: 0,
        attempts: 0,
      },
      null,
      2,
    ),
  );
  await page.screenshot({
    path: `reports/studio-continuity/${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto(
    `/#/app/studio/template/${model.id}?${new URLSearchParams({ generation: first.id, record: "record-3" })}`,
  );
  await expect(page.getByLabel(/^name(?: \*)?$/)).toHaveValue("Alex Example");
  await expect(page.getByLabel(/^city(?: \*)?$/)).toHaveValue("Metz");
  await page.getByLabel(/^city(?: \*)?$/).fill("Nancy");
  const correctedGeneration = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/generation-jobs") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Générer le PDF sans envoi", exact: true })
    .click();
  const correctedResponse = await correctedGeneration;
  expect(correctedResponse.status(), await correctedResponse.text()).toBe(202);
  const correctedJob = (await correctedResponse.json()) as GenerationJobView;
  expect(correctedJob.templateVersion).toBe(1);
  const correctedResults = await completed(page, correctedJob.id, 1);
  const correctedBytes = await (
    await page.request.get(
      `/api/documents/${correctedResults[0].documentId}/content`,
    )
  ).body();
  const correctedText = await pdfText(page, correctedBytes);
  expect(correctedText).toContain("Revision one");
  expect(correctedText).toContain("Nancy");
  expect(correctedText).not.toContain("Revision two");
  await page.goto(
    `/#/app/studio/template/${model.id}?${new URLSearchParams({ generation: first.id, record: "record-2" })}`,
  );
  await expect(page.getByLabel(/^name(?: \*)?$/)).toHaveValue(
    "Camille Example",
  );
  await page.goto(
    `/#/app/studio/template/${model.id}?${new URLSearchParams({ generation: first.id, record: "record-3" })}`,
  );
  await expect(page.getByLabel(/^name(?: \*)?$/)).toHaveValue("Alex Example");
  await expect(page.getByLabel(/^city(?: \*)?$/)).toHaveValue("Metz");
  await page.goBack();
  await expect(page.getByLabel(/^name(?: \*)?$/)).toHaveValue(
    "Camille Example",
  );
  const mappingContext = new URLSearchParams({
    template: model.id,
    version: "1",
    mapping: first.mappingId!,
    mappingVersion: String(first.mappingVersion),
  });
  await page.goto(`/#/app/studio/dataset/${first.datasetId}?${mappingContext}`);
  await expect(
    page
      .getByLabel("Modèle à remplir", { exact: true })
      .locator("option:checked"),
  ).toContainText("v1");
  mappingContext.set("version", "2");
  await page.goto(`/#/app/studio/dataset/${first.datasetId}?${mappingContext}`);
  await expect(
    page
      .getByLabel("Modèle à remplir", { exact: true })
      .locator("option:checked"),
  ).toContainText("v2");
  await page.goBack();
  await expect(
    page
      .getByLabel("Modèle à remplir", { exact: true })
      .locator("option:checked"),
  ).toContainText("v1");
  await page
    .getByLabel("Lignes à exclure explicitement", { exact: true })
    .fill("2");
  await fileDetails.locator("summary").click();
  const beforeReorder = page.url();
  const reordered =
    "name,subject,reference,city\nAlex Example,Subject B,REF-B,Metz\nCamille Example,Subject A,REF-A,Paris\nMorgan Example,Subject C,REF-C,Lyon\n";
  await fileDetails.locator('input[type="file"]').setInputFiles({
    name: "reordered.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(reordered),
  });
  await fileDetails.locator("button").click();
  await expect(page).not.toHaveURL(beforeReorder);
  await expect(
    page.getByLabel("Lignes à exclure explicitement", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "Valider toutes les lignes",
      exact: true,
    }),
  ).toBeDisabled();
  await page.locator('input[type="checkbox"][required]').check();
  await expect(
    page.getByRole("button", {
      name: "Valider toutes les lignes",
      exact: true,
    }),
  ).toBeEnabled();
});
