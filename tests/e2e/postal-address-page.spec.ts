import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdir } from "node:fs/promises";
import { documentAnalysis } from "../../packages/contracts/src/document-analysis";

// Browser fixtures only. No provider transfer, real account or postal send.
async function setup(
  page: Page,
  variant: "ready" | "pending" | "lost" | "processing" = "ready",
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage([595.28, 841.89])
    .drawText("DOCUMENT SOURCE - EXEMPLE", { x: 70, y: 740, font, size: 14 });
  pdf
    .addPage([595.28, 841.89])
    .drawText("VERSO SOURCE - EXEMPLE", { x: 70, y: 740, font, size: 14 });
  const sourceBytes = Buffer.from(await pdf.save());
  const source = {
    id: "source-ui",
    name: "Document source — exemple.pdf",
    pages: 2,
    size: sourceBytes.length,
    sha256: "a".repeat(64),
    status: "ready",
    source: "import",
    created_at: "2026-09-20T12:00:00Z",
    analysis: documentAnalysis("ready"),
  };
  const documents = new Map<string, typeof source>();
  const contents = new Map<string, Buffer>([[source.id, sourceBytes]]);
  const creations = new Map<
    string,
    {
      document: typeof source;
      provenance: Record<string, unknown>;
      canSend: false;
    }
  >();
  const mutations: {
    path: string;
    body: Record<string, unknown>;
    key?: string;
    csrf?: string;
  }[] = [];
  const contentReads: string[] = [];
  const unmatched: string[] = [];
  const controls = { ready: variant !== "pending", statusReads: 0 };
  let review: Record<string, unknown>;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
    const body = request.postData()
      ? (request.postDataJSON() as Record<string, unknown>)
      : {};
    const key = request.headers()["idempotency-key"];
    if (request.method() !== "GET")
      mutations.push({
        path,
        body,
        key,
        csrf: request.headers()["x-csrf-token"],
      });
    if (path === "/session")
      return route.fulfill({
        json: {
          organization: { id: "org-address-ui", name: "Atelier de test" },
          user: {
            id: "user-address-ui",
            name: "Camille Exemple",
            role: "admin",
          },
          csrfToken: "ui-csrf",
          simulation: false,
          verifiedAccount: true,
        },
      });
    if (path === "/capabilities")
      return route.fulfill({ json: { registration: { enabled: true } } });
    if (path === "/senders")
      return route.fulfill({
        json: {
          items: [
            {
              id: "sender-ui",
              name: "Expéditeur exemple",
              channel: "postal",
              status: "verified",
            },
          ],
        },
      });
    if (path === "/documents")
      return route.fulfill({ json: { items: [source], nextCursor: null } });
    if (path === `/documents/${source.id}`)
      return route.fulfill({ json: source });
    if (path.startsWith("/documents/") && path.endsWith("/content")) {
      const id = path.split("/")[2];
      contentReads.push(id);
      if (contents.has(id))
        return route.fulfill({
          contentType: "application/pdf",
          body: contents.get(id),
        });
    }
    if (path.startsWith("/documents/") && documents.has(path.split("/")[2])) {
      controls.statusReads++;
      const document = documents.get(path.split("/")[2])!;
      return route.fulfill({
        json: controls.ready
          ? document
          : {
              ...document,
              status: "quarantine",
              pages: 0,
              analysis: documentAnalysis(
                "quarantine",
                "processing",
                "scan_pending",
              ),
            },
      });
    }
    if (path === "/postal/address-pages") {
      if (!creations.has(key!)) {
        const addedPages = body.printMode === "duplex" ? 2 : 1;
        const generated = await PDFDocument.create();
        const generatedFont = await generated.embedFont(
          StandardFonts.Helvetica,
        );
        generated
          .addPage([595.28, 841.89])
          .drawText("ATELIER EXEMPLE\nRue du Test 12\nL-1234 LUXEMBOURG", {
            x: 65,
            y: 655,
            font: generatedFont,
            size: 11,
            lineHeight: 14,
          });
        if (addedPages === 2) generated.addPage([595.28, 841.89]);
        for (const copied of await generated.copyPages(pdf, [0, 1]))
          generated.addPage(copied);
        const bytes = Buffer.from(await generated.save());
        const id = `generated-ui-${creations.size + 1}`;
        const document = {
          ...source,
          id,
          name: "Courrier avec page d’adresse — exemple.pdf",
          pages: 2 + addedPages,
          size: bytes.length,
          sha256: "b".repeat(64),
          source: "render",
        };
        documents.set(id, document);
        contents.set(id, bytes);
        creations.set(key!, {
          document,
          provenance: {
            id: `cover-${id}`,
            sourceDocumentId: source.id,
            sourceSha256: source.sha256,
            generatedDocumentId: id,
            generatedSha256: document.sha256,
            addressMode: "generated_address_page",
            recipient: body.recipient,
            printMode: body.printMode,
            profile: {
              defaultCountry: "LU",
              addressPosition: "left",
              version: "fixture-profile",
            },
            addedPages,
          },
          canSend: false,
        });
        if (variant === "lost") return route.abort("failed");
        if (variant === "processing")
          return route.fulfill({
            status: 409,
            json: {
              error: {
                code: "POSTAL_ADDRESS_PAGE_PROCESSING",
                message: "La création est en cours. Réessayez la même demande.",
              },
            },
          });
      }
      const result = creations.get(key!)!;
      return route.fulfill({
        json: controls.ready
          ? result
          : {
              ...result,
              document: {
                ...result.document,
                status: "quarantine",
                pages: 0,
                analysis: documentAnalysis(
                  "quarantine",
                  "processing",
                  "scan_pending",
                ),
              },
            },
      });
    }
    if (path === "/postal/preflights" && request.method() === "POST") {
      const creation = [...creations.values()].find(
        (item) => item.document.id === body.documentId,
      );
      const document = creation?.document ?? source;
      review = {
        id: "review-address-ui",
        status: "review_required",
        document: {
          ...document,
          previewUrl: `/api/documents/${document.id}/content`,
        },
        recipient: body.recipient,
        options: { ...(body.options as object), addressPosition: "left" },
        ceilingMinor: body.ceilingMinor,
        reviewUrl: "/#/app/postal/review-address-ui",
        checks: {
          complete: true,
          dpi: 144,
          pages: Array.from({ length: document.pages }, (_, index) => ({
            page: index + 1,
            width: 1191,
            height: 1684,
          })),
          issues: [],
        },
        address: {
          expectedLines: [
            "ATELIER EXEMPLE",
            "Rue du Test 12",
            "L-1234 LUXEMBOURG",
          ],
          extractedLines: [
            "ATELIER EXEMPLE",
            "Rue du Test 12",
            "L-1234 LUXEMBOURG",
          ],
          matches: true,
          textVisibility: "not_verified",
          cropAccess: "authenticated_browser_session_only",
          mcpEmbeddedVisualEvidenceAvailable: false,
          cropUrl: null,
        },
        addressPage: creation?.provenance,
        canTransfer: false,
        transferStatus: "not_started",
        draftId: null,
        canSend: false,
      };
      return route.fulfill({ json: review });
    }
    if (path === "/postal/preflights/review-address-ui")
      return route.fulfill({ json: review });
    unmatched.push(`${request.method()} ${path}`);
    return route.fulfill({
      status: 404,
      json: {
        error: { code: "UNEXPECTED_FIXTURE_CALL", message: "Appel non prévu." },
      },
    });
  });
  await page.goto("/#/app/prepare?document=source-ui&channel=postal");
  await page
    .getByLabel("Nom du destinataire", { exact: true })
    .fill("ATELIER EXEMPLE");
  await page.getByLabel("Adresse", { exact: true }).fill("Rue du Test 12");
  await page.getByLabel("Code postal", { exact: true }).fill("L-1234");
  await page.getByLabel("Ville", { exact: true }).fill("LUXEMBOURG");
  await page.getByLabel("Pays", { exact: true }).selectOption("LU");
  return { mutations, contentReads, unmatched, creations, controls };
}

