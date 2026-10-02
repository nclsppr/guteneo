import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

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

async function fixture(page: Page) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Fictional protected document UI fixture.");
  const bytes = Buffer.from(await pdf.save());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/content")) {
      await route.fulfill({ contentType: "application/pdf", body: bytes });
      return;
    }
    if (request.method() !== "GET") {
      writes.push({ path, body: request.postDataJSON() });
    }
    const body =
      path === "/api/session"
        ? {
            organization: { id: "org_ui", name: "Atelier de contrôle" },
            user: { id: "user_ui", name: "Camille", role: "admin" },
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

async function fillMessage(page: Page) {
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("recipient@example.invalid");
  await page.getByLabel("Objet", { exact: true }).fill("Votre document");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Bonjour <Camille>,\nVoici votre document.");
}

test("email without attachment needs one message and escapes its automatic HTML", async ({
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
  await fillMessage(page);
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  expect(writes[0]?.body).toMatchObject({
    channel: "email",
    text: "Bonjour <Camille>,\nVoici votre document.",
    html: "<p>Bonjour &lt;Camille&gt;,<br>Voici votre document.</p>",
  });
  expect(writes[0]?.body).not.toHaveProperty("documentId");
  expect(writes[0]?.body).not.toHaveProperty("options");
});

test("PDF protection is optional, priced before preparation and binds its selected duration", async ({
  page,
}, testInfo) => {
  const writes = await fixture(page);
  await page.goto("/#/app/prepare?channel=email");
  await page
    .getByLabel("Pièce jointe PDF (facultative)")
    .selectOption(sampleDocument.id);
  const protection = page.getByRole("checkbox", {
    name: /Envoyer un lien protégé/,
  });
  await expect(protection).not.toBeChecked();
  await expect(page.getByText(/1 € par document hébergé/)).toBeVisible();
  await protection.check();
  await expect(page.getByLabel("Expiration du lien")).toHaveValue("7");
  await page.getByLabel("Expiration du lien").selectOption("30");
  await expect(
    page.getByText(/ce n’est pas un chiffrement de bout en bout/),
  ).toBeVisible();
  await fillMessage(page);
  await page.screenshot({
    path: testInfo.outputPath("protected-email-preparation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  expect(writes[0]?.body).toMatchObject({
    documentId: sampleDocument.id,
    options: { emailDeliveryMode: "protected_link", protectedDays: 30 },
  });
  await expect(page.locator(".protected-document-summary")).toContainText(
    "1,00",
  );
  await expect(page.getByText("1,00156 €", { exact: true })).toBeVisible();
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
