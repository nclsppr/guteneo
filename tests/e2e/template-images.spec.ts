import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { blankTemplate } from "../../packages/templates/gallery";
import { validateTemplateImage } from "../../packages/contracts/src/templates";
import type { TemplateView } from "../../packages/contracts/src/template-workflow";
import type { Session } from "../../apps/web/src/api";

test("the image tool inserts a movable logo, saves original bytes and renders it into a PDF", async ({
  page,
  isMobile,
}, info) => {
  test.skip(
    isMobile,
    "Native visual editing is qualified on desktop; the image importer remains available on mobile.",
  );
  test.setTimeout(90000);
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(page.locator(".workspace")).toBeVisible();
  const session = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  const envelope = blankTemplate();
  envelope.name = `Logo image ${crypto.randomUUID().slice(0, 8)}`;
  const created = await page.request.post("/api/templates", {
    headers: {
      Origin: "http://localhost:8787",
      "X-CSRF-Token": session.csrfToken,
    },
    data: { envelope },
  });
  expect(created.status(), await created.text()).toBe(201);
  const model = (await created.json()) as TemplateView;
  await page.goto(`/#/app/template/${model.id}`);
  const imageButton = page.getByRole("button", {
    name: "Ajouter une image",
    exact: true,
  });
  await expect(imageButton).toBeVisible();
  await expect(page.locator(".studio-mobile-help")).toBeHidden();
  const importer = page.getByLabel("Choisir une image pour le modèle", {
    exact: true,
  });
  await importer.setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Choisissez une image PNG ou JPEG valide.",
  );
  await expect(
    page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }),
  ).toBeDisabled();
  const chooser = page.waitForEvent("filechooser");
  await imageButton.focus();
  await imageButton.press("Enter");
  await (await chooser).setFiles("apps/web/public/brand/guteneo-mark.png");
  await expect(
    page.getByRole("status").filter({ hasText: "ajouté à la page 1" }),
  ).toBeVisible();
  const designer = page.locator(".studio-designer");
  await expect(
    designer.getByRole("textbox", { name: "* Nom", exact: true }),
  ).toHaveValue("image");
  const saveButton = page.getByRole("button", {
    name: "Enregistrer le brouillon",
    exact: true,
  });
  const width = designer.getByRole("spinbutton", {
    name: "* Largeur",
    exact: true,
  });
  // Neither reverting a value nor correcting an invalid number may leave Save
  // locked when pdfme has no model change to emit.
  await width.fill("30");
  await width.fill("35");
  await width.press("Tab");
  await expect(saveButton).toBeEnabled();
  await width.fill("");
  await expect(saveButton).toBeDisabled();
  await width.fill("35");
  await width.press("Tab");
  await expect(saveButton).toBeEnabled();
  for (const [label, value] of [
    ["* X", "35"],
    ["* Y", "40"],
    ["* Largeur", "30"],
    ["* Hauteur", "30"],
  ]) {
    const input = designer.getByRole("spinbutton", {
      name: label,
      exact: true,
    });
    await input.fill(value);
    await input.press("Tab");
  }
  await page
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Toutes les modifications sont enregistrées." }),
  ).toBeVisible();
  const saved = (await (
    await page.request.get(`/api/templates/${model.id}`)
  ).json()) as TemplateView;
  const image = saved.envelope.definition.schemas
    .flat()
    .find((block) => block.type === "image")!;
  const content = `data:image/png;base64,${(await readFile("apps/web/public/brand/guteneo-mark.png")).toString("base64")}`;
  expect(image).toMatchObject({
    name: "image",
    position: { x: 35, y: 40 },
    width: 30,
    height: 30,
  });
  expect(image.content).toBe(content);
  await page.reload();
  await expect(
    page.locator('.studio-designer img[src^="data:image/png"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }),
  ).toBeDisabled();
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
  const document = (await preview.json()) as { id: string };
  await expect(page.locator(".studio-result-preview canvas")).toBeVisible({
    timeout: 30000,
  });
  const pdfResponse = await page.request.get(
    `/api/documents/${document.id}/content`,
  );
  expect(pdfResponse.status()).toBe(200);
  const pdf = await PDFDocument.load(await pdfResponse.body());
  const dimensions = validateTemplateImage(content);
  const renderedImages = pdf.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object): object is PDFRawStream =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
    );
  expect(
    renderedImages.some(
      (object) =>
        object.dict.get(PDFName.of("Width"))?.toString() ===
          String(dimensions.width) &&
        object.dict.get(PDFName.of("Height"))?.toString() ===
          String(dimensions.height),
    ),
  ).toBe(true);
  await expect(
    page.locator(".studio-result-preview .pdf-canvas-wrap"),
  ).toHaveAttribute("aria-busy", "false");
  await page.locator(".studio-result-preview canvas").screenshot({
    path: info.outputPath("template-logo-rendered.png"),
  });
});