const generate = (page: Page) =>
  page.getByRole("button", {
    name: "Créer le PDF avec la page d’adresse",
    exact: true,
  });
const preflight = (page: Page) =>
  page.getByRole("button", {
    name: "Contrôler le PDF pour le courrier",
    exact: true,
  });

test("existing document address remains the default and creates no derivative", async ({
  page,
}) => {
  const fixture = await setup(page);
  await expect(
    page.getByRole("radio", { name: "Utiliser l’adresse du document" }),
  ).toBeChecked();
  await preflight(page).click();
  await expect(page).toHaveURL(/postal\/review-address-ui$/);
  expect(fixture.mutations.map((mutation) => mutation.path)).toEqual([
    "/postal/preflights",
  ]);
  expect(fixture.mutations[0].body.documentId).toBe("source-ui");
  expect(fixture.unmatched).toEqual([]);
});

test("generated exact PDF is previewed before a separate preflight and consent", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "iphone-webkit")
    await page.setViewportSize({ width: 320, height: 800 });
  const fixture = await setup(page);
  const existing = page.getByRole("radio", {
    name: "Utiliser l’adresse du document",
  });
  await existing.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: "Ajouter une page d’adresse" }),
  ).toBeChecked();
  await generate(page).click();
  await expect(
    page.getByText("PDF final avec page d’adresse", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pdf-canvas-wrap canvas")).toBeVisible();
  await expect(page.getByText("Page 1 / 3", { exact: true })).toBeVisible();
  expect(fixture.contentReads.at(-1)).toBe("generated-ui-1");
  expect(fixture.mutations).toHaveLength(1);
  expect(fixture.mutations[0].body).toEqual({
    documentId: "source-ui",
    recipient: {
      name: "ATELIER EXEMPLE",
      line1: "Rue du Test 12",
      postalCode: "L-1234",
      city: "LUXEMBOURG",
      country: "LU",
    },
    printMode: "simplex",
  });
  expect(fixture.mutations[0].csrf).toBe("ui-csrf");
  expect(fixture.mutations[0].key).toBeTruthy();
  await page.getByRole("button", { name: "Page suivante" }).click();
  await expect(page.getByText("Page 2 / 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Page précédente" }).click();
  await expect(page.getByText("Page 1 / 3", { exact: true })).toBeVisible();
  await expect(page.locator(".pdf-canvas-wrap canvas")).toBeVisible();
  await expect(preflight(page)).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Consulter le PDF source conservé" }),
  ).toHaveAttribute("href", "#/app/documents?document=source-ui");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await mkdir("reports/screenshots/postal-address-page", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `reports/screenshots/postal-address-page/${testInfo.project.name}.png`,
    fullPage: true,
  });
  await preflight(page).click();
  await expect(page).toHaveURL(/postal\/review-address-ui$/);
  expect(fixture.mutations[1].body.documentId).toBe("generated-ui-1");
  await expect(
    page.getByText("PDF final avec page d’adresse", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /J’ai parcouru toutes les pages/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Transmettre pour analyse" }),
  ).toBeDisabled();
  expect(
    fixture.mutations.some((item) =>
      /transfer|approve|send|confirm/.test(item.path),
    ),
  ).toBe(false);
  expect(fixture.unmatched).toEqual([]);
});

