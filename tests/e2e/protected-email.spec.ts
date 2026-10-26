import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { cleanEmailHtml } from "../../packages/contracts/src/content";
import {
  documentEmailDefaults,
  renderTransactionalEmail,
} from "../../packages/contracts/src/email-template";
import { secureDistributionQuote } from "../../packages/contracts/src/secure-distribution";

const sampleDocument = {
  id: "document_protected_ui",
  name: "Correspondance.pdf",
  sha256: "a".repeat(64),
  size: 500,
  pages: 1,
  status: "ready",
  source: "import",
  created_at: "2026-09-21T10:00:00Z",
};
const dispatch = {
  id: "dispatch_protected_ui",
  channel: "email",
  mode: "production",
  recipient_json: { email: "recipient@example.invalid" },
  sender_address: "sender@example.invalid",
  subject: "Votre document",
  html: "<p>Votre document demandé.</p>",
  text: "Votre document demandé.",
  document_id: sampleDocument.id,
  options_json: JSON.stringify({
    emailDeliveryMode: "protected_link",
    protectedDays: 7,
    protectedDocument: {
      hostingId: "hosting_ui",
      expiresAt: "2099-09-28T10:00:00Z",
      durationDays: 7,
      hostingFeeMinor: 100,
    },
  }),
  status: "prepared",
  estimated_minor: 101,
  quote_customer_nanoeur: 1_560_000,
  ceiling_minor: 500,
  currency: "EUR",
  fingerprint: "b".repeat(64),
  created_at: "2026-09-21T10:00:00Z",
  updated_at: "2026-09-21T10:00:00Z",
};

async function fixture(
  page: Page,
  pdfOptions: {
    ready?: Promise<void>;
    pageSize?: [number, number];
    secondPage?: boolean;
    unavailable?: boolean;
    preferredLocale?: "fr" | "en" | "de" | "lb";
  } = {},
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const pdf = await PDFDocument.create();
  pdf
    .addPage(pdfOptions.pageSize)
    .drawText("Fictional protected document UI fixture.");
  if (pdfOptions.secondPage) pdf.addPage().drawText("Second fixture page.");
  const bytes = Buffer.from(await pdf.save());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/content")) {
      await pdfOptions.ready;
      if (pdfOptions.unavailable) {
        await route.fulfill({ status: 503, body: "PDF unavailable" });
        return;
      }
      await route.fulfill({ contentType: "application/pdf", body: bytes });
      return;
    }
    if (request.method() !== "GET") {
      writes.push({ path, body: request.postDataJSON() });
    }
    if (path.startsWith("/api/secure-distributions")) {
      const policy = {
        retentionDays: 30 as const,
        allowOriginalDownload: true,
        allowVaultDeposit: false,
        personalRetentionDays: 365 as const,
        recipientBinding: "verified_email" as const,
      };
      await route.fulfill({
        json: {
          id: "sd_ui",
          status: "prepared",
          dispatchId: dispatch.id,
          title: sampleDocument.name,
          source: sampleDocument,
          recipient: { address: "recipient@example.invalid" },
          invitation: {
            subject: dispatch.subject,
            message: dispatch.text,
            html: dispatch.html,
          },
          policy,
          quote: secureDistributionQuote(policy, 1),
          approved: false,
          approval: null,
          approvalUrl: null,
          recipientBinding: "unclaimed",
          pendingClaim: null,
          recipientUserId: null,
          expiresAt: null,
          audit: [],
        },
      });
      return;
    }
    const body =
      path === "/api/session"
        ? {
            organization: { id: "org_ui", name: "Atelier de contrôle" },
            user: {
              id: "user_ui",
              name: "Camille",
              role: "admin",
              preferredLocale: pdfOptions.preferredLocale,
            },
            simulation: false,
            csrfToken: "fixture-only",
          }
        : path === "/api/capabilities"
          ? {}
          : path === "/api/documents"
            ? { items: [sampleDocument], nextCursor: null }
            : path === "/api/senders"
              ? {
                  items: [
                    {
                      id: "sender_ui",
                      channel: "email",
                      name: "Camille",
                      email: "sender@example.invalid",
                    },
                  ],
                }
              : path.endsWith("/protected-document")
                ? {
                    status: "draft",
                    expiresAt: "2099-09-28T10:00:00Z",
                    hostingFeeMinor: 100,
                  }
                : path.endsWith("/password")
                  ? { password: "fictional-password-for-browser-tests" }
                  : path.endsWith("/revoke")
                    ? { revoked: true }
                    : path === "/api/dispatches"
                      ? dispatch
                      : { dispatch, attempts: [], events: [], approval: null };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return writes;
}

