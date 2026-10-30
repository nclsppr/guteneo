import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import {
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
  type PdfValidationPricing,
  type PdfValidationProfile,
  type PdfValidationReport,
} from "../../packages/contracts/src/pdf-validation";
import {
  workspacePermissions,
  type WorkspaceRole,
} from "../../packages/contracts/src/roles";
import type { SupportedLocale } from "../../packages/contracts/src/locale";

const profileRules = {
  ua1: 106,
  ua2: 1727,
  "1b": 129,
  "2b": 144,
  "3b": 146,
  "4": 109,
};
const sha256 = "a".repeat(64);
function report(profile: PdfValidationProfile = "ua1"): PdfValidationReport {
  return {
    id: `report_${profile}`,
    documentId: "validation_document",
    sha256,
    profile,
    createdAt: "2026-10-25T10:00:00Z",
    evidence: "simulation",
    engine: { name: "veraPDF", version: "1.30.2" },
    compliant: false,
    passedRules: profileRules[profile] - 1,
    failedRules: 1,
    failedChecks: 2,
    truncated: false,
    findings: [
      {
        specification:
          profile === "ua2"
            ? "ISO 14289-2:2024"
            : profile === "ua1"
              ? "ISO 14289-1:2014"
              : `ISO 19005-${profile[0]}:2012`,
        clause: "7.1",
        testNumber: 1,
        failedChecks: 2,
      },
    ],
    manualReviewRequired: true,
    manualChecks: [
      { id: "reading_order", title: "Reading order" },
      { id: "alternative_text", title: "Alternative text" },
    ],
    status: "failed",
    certification: false,
  };
}
async function fixture(
  page: Page,
  {
    role = "admin",
    enabled = true,
    credit = 5000,
    locale = "fr",
    existing = false,
    contentReady,
    pageSize = [300, 400],
  }: {
    role?: WorkspaceRole;
    enabled?: boolean;
    credit?: number;
    locale?: SupportedLocale;
    existing?: boolean;
    contentReady?: Promise<void>;
    pageSize?: [number, number];
  } = {},
) {
  const writes: { path: string; body: unknown; key?: string }[] = [];
  const reads: string[] = [];
  const pricing: PdfValidationPricing = {
    enabled,
    priceMinor: PDF_VALIDATION_PRICE_MINOR,
    currency: "EUR",
    taxBasis: "excluding_tax",
    termsVersion: PDF_VALIDATION_TERMS_VERSION,
    paymentSource: "account_credits",
    purchaseAllowed: role === "admin",
    creditAvailableMinor: role === "admin" ? credit : null,
    evidence: "simulation",
  };
  const pdf = await PDFDocument.create();
  pdf.addPage(pageSize);
  const bytes = await pdf.save();
  const document = {
    id: "validation_document",
    name: "Document de contrôle.pdf",
    sha256,
    status: "ready",
    size: bytes.byteLength,
    pages: 1,
    source: "import",
    created_at: "2026-10-25T10:00:00Z",
  };
  const reports = existing ? [report()] : [];
  let nextError: "network" | "price" | undefined;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") reads.push(path);
    else
      writes.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()["idempotency-key"],
      });
    let body: unknown = { items: [], nextCursor: null };
    if (path === "/api/session")
      body = {
        organization: { id: "pdf_check_fixture", name: "Atelier PDF" },
        user: {
          id: `user_${role}`,
          name: "Camille",
          role,
          preferredLocale: locale,
        },
        permissions: workspacePermissions(role),
        csrfToken: "fixture-only",
        simulation: true,
      };
    else if (path === "/api/capabilities")
      body = { mode: "production", pdfValidation: { available: enabled } };
    else if (path === "/api/pdf-validation/pricing") body = pricing;
    else if (path === "/api/documents")
      body = { items: [document], nextCursor: null };
    else if (path === `/api/documents/${document.id}`) body = document;
    else if (path === `/api/documents/${document.id}/content`) {
      await contentReady;
      await route.fulfill({
        contentType: "application/pdf",
        body: Buffer.from(bytes),
      });
      return;
    } else if (path === `/api/documents/${document.id}/validation`) {
      if (request.method() === "GET") body = { items: reports };
      else {
        if (nextError) {
          const error = nextError;
          nextError = undefined;
          if (error === "network") await route.abort("failed");
          else
            await route.fulfill({
              status: 409,
              json: {
                error: {
                  code: "PDF_VALIDATION_PRICE_CHANGED",
                  message: "Price changed",
                },
              },
            });
          return;
        }
        const value = report(request.postDataJSON().profile);
        reports.push(value);
        pricing.creditAvailableMinor =
          (pricing.creditAvailableMinor ?? 0) - PDF_VALIDATION_PRICE_MINOR;
        body = value;
      }
    }
    await route.fulfill({ json: body });
  });
  return {
    writes,
    reads,
    pricing,
    reports,
    fail: (error: "network" | "price") => {
      nextError = error;
    },
  };
}
const validation = (page: Page) => page.locator(".pdf-validation");
const purchaseButton = (page: Page) =>
  validation(page).getByRole("button", {
    name: /Payer.*HT et contrôler ce PDF/,
  });
