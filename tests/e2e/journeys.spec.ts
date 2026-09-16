import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, PDFName } from "pdf-lib";
import { mkdir } from "node:fs/promises";

test("oversized embedded images fail visibly before decode, without a partial preview", async ({
  page,
}) => {
  await login(page);
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([595, 842]);
  const image = pdf.context.register(
    pdf.context.stream(new Uint8Array([0]), {
      Type: "XObject",
      Subtype: "Image",
      Width: 5000,
      Height: 5000,
      ColorSpace: "DeviceGray",
      BitsPerComponent: 8,
    }),
  );
  sheet.node.set(
    PDFName.of("Resources"),
    pdf.context.obj({ XObject: { Oversized: image } }),
  );
  sheet.node.set(
    PDFName.of("Contents"),
    pdf.context.register(
      pdf.context.stream("q 500 0 0 500 20 20 cm /Oversized Do Q"),
    ),
  );
  await page.goto("/#/app/documents");
  await page
    .getByRole("button", { name: "Importer un PDF", exact: true })
    .click();
  await page.getByLabel("Fichier PDF").setInputFiles({
    name: "oversized-image.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole("button", { name: "Importer et contrôler" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "une image dépasse 16 mégapixels",
  );
  await expect(page.locator(".pdf-canvas-wrap canvas")).toBeHidden();
});

test("admin empty DLQ and contract fixture navigate to the real dispatch without retry controls", async ({
  page,
}) => {
  await login(page);
  await page.goto("/#/app/admin");
  await expect(
    page.getByRole("heading", { name: "Messages en file d’échec" }),
  ).toBeVisible();
  await expect(
    page.getByText("Aucun message en file d’échec pour cette organisation."),
  ).toBeVisible();
  const session = (await (await page.request.get("/api/session")).json()) as {
    csrfToken: string;
  };
  const preparedResponse = await page.request.post("/api/dispatches", {
    headers: {
      Origin: "http://localhost:8787",
      "X-CSRF-Token": session.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      channel: "email",
      recipient: { email: "dlq-ui@example.invalid" },
      subject: "DLQ interface fixture",
      html: "<p>Simulation.</p>",
      text: "Simulation.",
      ceilingMinor: 500,
    },
  });
  expect(preparedResponse.status()).toBe(201);
  const prepared = (await preparedResponse.json()) as { id: string };
  const realDiagnostic = (await (
    await page.request.get("/api/admin")
  ).json()) as Record<string, unknown>;
  // Only the visual receipt is a contract fixture. Its link resolves through the
  // real authenticated API to an actual persisted dispatch; no retry is mocked.
  await page.route("**/api/admin", (route) =>
    route.fulfill({
      json: {
        ...realDiagnostic,
        deadLetters: [
          {
            id: "ui-contract-receipt",
            dispatch_id: prepared.id,
            queue: "simulation-fixture",
            received_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Actualiser", exact: true })
    .click();
  await expect(
    page
      .locator(".dead-letters")
      .getByRole("link", { name: "Examiner l’envoi" }),
  ).toHaveAttribute("href", `#/app/dispatch/${prepared.id}`);
  await expect(
    page
      .locator(".dead-letters")
      .getByRole("button", { name: /retry|relancer/i }),
  ).toHaveCount(0);
  await page
    .locator(".dead-letters")
    .getByRole("link", { name: "Examiner l’envoi" })
    .click();
  await expect(page.locator(".dispatch-reference")).toContainText(prepared.id);
});

async function login(
  page: Page,
  organization: "Atelier" | "Studio" = "Atelier",
) {
  await page.goto("/#/app");
  await page
    .getByRole("button", {
      name: `Entrer dans ${organization === "Atelier" ? "l’Atelier" : "le Studio"}`,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  await expect(page.locator(".simulation-banner")).toContainText(
    "Aucun fax, e-mail ou courrier réel",
  );
}

async function screenshot(page: Page, name: string) {
  await mkdir("reports/screenshots", { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .slice(0, 15)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        width: element.getBoundingClientRect().width,
        right: element.getBoundingClientRect().right,
      })),
  }));
  expect(
    dimensions.document,
    JSON.stringify({ name, ...dimensions }),
  ).toBeLessThanOrEqual(dimensions.viewport);
  await page.screenshot({
    path: `reports/screenshots/${name}.png`,
    fullPage: true,
  });
}

test("landing and workspace fit desktop and iPhone widths, keyboard navigation remains visible", async ({
  page,
  browserName,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Vos mots méritent de parvenir." }),
  ).toBeVisible();
  // WebKit on macOS uses Option-Tab for links unless full keyboard navigation is enabled.
  // Keep this a real keyboard traversal; do not replace it with programmatic focus.
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab",
  );
  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#landing-main")).toBeFocused();
  await page
    .getByRole("heading", { name: "Vos mots méritent de parvenir." })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await screenshot(page, `landing-${testInfo.project.name}`);
  await login(page);
  await screenshot(page, `overview-${testInfo.project.name}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/app/prepare");
  await expect(
    page.getByRole("heading", { name: "Préparer une correspondance." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await screenshot(page, `prepare-mobile-${testInfo.project.name}`);
});

test("generates an inspectable PDF, approves the frozen email and tracks its simulated delivery", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto("/#/app/documents");
  await page.getByRole("button", { name: "Composer une lettre" }).click();
  const documentName = `Lettre E2E ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nom du document").fill(documentName);
  await page
    .getByLabel("Contenu HTML autonome")
    .fill("<h1>Lettre de contrôle</h1><p>Un PDF généré, relu et approuvé.</p>");
  const rendered = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/documents/render") &&
      response.request().method() === "POST",
  );
  if (testInfo.project.name === "mobile-chromium")
    await page.getByRole("button", { name: "Générer le PDF" }).tap();
  else await page.getByRole("button", { name: "Générer le PDF" }).click();
  const response = await rendered;
  expect(response.status()).toBe(201);
  const document = (await response.json()) as { id: string; sha256: string };
  await expect(
    page.getByRole("heading", { name: `${documentName}.pdf`, exact: true }),
  ).toBeVisible();
  const pdf = await page.request.get(`/api/documents/${document.id}/content`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(
    (await PDFDocument.load(await pdf.body())).getPageCount(),
  ).toBeGreaterThan(0);
  await expect(page.locator(".pdf-canvas-wrap canvas").first()).toBeVisible();
  await expect(page.locator(".pdf-canvas-wrap").first()).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect
    .poll(() =>
      page
        .locator(".pdf-canvas-wrap canvas")
        .first()
        .evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const context = canvas.getContext("2d");
          if (!context || canvas.width < 100 || canvas.height < 100)
            return false;
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let dark = 0;
          for (let index = 0; index < pixels.length; index += 4)
            if (
              pixels[index] < 100 &&
              pixels[index + 1] < 100 &&
              pixels[index + 2] < 100
            )
              dark++;
          return dark > 100;
        }),
    )
    .toBe(true);
  await screenshot(page, `document-${testInfo.project.name}`);
  await page.getByRole("link", { name: "Utiliser pour un envoi" }).click();
  await page.getByRole("radio", { name: "E-mail", exact: true }).check();
  await page.getByLabel("Adresse e-mail").fill("e2e@example.invalid");
  await page
    .getByLabel("Objet", { exact: true })
    .fill("Correspondance de contrôle");
  await page
    .getByLabel("Version HTML", { exact: true })
    .fill("<h1>Bonjour</h1><p>Voici le document joint.</p>");
  await page
    .getByLabel("Version texte", { exact: true })
    .fill("Bonjour. Voici le document joint.");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approuver cette version" }),
  ).toBeDisabled();
  await expect(
    page.getByText("e2e@example.invalid", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmer l’envoi simulé" }),
  ).toBeVisible();
  await screenshot(page, `approval-${testInfo.project.name}`);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Confirmer l’envoi simulé" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmer l’envoi simulé" }).click();
  await expect(page.locator(".dispatch-reference .status")).toHaveText(
    "Remis au serveur destinataire",
    { timeout: 20000 },
  );
  await expect(page.locator(".timeline li")).not.toHaveCount(0);
  await screenshot(page, `delivery-${testInfo.project.name}`);
});

test("imports exact PDF bytes and rejects cross-organization preview access", async ({
  page,
  browser,
}) => {
  await login(page);
  const pdf = await PDFDocument.create();
  pdf
    .addPage([595, 842])
    .drawText("Original PDF byte integrity test", { x: 50, y: 750 });
  const original = Buffer.from(await pdf.save());
  await page.goto("/#/app/documents");
  await page
    .getByRole("button", { name: "Importer un PDF", exact: true })
    .click();
  await page.getByLabel("Fichier PDF").setInputFiles({
    name: "exact-original.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  const uploaded = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/documents") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Importer et contrôler" }).click();
  const response = await uploaded;
  expect(response.status()).toBe(201);
  const document = (await response.json()) as { id: string };
  expect(
    await (
      await page.request.get(`/api/documents/${document.id}/content`)
    ).body(),
  ).toEqual(original);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("http://localhost:8787/#/app");
  await otherPage
    .getByRole("button", { name: "Entrer dans le Studio" })
    .click();
  await expect(
    otherPage.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  const denied = await otherPage.request.get(
    `http://localhost:8787/api/documents/${document.id}/content`,
  );
  expect([403, 404]).toContain(denied.status());
  await other.close();
});

test("CSV duplicate checks precede a campaign with individual frozen preparations", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto("/#/app/campaigns");
  const name = `Campagne E2E ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nom de la campagne").fill(name);
  await page
    .getByLabel("Liste des destinataires au format CSV")
    .fill(
      "channel,email\nemail,paper@example.invalid\nemail,paper@example.invalid",
    );
  await page.getByRole("button", { name: "Vérifier la liste" }).click();
  await expect(
    page.getByText("doublon de la ligne", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Créer la campagne" }),
  ).toBeDisabled();
  await page
    .getByLabel("Liste des destinataires au format CSV")
    .fill(
      "channel,email\nemail,paper@example.invalid\nemail,press@example.invalid",
    );
  await page.getByRole("button", { name: "Vérifier la liste" }).click();
  await expect(page.getByText("Aucune erreur signalée.")).toBeVisible();
  await page.getByLabel("Objet des e-mails").fill("Campagne de démonstration");
  await page
    .getByLabel("Contenu HTML des e-mails")
    .fill("<p>Correspondance individuelle.</p>");
  await page
    .getByLabel("Version texte", { exact: true })
    .fill("Correspondance individuelle.");
  await page.getByRole("button", { name: "Créer la campagne" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody .status")).toHaveText([
    "À approuver",
    "À approuver",
  ]);
  await screenshot(page, `campaign-${testInfo.project.name}`);
});