function gate() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

for (const appearance of ["classic", "v2"] as const) {
  test(`${appearance} review keeps consent stationary through PDF loading and a held pointer`, async ({
    page,
    isMobile,
    browserName,
  }, testInfo) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 812 });
    const moduleGate = gate();
    const contentGate = gate();
    const writes = await fixture(page, {
      ready: contentGate.ready,
      pageSize: [595, 2000],
      secondPage: true,
    });
    await page.route("**/assets/pdf-viewer-*.js", async (route) => {
      await moduleGate.ready;
      await route.continue();
    });
    try {
      await page.goto(
        `/?appearance=${appearance}#/app/dispatch/dispatch_protected_ui`,
      );
      const viewport = page.getByRole("region", {
        name: "Aperçu du document approuvé",
      });
      const contentConsent = page.getByRole("checkbox", {
        name: /J’ai vérifié le contenu/,
      });
      const recipientConsent = page.getByRole("checkbox", {
        name: /ce destinataire a demandé/,
      });
      const send = page.getByRole("button", {
        name: "Approuver et envoyer",
        exact: true,
      });
      await expect(viewport.getByRole("status")).toBeVisible();
      await expect(contentConsent).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const documentY = () =>
        recipientConsent.evaluate(
          (element) => element.getBoundingClientRect().top + window.scrollY,
        );
      const frameHeight = () =>
        viewport.evaluate((element) => element.getBoundingClientRect().height);
      const initialY = await documentY();
      const initialHeight = await frameHeight();
      moduleGate.release();
      await expect(
        viewport.locator('.pdf-canvas-wrap[aria-busy="true"]'),
      ).toBeVisible();
      expect(await documentY()).toBeCloseTo(initialY, 0);
      expect(await frameHeight()).toBeCloseTo(initialHeight, 0);
      await contentConsent.check();
      await expect(send).toBeDisabled();
      await expect(recipientConsent).not.toBeChecked();
      await recipientConsent.scrollIntoViewIfNeeded();
      const target = await recipientConsent.boundingBox();
      if (!target) throw new Error("Recipient consent has no clickable box");
      await page.mouse.move(
        target.x + target.width / 2,
        target.y + target.height / 2,
      );
      await page.mouse.down();
      contentGate.release();
      await expect(
        viewport.locator('.pdf-canvas-wrap[aria-busy="false"]'),
      ).toBeVisible();
      await expect(viewport.locator("canvas")).toBeVisible();
      expect(await documentY()).toBeCloseTo(initialY, 0);
      expect(await frameHeight()).toBeCloseTo(initialHeight, 0);
      await page.mouse.up();
      await expect(recipientConsent).toBeChecked();
      await expect(contentConsent).toBeChecked();
      await expect(send).toBeEnabled();
      expect(writes).toEqual([]);

      // The whole long page and its navigation remain reachable without moving consent.
      await viewport.focus();
      await expect(viewport).toBeFocused();
      await page.keyboard.press("End");
      await expect
        .poll(() => viewport.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      expect(await documentY()).toBeCloseTo(initialY, 0);
      await page.keyboard.press("Tab");
      await expect(viewport).not.toBeFocused();
      const nextPage = viewport.getByRole("button", { name: "Page suivante" });
      // Safari's native tab order may skip buttons; verify their activation separately.
      if (browserName === "webkit") await nextPage.focus();
      await expect(nextPage).toBeFocused();
      await page.keyboard.press("Space");
      await expect(viewport.locator("canvas")).toHaveAccessibleName(
        "Aperçu · Page 2",
      );
      await expect(
        viewport.locator('.pdf-canvas-wrap[aria-busy="false"]'),
      ).toBeVisible();
      expect(await documentY()).toBeCloseTo(initialY, 0);
      expect(await frameHeight()).toBeCloseTo(initialHeight, 0);
      await page.keyboard.press("Tab");
      expect(
        await viewport.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(false);
      if (browserName !== "webkit") await expect(contentConsent).toBeFocused();
      await expect(contentConsent).toBeChecked();
      await expect(recipientConsent).toBeChecked();
      expect(writes).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`stable-review-${appearance}.png`),
        fullPage: true,
      });
    } finally {
      moduleGate.release();
      contentGate.release();
      await page.mouse.up();
      await page.unrouteAll({ behavior: "wait" });
    }
  });

  test(`${appearance} review keeps consent stationary when the PDF fails`, async ({
    page,
    isMobile,
  }, testInfo) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 812 });
    const contentGate = gate();
    const writes = await fixture(page, {
      ready: contentGate.ready,
      unavailable: true,
    });
    try {
      await page.goto(
        `/?appearance=${appearance}#/app/dispatch/dispatch_protected_ui`,
      );
      const viewport = page.getByRole("region", {
        name: "Aperçu du document approuvé",
      });
      const contentConsent = page.getByRole("checkbox", {
        name: /J’ai vérifié le contenu/,
      });
      const recipientConsent = page.getByRole("checkbox", {
        name: /ce destinataire a demandé/,
      });
      await expect(
        viewport.locator('.pdf-canvas-wrap[aria-busy="true"]'),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const documentY = () =>
        recipientConsent.evaluate(
          (element) => element.getBoundingClientRect().top + window.scrollY,
        );
      const initialY = await documentY();
      const initialHeight = await viewport.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      await contentConsent.check();
      contentGate.release();
      await expect(viewport.getByRole("alert")).toBeVisible();
      expect(await documentY()).toBeCloseTo(initialY, 0);
      expect(
        await viewport.evaluate(
          (element) => element.getBoundingClientRect().height,
        ),
      ).toBeCloseTo(initialHeight, 0);
      await expect(contentConsent).toBeChecked();
      await expect(recipientConsent).not.toBeChecked();
      await expect(
        page.getByRole("button", { name: "Approuver et envoyer", exact: true }),
      ).toBeDisabled();
      await expect(
        page.locator(".pdf-preview .preview-label a"),
      ).toHaveAttribute(
        "href",
        `/api/documents/${sampleDocument.id}/content?dispatchId=${dispatch.id}`,
      );
      expect(writes).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`stable-review-error-${appearance}.png`),
        fullPage: true,
      });
    } finally {
      contentGate.release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

async function fillMessage(page: Page) {
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("recipient@example.invalid");
  await page.getByLabel(/^Objet(?: \(facultatif\))?$/).fill("Votre document");
  await page
    .getByLabel(/^Message(?: \(facultatif\))?$/)
    .fill("Bonjour <Camille>,\nVoici votre document.");
}

test.describe("localized preparation controls", () => {
  test.use({ locale: "en-GB" });

  for (const appearance of ["classic", "v2"] as const) {
    test(`${appearance} keeps French file copy, full-height expiry and keyboard focus`, async ({
      page,
      isMobile,
      browserName,
    }, testInfo) => {
      await fixture(page, { preferredLocale: "fr" });
      await page.route("**/api/documents", async (route) => {
        if (route.request().method() === "GET") return route.fallback();
        await route.fulfill({ json: sampleDocument });
      });
      await page.route(`**/api/documents/${sampleDocument.id}`, (route) =>
        route.fulfill({ json: sampleDocument }),
      );
      await page.goto(
        `/?lang=fr&appearance=${appearance}#/app/prepare?channel=email`,
      );
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      const upload = page.getByLabel("Ou importer un PDF", { exact: true });
      const uploadSurface = upload.locator("..");
      await expect(uploadSurface.locator(".file-input-button")).toHaveText(
        "Choisir un fichier",
      );
      await expect(uploadSurface.locator(".file-input-name")).toHaveText(
        "Aucun fichier sélectionné",
      );
      const fileName = "Correspondance — vérification française.pdf";
      const chooserReady = page.waitForEvent("filechooser");
      await upload.click();
      const chooser = await chooserReady;
      await chooser.setFiles({
        name: fileName,
        mimeType: "application/pdf",
        buffer: Buffer.from("synthetic UI-only PDF selection"),
      });
      await expect(uploadSurface.locator(".file-input-name")).toHaveText(
        fileName,
      );
      expect(
        await upload.evaluate(
          (element: HTMLInputElement) => element.files?.length,
        ),
      ).toBe(1);
      const expiry = page.getByLabel("Durée d’accès");
      await expiry.selectOption("30");
      await expect(expiry).toHaveValue("30");
      const choice = page.locator(".protected-document-choice");
      const layout = await choice.evaluate((element) => {
        const select = element.querySelector("select")!;
        const hint = element.querySelector(".field-hint")!;
        const selectRect = select.getBoundingClientRect();
        return {
          selectHeight: selectRect.height,
          hintGap: hint.getBoundingClientRect().top - selectRect.bottom,
        };
      });
      expect(layout.selectHeight).toBeGreaterThanOrEqual(44);
      expect(layout.hintGap).toBeGreaterThanOrEqual(8);
      await expect(expiry).toHaveCSS("appearance", "none");
      if (!isMobile) {
        const emailChannel = page.getByRole("radio", {
          name: "E-mail",
          exact: true,
        });
        await emailChannel.locator("..").click();
        expect(
          await emailChannel
            .locator("..")
            .locator("span")
            .evaluate((element) => getComputedStyle(element).outlineStyle),
        ).toBe("none");
        await page.getByLabel("Pièce jointe PDF (facultative)").focus();
        await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
        await expect(upload).toBeFocused();
        const keyboardFocus = await uploadSurface.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            width: style.outlineWidth,
            color: style.outlineColor,
          };
        });
        expect(keyboardFocus.width).toBe("2px");
        expect(keyboardFocus.color).toBe("rgb(24, 27, 34)");
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`localized-controls-${appearance}.png`),
        fullPage: true,
      });
    });
  }
});

