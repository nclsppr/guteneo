import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test, expect } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type { TemplateView } from "../../packages/contracts/src/template-workflow";
import type { DocxImportResult } from "../../packages/templates/docx";

test("Word import exposes conversion warnings, supports native visual editing and renders an actual PDF", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Native graphical editing is qualified on desktop.");
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
  await page.goto("/#/app/templates");
  const sourcePath = fileURLToPath(
    new URL("../../reports/template-engine/word-source.docx", import.meta.url),
  );
  const sourceBytes = await readFile(sourcePath);
  expect(sourceBytes.subarray(0, 2).toString()).toBe("PK");
  await page
    .getByLabel("Fichier Word (.docx)", { exact: true })
    .setInputFiles(sourcePath);
  const importedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/templates/import-docx") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Importer Word", exact: true })
    .click();
  const response = await importedResponse;
  expect(response.status(), await response.text()).toBe(201);
  const imported = (await response.json()) as {
    template: TemplateView;
    warnings: DocxImportResult["warnings"];
    provenance: DocxImportResult["provenance"];
  };
  expect(imported.warnings).toContainEqual(
    expect.objectContaining({ code: "DOCX_LAYOUT_REVIEW" }),
  );
  expect(imported.provenance).toMatchObject({
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    layoutPreserved: false,
  });
  const warnings = page
    .getByRole("status")
    .filter({ hasText: "Le modèle a été importé" });
  await expect(warnings).toContainText("Styles Word");
  await expect(warnings).toContainText("DOCX_LAYOUT_REVIEW");
  await page
    .getByRole("link", { name: "Ouvrir le modèle Word importé", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "word-source", exact: true, level: 1 }),
  ).toBeVisible();
  const paragraph = page.locator('.studio-designer [title="paragraph_1"]');
  await expect(paragraph).toContainText("WORD-PARAGRAPH-001", {
    timeout: 30000,
  });
  await expect
    .poll(() =>
      page
        .locator(".studio-designer .pdfme-designer-root")
        .evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeGreaterThanOrEqual(700);
  await expect(
    page.locator('.studio-designer [title="table_1"]'),
  ).toContainText("WORD-ARTICLE-001");
  const original = imported.template.envelope.definition.schemas
    .flat()
    .find((block) => block.name === "paragraph_1")!;
  // Select a real pdfme canvas block and edit its native position property.
  // Persisting the changed position proves the Designer callback path.
  await paragraph.click();
  const yPosition = page
    .locator(".studio-designer")
    .getByRole("spinbutton", { name: "* Y", exact: true });
  await expect(yPosition).toBeVisible();
  const previousTop = await paragraph.evaluate((element) =>
    parseFloat((element as HTMLElement).style.top),
  );
  await yPosition.fill(String(original.position.y + 1));
  await yPosition.press("Tab");
  await expect(yPosition).toHaveValue(String(original.position.y + 1));
  await expect
    .poll(() =>
      paragraph.evaluate((element) =>
        parseFloat((element as HTMLElement).style.top),
      ),
    )
    .toBeGreaterThan(previousTop);
  await page
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Toutes les modifications sont enregistrées." }),
  ).toBeVisible();
  const saved = (await (
    await page.request.get(`/api/templates/${imported.template.id}`)
  ).json()) as TemplateView;
  const edited = saved.envelope.definition.schemas
    .flat()
    .find((block) => block.name === "paragraph_1")!;
  expect(edited.position.y).toBe(original.position.y + 1);
  expect(edited.content).toBe(original.content);
  expect(saved.envelope.inputSchema).toEqual(
    imported.template.envelope.inputSchema,
  );
  expect(saved.envelope.bindings).toEqual(imported.template.envelope.bindings);
  await expect(paragraph).toContainText("WORD-PARAGRAPH-001", {
    timeout: 30000,
  });
  await mkdir("reports/templates-data", { recursive: true });
  await page.screenshot({
    path: `reports/templates-data/word-studio-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Données et génération", exact: true })
    .click();
  const previewResponse = page.waitForResponse(
    (result) =>
      result.url().endsWith(`/api/templates/${saved.id}/preview`) &&
      result.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Vérifier un aperçu PDF", exact: true })
    .click();
  const preview = await previewResponse;
  expect(preview.status(), await preview.text()).toBe(201);
  const document = (await preview.json()) as { id: string };
  const content = await page.request.get(
    `/api/documents/${document.id}/content`,
  );
  expect(content.status()).toBe(200);
  expect((await content.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.locator(".studio-result-preview canvas")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".studio-result-preview")).toContainText(
    "WORD-PARAGRAPH-001",
  );
  await expect(page.locator(".studio-result-preview")).toContainText(
    "WORD-ARTICLE-001",
  );
  await page.screenshot({
    path: `reports/templates-data/word-preview-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