const consentBox = (page: Page) =>
  validation(page).getByRole("checkbox", {
    name: /Je confirme ce contrôle unique/,
  });
async function openDocument(page: Page) {
  await page.goto("/#/app/documents?document=validation_document");
  await expect(validation(page)).toBeVisible();
}

function gate() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

test(`document keeps paid consent stationary through PDF loading and a held pointer`, async ({
  page,
}) => {
  const moduleGate = gate();
  const contentGate = gate();
  const state = await fixture(page, {
    contentReady: contentGate.ready,
    pageSize: [595, 2000],
  });
  await page.route("**/assets/pdf-viewer-*.js", async (route) => {
    await moduleGate.ready;
    await route.continue();
  });
  try {
    await page.goto(`/#/app/documents?document=validation_document`);
    await expect(validation(page)).toBeVisible();
    await expect(
      page.locator(".pdf-preview").getByRole("status"),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const documentY = () =>
      consentBox(page).evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY,
      );
    const initialY = await documentY();
    moduleGate.release();
    await expect(
      page.locator('.pdf-canvas-wrap[aria-busy="true"]'),
    ).toBeVisible();
    expect(await documentY()).toBeCloseTo(initialY, 0);
    await consentBox(page).scrollIntoViewIfNeeded();
    const target = await consentBox(page).boundingBox();
    if (!target) throw new Error("Paid consent has no clickable box");
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
    );
    await page.mouse.down();
    contentGate.release();
    await expect(
      page.locator('.pdf-canvas-wrap[aria-busy="false"]'),
    ).toBeVisible();
    await expect(page.locator(".pdf-preview canvas")).toBeVisible();
    expect(await documentY()).toBeCloseTo(initialY, 0);
    await page.mouse.up();
    await expect(consentBox(page)).toBeChecked();
    await expect(purchaseButton(page)).toBeEnabled();
    expect(state.writes).toEqual([]);

    const viewport = page.locator(".pdf-preview-viewport");
    await viewport.focus();
    await page.keyboard.press("End");
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await documentY()).toBeCloseTo(initialY, 0);
    expect(state.writes).toEqual([]);
  } finally {
    moduleGate.release();
    contentGate.release();
  }
});

test("one paid check requires explicit consent bound to its PDF, profile and ten-cent price", async ({
  page,
}, info) => {
  const state = await fixture(page);
  await openDocument(page);
  await expect(validation(page)).toContainText("0,10");
  await expect(validation(page)).toContainText("HT par PDF et par profil");
  await expect(purchaseButton(page)).toBeDisabled();
  expect(state.writes).toEqual([]);
  await validation(page).screenshot({
    path: info.outputPath("pdf-check-confirmation.png"),
  });
  await consentBox(page).check();
  await expect(purchaseButton(page)).toBeEnabled();
  await validation(page).getByLabel("Profil de validation").selectOption("ua2");
  await expect(consentBox(page)).not.toBeChecked();
  await expect(purchaseButton(page)).toBeDisabled();
  await consentBox(page).check();
  await purchaseButton(page).click();
  await expect(
    validation(page).locator(".pdf-validation-report"),
  ).toContainText("PDF/UA-2");
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({
    path: "/api/documents/validation_document/validation",
    body: {
      profile: "ua2",
      purchase: {
        confirmed: true,
        documentSha256: sha256,
        priceMinor: 10,
        currency: "EUR",
        termsVersion: PDF_VALIDATION_TERMS_VERSION,
      },
    },
  });
  expect(state.writes[0].key).toBeTruthy();
  await expect(consentBox(page)).not.toBeChecked();
  await expect(purchaseButton(page)).toBeDisabled();
  await expect(validation(page)).toContainText(
    "sans rapport exploitable n’est pas facturé",
  );
  await page.screenshot({
    path: info.outputPath("pdf-check-purchase.png"),
    fullPage: true,
  });
});

test("uncertain responses retain the same purchase key until the user explicitly retries", async ({
  page,
}) => {
  const state = await fixture(page);
  state.fail("network");
  await openDocument(page);
  await consentBox(page).check();
  await purchaseButton(page).click();
  await expect(validation(page).getByRole("alert")).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await purchaseButton(page).click();
  await expect(
    validation(page).locator(".pdf-validation-report"),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].key).toBe(state.writes[0].key);
});

test("a changed price revokes the old confirmation and requires a fresh user action", async ({
  page,
}) => {
  const state = await fixture(page);
  state.fail("price");
  await openDocument(page);
  await consentBox(page).check();
  await purchaseButton(page).click();
  await expect(validation(page).getByRole("alert")).toContainText(
    "conditions du contrôle ont changé",
  );
  await expect(consentBox(page)).not.toBeChecked();
  await expect(purchaseButton(page)).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  await consentBox(page).check();
  await purchaseButton(page).click();
  await expect(
    validation(page).locator(".pdf-validation-report"),
  ).toBeVisible();
  expect(state.writes[1].key).not.toBe(state.writes[0].key);
});