test("email without attachment requires its message and leaves automatic HTML to the server", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.goto("/#/app/prepare?channel=email");
  await expect(
    page.getByRole("radio", { name: "E-mail", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Envoyer un lien protégé/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Objet", { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  await expect(page.getByLabel("Message", { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  expect(writes).toEqual([]);
  await fillMessage(page);
  await expect(
    page.frameLocator(".email-preview").locator("body"),
  ).toContainText("Bonjour <Camille>");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  expect(writes[0]?.body).toMatchObject({
    channel: "email",
    text: "Bonjour <Camille>,\nVoici votre document.",
  });
  expect(writes[0]?.body).not.toHaveProperty("html");
  expect(writes[0]?.body).not.toHaveProperty("documentId");
  expect(writes[0]?.body).not.toHaveProperty("options");
});

for (const accountDelivery of [false, true]) {
  test(`document email omits default content for ${accountDelivery ? "My documents" : "attachment"}`, async ({
    page,
  }) => {
    const writes = await fixture(page);
    await page.goto("/?appearance=v2#/app/prepare?channel=email");
    await page
      .getByLabel("Pièce jointe PDF (facultative)")
      .selectOption(sampleDocument.id);
    if (!accountDelivery)
      await page
        .getByLabel("Accès au document", { exact: true })
        .selectOption("attachment");
    await expect(
      page.getByLabel("Objet (facultatif)", { exact: true }),
    ).not.toHaveAttribute("required", "");
    await expect(
      page.getByLabel("Message (facultatif)", { exact: true }),
    ).not.toHaveAttribute("required", "");
    await page
      .getByLabel("Adresse e-mail", { exact: true })
      .fill("recipient@example.invalid");
    await page.getByRole("button", { name: "Vérifier et préparer" }).click();
    await expect(
      page.getByRole("heading", {
        name: accountDelivery ? sampleDocument.name : "Le bon à envoyer.",
      }),
    ).toBeVisible();
    expect(writes[0]?.body.documentId).toBe(sampleDocument.id);
    for (const key of ["subject", "text", "html"])
      expect(writes[0]?.body).not.toHaveProperty(key);
    if (accountDelivery) {
      expect(writes[0]?.path).toBe("/api/secure-distributions");
      expect(writes[0]?.body).toMatchObject({
        retentionDays: 7,
        recipientBinding: "verified_email",
      });
    } else
      expect(writes[0]?.body.options).toEqual({
        emailDeliveryMode: "attachment",
      });
    await expect(
      page.frameLocator(".email-preview").locator("body"),
    ).toContainText("Votre document demandé.");
    await expect(
      page.getByRole("checkbox", {
        name: accountDelivery
          ? /J’ai vérifié le document/
          : /J’ai vérifié le contenu/,
      }),
    ).not.toBeChecked();
  });
}

for (const locale of ["fr", "en", "de", "lb"] as const) {
  test(`${locale} document content controls are optional and restore requirements without a PDF`, async ({
    page,
  }) => {
    const writes = await fixture(page, { preferredLocale: locale });
    await page.goto(
      `/?appearance=v2&lang=${locale}#/app/prepare?channel=email`,
    );
    const attachment = page.locator(".prepare-fields > .field select").first();
    await attachment.selectOption(sampleDocument.id);
    const subjectLabel = {
      fr: "Objet (facultatif)",
      en: "Subject (optional)",
      de: "Betreff (optional)",
      lb: "Betreff (optional)",
    }[locale];
    const messageLabel = {
      fr: "Message (facultatif)",
      en: "Message (optional)",
      de: "Nachricht (optional)",
      lb: "Message (optional)",
    }[locale];
    await expect(page.getByLabel(subjectLabel, { exact: true })).toBeVisible();
    await expect(
      page.getByLabel(messageLabel, { exact: true }),
    ).not.toHaveAttribute("required", "");
    await page.locator(".email-advanced summary").click();

    await expect(page.locator(".email-document-link")).toContainText(
      "{{document_url}}",
    );
    await attachment.selectOption("");
    await expect(page.locator(".email-document-link")).toHaveCount(0);
    await expect(
      page.locator(".prepare-fields input[maxlength='200']"),
    ).toHaveAttribute("required", "");
    await expect(
      page.locator(".prepare-fields textarea:not(.code-input)"),
    ).toHaveAttribute("required", "");
    expect(writes).toEqual([]);
  });
}

test.describe("unsaved account language", () => {
  test.use({ locale: "en-GB" });
  test("document draft copy follows the server French fallback when account language is unset", async ({
    page,
  }) => {
    await fixture(page);
    await page.goto("/?appearance=v2&lang=en#/app/prepare?channel=email");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page
      .locator(".prepare-fields > .field select")
      .first()
      .selectOption(sampleDocument.id);
    await expect(
      page.getByLabel("Subject (optional)", { exact: true }),
    ).toBeVisible();
    await expect(
      page.frameLocator(".email-preview").locator("body"),
    ).toContainText(
      "Atelier de contrôle vous a adressé un document dans Guteneo.",
    );
  });
});

test("account custom HTML inserts an editable styled button and preserves its submitted markup", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.goto("/?appearance=v2#/app/prepare?channel=email");
  await page
    .getByLabel("Pièce jointe PDF (facultative)")
    .selectOption(sampleDocument.id);
  await page
    .getByLabel("Message (facultatif)", { exact: true })
    .fill("Plain-text alternative only.");
  await page.locator(".email-advanced summary").click();
  await page
    .getByLabel("Version HTML", { exact: true })
    .fill('<h2 style="color: #2450db;">Votre document</h2>');
  await page
    .getByRole("button", { name: "Insérer un bouton vers le document" })
    .click();
  const html = await page
    .getByLabel("Version HTML", { exact: true })
    .inputValue();
  expect(html).toContain('href="{{document_url}}"');
  expect(html).toContain("background-color: #2450db");
  expect(html).toContain('<h2 style="color: #2450db;">Votre document</h2>');
  expect(html).not.toContain("Plain-text alternative only.");
  await expect(
    page
      .frameLocator(".email-preview")
      .getByRole("link", { name: "Consulter le document" }),
  ).toHaveAttribute("href", "#");
  await expect(page.getByLabel("Version HTML", { exact: true })).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Insérer un bouton vers le document" }),
  ).toBeDisabled();
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("recipient@example.invalid");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: sampleDocument.name }),
  ).toBeVisible();
  expect(writes[0]?.body.html).toBe(html);
  expect(writes[0]?.body).not.toHaveProperty("subject");
  expect(writes[0]?.body.message).toBe("Plain-text alternative only.");
});