test("duplex adds an address sheet with a blank back and derives a new PDF after edits", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.getByRole("radio", { name: "Ajouter une page d’adresse" }).check();
  await page.getByLabel("Faces imprimées").selectOption("duplex");
  await expect(page.getByText(/2 pages PDF sont ajoutées/)).toBeVisible();
  await generate(page).click();
  await expect(page.locator(".postal-generated-summary")).toContainText(
    "4 pages PDF · 2 feuilles",
  );
  await expect(page.locator(".pdf-canvas-wrap canvas")).toBeVisible();
  await page.getByLabel("Ville", { exact: true }).fill("ESCH-SUR-ALZETTE");
  await expect(
    page.getByText("PDF final avec page d’adresse", { exact: true }),
  ).toHaveCount(0);
  await expect(preflight(page)).toHaveCount(0);
  await generate(page).click();
  await expect(
    page.getByText("PDF final avec page d’adresse", { exact: true }),
  ).toBeVisible();
  expect(fixture.mutations[1].key).not.toBe(fixture.mutations[0].key);
  expect(fixture.creations.size).toBe(2);
  await page.getByLabel("Faces imprimées").selectOption("simplex");
  await expect(preflight(page)).toHaveCount(0);
  await generate(page).click();
  await expect(page.locator(".postal-generated-summary")).toContainText(
    "3 pages PDF · 3 feuilles",
  );
  expect(fixture.mutations[2].body.printMode).toBe("simplex");
  await page
    .getByRole("radio", { name: "Utiliser l’adresse du document" })
    .check();
  await preflight(page).click();
  expect(fixture.mutations.at(-1)?.body.documentId).toBe("source-ui");
  expect(fixture.unmatched).toEqual([]);
});

test("pending verification polls the same generated document without preparing or regenerating", async ({
  page,
}) => {
  await page.clock.install();
  const fixture = await setup(page, "pending");
  await page.getByRole("radio", { name: "Ajouter une page d’adresse" }).check();
  await generate(page).click();
  await expect(
    page.getByRole("heading", { name: "Vérification du PDF en cours" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vérification du PDF final…" }),
  ).toBeDisabled();
  await expect.poll(() => fixture.controls.statusReads).toBeGreaterThan(0);
  fixture.controls.ready = true;
  await page.clock.fastForward(16000);
  await expect(preflight(page)).toBeEnabled();
  expect(fixture.controls.statusReads).toBeGreaterThan(1);
  expect(fixture.mutations).toHaveLength(1);
  expect(fixture.creations.size).toBe(1);
  expect(fixture.unmatched).toEqual([]);
});

for (const variant of ["lost", "processing"] as const) {
  test(`${variant} generation response retries with the same request identity`, async ({
    page,
  }) => {
    const fixture = await setup(page, variant);
    await page
      .getByRole("radio", { name: "Ajouter une page d’adresse" })
      .check();
    await generate(page).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page
      .getByRole("button", { name: "Réessayer la création du PDF" })
      .click();
    await expect(preflight(page)).toBeEnabled();
    expect(fixture.creations.size).toBe(1);
    expect(fixture.mutations).toHaveLength(2);
    expect(fixture.mutations[1].key).toBe(fixture.mutations[0].key);
    expect(fixture.mutations[1].body).toEqual(fixture.mutations[0].body);
    expect(fixture.unmatched).toEqual([]);
  });
}