for (const profile of Object.keys(profileRules) as PdfValidationProfile[]) {
  test(`paid ${profile} report preserves original bytes, manual review and keyboard export`, async ({
    page,
  }) => {
    const state = await fixture(page);
    await openDocument(page);
    await validation(page)
      .getByLabel("Profil de validation")
      .selectOption(profile);
    await consentBox(page).check();
    await purchaseButton(page).click();
    const result = validation(page).locator(".pdf-validation-report");
    await expect(result).toContainText(sha256);
    await expect(result).toContainText("Revue humaine à compléter");
    await expect(result).toContainText("ni une certification d’accessibilité");
    const downloaded = page.waitForEvent("download");
    // Exercise the native button's keyboard activation. Mobile WebKit may
    // dispatch a coordinate click before its compositor finishes scrolling.
    await result
      .getByRole("button", { name: "Exporter le rapport JSON" })
      .press("Enter");
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(
      `guteneo-${profile}-report_${profile}.json`,
    );
    expect(await download.failure()).toBeNull();
    const path = await download.path();
    expect(path).not.toBeNull();
    expect(await readFile(path!, "utf8")).toBe(
      JSON.stringify(report(profile), null, 2),
    );
    expect(state.writes).toHaveLength(1);
  });
}

for (const role of ["viewer", "member", "supervisor"] as const) {
  test(`${role} can read historical reports without receiving purchase controls`, async ({
    page,
  }) => {
    const state = await fixture(page, { role, existing: true });
    await openDocument(page);
    await expect(
      validation(page).locator(".pdf-validation-report"),
    ).toBeVisible();
    await expect(validation(page).getByRole("checkbox")).toHaveCount(0);
    await expect(purchaseButton(page)).toHaveCount(0);
    await expect(validation(page)).toContainText(
      "Seul un administrateur connecté dans le navigateur",
    );
    expect(state.writes).toEqual([]);
  });
}

test("public entry opens the unit-check offer without creating a purchase", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#pdf-checks");
  await page.locator("a#pdf-checks").click();
  await expect(page).toHaveURL(/\/pdf-checks\/$/);
  const entry = page
    .locator(".pdf-check-public")
    .getByRole("link", { name: "Découvrir les contrôles PDF" });
  await expect(entry).toHaveAttribute("href", "/app/pdf-checks");
  await entry.click();
  await expect(page).toHaveURL(/\/#\/app\/pdf-checks$/);
  await expect(
    page.getByRole("heading", { name: "Contrôles PDF", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pdf-check-offer")).toContainText("0,10");
  await expect(
    page.getByRole("button", { name: /Souscrire|Résilier/ }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("insufficient credit blocks a new check while historical reports remain readable", async ({
  page,
}) => {
  const state = await fixture(page, { credit: 9, existing: true });
  await openDocument(page);
  await expect(purchaseButton(page)).toBeDisabled();
  await expect(consentBox(page)).toBeDisabled();
  await expect(validation(page)).toContainText(
    "crédit disponible est insuffisant",
  );
  await expect(
    validation(page).locator(".pdf-validation-report"),
  ).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("disabled checks retain readable reports and never claim a subscription is required", async ({
  page,
}) => {
  const state = await fixture(page, { enabled: false, existing: true });
  await openDocument(page);
  await expect(
    validation(page).locator(".pdf-validation-report"),
  ).toBeVisible();
  await expect(purchaseButton(page)).toHaveCount(0);
  await expect(validation(page)).toContainText(
    "rapports existants restent consultables",
  );
  await page.goto("/#/app/pdf-checks");
  await expect(
    page.getByRole("heading", { name: "Contrôles PDF", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Souscrire|Résilier/ }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

for (const [locale, title, priceLabel] of [
  ["fr", "Vérification d’accessibilité PDF", "HT, par PDF et par profil"],
  ["en", "PDF accessibility checks", "excluding tax, per PDF and profile"],
  [
    "de",
    "PDF-Prüfungen zur Barrierefreiheit",
    "zzgl. Steuern, pro PDF und Profil",
  ],
  [
    "lb",
    "PDF-Kontrolle fir Accessibilitéit",
    "ouni Steieren, pro PDF a Profil",
  ],
] as const) {
  test(`public unit price and availability are translated in ${locale}`, async ({
    page,
  }, info) => {
    const state = await fixture(page, { locale });
    await page.goto(`/pdf-checks/?lang=${locale}`);
    const offer = page.locator(".pdf-check-public");
    await expect(
      offer.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(offer).toContainText(priceLabel);
    await expect(offer).toContainText(/0[,.]10/);
    await expect(offer.locator("a")).toHaveAttribute(
      "href",
      /app(?:%2F|\/)pdf-checks/,
    );
    expect(await offer.innerText()).not.toMatch(
      /Horizon|30\s?€|€30|100.*(?:mois|month)/i,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    expect(state.writes).toEqual([]);
    await offer.screenshot({
      path: info.outputPath(`pdf-check-public-${locale}.png`),
    });
  });
}