test("inserting the first document button preserves the written message in HTML", async ({
  page,
}) => {
  const writes = await fixture(page);
  const text = "Bonjour <Camille>,\nVotre document & ses pièces.";
  await page.goto("/?appearance=v2#/app/prepare?channel=email");
  await page
    .getByLabel("Pièce jointe PDF (facultative)")
    .selectOption(sampleDocument.id);
  await page.getByLabel("Message (facultatif)", { exact: true }).fill(text);
  await page.locator(".email-advanced summary").click();
  await expect(page.getByLabel("Version HTML", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByRole("button", { name: "Insérer un bouton vers le document" })
    .click();
  const html = await page
    .getByLabel("Version HTML", { exact: true })
    .inputValue();
  expect(html).toContain(
    "<p>Bonjour &lt;Camille&gt;,<br>Votre document &amp; ses pièces.</p>",
  );
  expect(html).toContain('href="{{document_url}}"');
  await expect(
    page.frameLocator(".email-preview").locator("body"),
  ).toContainText("Bonjour <Camille>,");
  await expect(
    page.frameLocator(".email-preview").locator("body"),
  ).toContainText("Votre document & ses pièces.");
  await expect(
    page
      .frameLocator(".email-preview")
      .getByRole("link", { name: "Consulter le document" }),
  ).toHaveCount(1);
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("recipient@example.invalid");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: sampleDocument.name }),
  ).toBeVisible();
  expect(writes[0]?.body).toMatchObject({ message: text, html });
});

test("account delivery is the default and binds its priced access period", async ({
  page,
}, testInfo) => {
  const writes = await fixture(page);
  await page.goto("/?appearance=v2#/app/prepare?channel=email");
  await expect(page.getByLabel("Pièce jointe PDF (facultative)")).toBeVisible();
  const firstUsefulContentMs = await page.evaluate(() => performance.now());
  await page
    .getByLabel("Pièce jointe PDF (facultative)")
    .selectOption(sampleDocument.id);
  await expect(
    page.getByLabel("Accès au document", { exact: true }),
  ).toHaveValue("my_documents");
  await expect(page.getByLabel("Durée d’accès")).toHaveValue("7");
  await page.getByLabel("Durée d’accès").selectOption("30");
  await expect(page.getByText(/Aucun mot de passe de document à transmettre/)).toBeVisible();
  const metrics = await page.evaluate(async () => {
    await document.fonts.ready;
    const resources = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    return {
      resources: resources.length,
      transferredBytes: resources.reduce(
        (sum, entry) => sum + entry.transferSize,
        0,
      ),
      javascriptTransferredBytes: resources
        .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
        .reduce((sum, entry) => sum + entry.transferSize, 0),
      firstContentfulPaintMs:
        performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
        null,
      apiRequests: resources
        .filter((entry) => new URL(entry.name).pathname.startsWith("/api/"))
        .map((entry) => new URL(entry.name).pathname),
      pdfViewerLoaded: resources.some((entry) =>
        /pdf-viewer.*\.js/.test(entry.name),
      ),
    };
  });
  await testInfo.attach("preparation-performance", {
    body: JSON.stringify({ ...metrics, firstUsefulContentMs }, null, 2),
    contentType: "application/json",
  });
  await fillMessage(page);
  await page.screenshot({
    path: testInfo.outputPath("account-email-preparation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: sampleDocument.name }),
  ).toBeVisible();
  expect(writes[0]?.path).toBe("/api/secure-distributions");
  expect(writes[0]?.body).toMatchObject({
    documentId: sampleDocument.id,
    retentionDays: 30,
    recipientBinding: "verified_email",
    allowOriginalDownload: true,
  });
});

test("custom HTML remains optional and uses the message as its accessible text version", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.goto("/#/app/prepare?channel=email");
  await fillMessage(page);
  await page
    .getByText("Personnaliser la version HTML (facultatif)", { exact: true })
    .click();
  await page
    .getByLabel("Version HTML", { exact: true })
    .fill("<h1>Votre document</h1>");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  expect(writes[0]?.body).toMatchObject({
    html: "<h1>Votre document</h1>",
    text: "Bonjour <Camille>,\nVoici votre document.",
  });
});

test("inline PDF import stays in the email workflow and waits for verification", async ({
  page,
}) => {
  await fixture(page);
  await page.clock.install();
  let ready = false;
  const record = () =>
    ready
      ? sampleDocument
      : {
          ...sampleDocument,
          status: "quarantined",
          analysis: {
            state: "processing",
            title: "Vérification en cours",
            message: "Votre PDF est en cours de vérification.",
          },
        };
  await page.route("**/api/documents", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        route.request().method() === "POST"
          ? record()
          : { items: [], nextCursor: null },
      ),
    });
  });
  await page.route(`**/api/documents/${sampleDocument.id}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(record()),
    });
  });
  await page.goto("/#/app/prepare?channel=email");
  await fillMessage(page);
  await page.getByLabel("Ou importer un PDF").setInputFiles({
    name: "Correspondance.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 fixture transfer only"),
  });
  await expect(
    page.getByText("Votre PDF est en cours de vérification."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vérifier et préparer" }),
  ).toBeDisabled();
  ready = true;
  await page.clock.fastForward(15_050);
  await expect(
    page.getByRole("button", { name: "Vérifier et préparer" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Pièce jointe PDF (facultative)")).toHaveValue(
    sampleDocument.id,
  );
  await expect(page).toHaveURL(/#\/app\/prepare\?channel=email$/);
});

test("password reveal is deliberate and revocation describes and confirms its consequence", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.goto("/#/app/dispatch/dispatch_protected_ui");
  await expect(
    page.getByText("fictional-password-for-browser-tests"),
  ).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
  await expect(
    page.getByText("fictional-password-for-browser-tests", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]?.path).toBe(
    "/api/dispatches/dispatch_protected_ui/protected-document/password",
  );
  await page.getByRole("button", { name: "Masquer", exact: true }).click();
  await expect(
    page.getByText("fictional-password-for-browser-tests"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Révoquer l’accès au document", exact: true })
    .click();
  expect(writes).toHaveLength(1);
  await expect(
    page.getByText(/Les copies déjà téléchargées restent accessibles/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Révoquer l’accès au document", exact: true })
    .click();
  await expect(
    page.getByText("L’accès à ce document est révoqué."),
  ).toBeVisible();
  expect(writes[1]?.path).toBe(
    "/api/dispatches/dispatch_protected_ui/protected-document/revoke",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const mode of ["message", "attachment", "protected_link"] as const) {
  test(`one explicit approval sends ${mode}; interrupted acceptance resumes the same dispatch`, async ({
    page,
  }) => {
    await fixture(page);
    let approved = false;
    let accepted = false;
    let confirmations = 0;
    const requests: { action: string; key: string | undefined }[] = [];
    await page.route(
      "**/api/dispatches/dispatch_protected_ui**",
      async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const action = path.split("/").at(-1)!;
        if (request.method() === "POST") {
          requests.push({ action, key: request.headers()["idempotency-key"] });
          if (action === "approve") {
            expect(request.postDataJSON()).toEqual({
              fingerprint: dispatch.fingerprint,
              recipientRequested: true,
            });
            approved = true;
          }
          if (action === "confirm") {
            confirmations++;
            if (confirmations === 1) {
              await route.fulfill({
                status: 503,
                contentType: "application/json",
                body: JSON.stringify({
                  error: {
                    code: "NETWORK",
                    message:
                      "La confirmation a été interrompue. Reprenez ce même envoi.",
                  },
                }),
              });
              return;
            }
            accepted = true;
          }
          await route.fulfill({ contentType: "application/json", body: "{}" });
          return;
        }
        const body =
          action === "protected-document"
            ? {
                status: "draft",
                expiresAt: "2099-09-28T10:00:00Z",
                hostingFeeMinor: 100,
              }
            : {
                dispatch: {
                  ...dispatch,
                  document_id:
                    mode === "message" ? undefined : sampleDocument.id,
                  options_json:
                    mode === "protected_link" ? dispatch.options_json : "{}",
                  status: accepted ? "queued" : "prepared",
                },
                attempts: [],
                events: [],
                approval: approved
                  ? {
                      fingerprint: dispatch.fingerprint,
                      expires_at: "2099-09-28T10:00:00Z",
                      approval_kind: "browser",
                    }
                  : null,
              };
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      },
    );
    await page.goto("/#/app/dispatch/dispatch_protected_ui");
    const send = page.getByRole("button", {
      name: "Approuver et envoyer",
      exact: true,
    });
    await expect(send).toBeDisabled();
    await page
      .getByRole("checkbox", { name: /J’ai vérifié le contenu/ })
      .check();
    await expect(send).toBeDisabled();
    await page
      .getByRole("checkbox", { name: /ce destinataire a demandé/ })
      .check();
    await send.click();
    const resume = page.getByRole("button", {
      name: "Confirmer l’envoi",
      exact: true,
    });
    await expect(resume).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      "Reprenez ce même envoi",
    );
    expect(requests.map((request) => request.action)).toEqual([
      "approve",
      "confirm",
    ]);
    await resume.click();
    await expect(resume).toHaveCount(0);
    expect(requests).toEqual([
      { action: "approve", key: undefined },
      { action: "confirm", key: "web-confirm:dispatch_protected_ui" },
      { action: "confirm", key: "web-confirm:dispatch_protected_ui" },
    ]);
  });
}

for (const locale of ["fr", "en", "de", "lb"] as const) {
  test(`V2 account email renders without remote resources or overflow in ${locale}`, async ({
    page,
    isMobile,
  }, testInfo) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 812 });
    const workspaceName = "Atelier de contrôle";
    const url = `https://guteneo.example/?lang=${locale}#/app/my-documents?invitation=synthetic`;
    const html = cleanEmailHtml(
      renderTransactionalEmail({
        text: documentEmailDefaults(workspaceName, "my_documents", locale).text,
        workspaceName,
        locale,
        accountDocument: { url, retentionDays: 7 },
        documentTitle: "Attestation — Atelier de contrôle.pdf",
        preferencesUrl:
          "https://guteneo.example/?lang=fr#/email-preferences?token=synthetic",
      }),
    ).html;
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setContent(
      `<!doctype html><html lang="${locale}"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f6f5ef">${html}</body></html>`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link")).toHaveCount(3);
    await expect(page.locator('a[href*="/app/my-documents"]')).toHaveAttribute(
      "href",
      url,
    );
    await expect(page.locator("blockquote")).toContainText(
      "Attestation — Atelier de contrôle.pdf",
    );
    expect(requests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (locale === "fr")
      await page.screenshot({
        path: testInfo.outputPath("account-email-v2.png"),
        fullPage: true,
      });
  });
}
