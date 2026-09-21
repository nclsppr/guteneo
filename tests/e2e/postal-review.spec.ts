import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdir } from "node:fs/promises";
import type { PostalReview } from "../../packages/contracts/src/postal-review";

const cropPath = "/api/postal/preflights/postal-ui-fixture/address.png";
const canonicalCropUrl = `https://guteneo.com${cropPath}`;

// UI fixtures only: all API calls are intercepted. No PDF reaches Pingen,
// no production account is authenticated and no ledger entry is created.
async function setup(
  page: Page,
  variant:
    | "ready"
    | "blocked"
    | "unknown"
    | "crop_failed"
    | "lost_response"
    | "quote_network"
    | "quote_pending" = "ready",
  cropUrl: string | null = canonicalCropUrl,
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage([595.28, 841.89])
    .drawText("ATELIER EXEMPLE\nRue du Test 12\nL-1234 LUXEMBOURG", {
      x: 65,
      y: 655,
      font,
      size: 11,
      lineHeight: 14,
    });
  const pdfBytes = Buffer.from(await pdf.save());
  const mutations: {
    path: string;
    body: unknown;
    csrf: string | undefined;
    key: string | undefined;
  }[] = [];
  const unmatched: string[] = [];
  const cropRequests: string[] = [];
  let quotePending = true;
  const controls = { cropFails: variant === "crop_failed" };
  const review: PostalReview = {
    id: "postal-ui-fixture",
    status: variant === "blocked" ? "blocked" : "review_required",
    document: {
      id: "pdf-ui-fixture",
      name: "Courrier de vérification — exemple.pdf",
      sha256: "a".repeat(64),
      pages: 1,
      previewUrl: "/api/documents/pdf-ui-fixture/content",
    },
    recipient: {
      name: "ATELIER EXEMPLE",
      line1: "Rue du Test 12",
      postalCode: "L-1234",
      city: "LUXEMBOURG",
      country: "LU",
    },
    options: {
      addressPosition: "left",
      deliveryProduct: "cheap",
      printMode: "simplex",
      printSpectrum: "grayscale",
    },
    ceilingMinor: 500,
    reviewUrl: "http://localhost:8787/#/app/postal/postal-ui-fixture",
    checks: {
      complete: true,
      dpi: 144,
      pages: [{ page: 1, width: 1191, height: 1684 }],
      issues:
        variant === "blocked"
          ? [{ code: "POSTAL_CORNER_CONTENT", page: 1 }]
          : [],
    },
    address: {
      expectedLines: ["ATELIER EXEMPLE", "Rue du Test 12", "L-1234 LUXEMBOURG"],
      extractedLines: [
        "ATELIER EXEMPLE",
        "Rue du Test 12",
        "L-1234 LUXEMBOURG",
      ],
      matches: true,
      textVisibility: "not_verified",
      cropAccess: "authenticated_browser_session_only",
      mcpEmbeddedVisualEvidenceAvailable: false,
      cropUrl,
    },
    canTransfer: variant !== "blocked" && variant !== "unknown",
    transferPolicy: {
      canTransferMeaning: "browser_session_only",
      expertTool: "transfer_postal_draft",
      expertAuthority: "separate_active_postal_transfer_mandate_required",
      expertEligibilityEvaluated: false,
      requiresVisualReview: true,
    },
    transferStatus: variant === "unknown" ? "unknown" : "not_started",
    draftId: null,
    canSend: false,
  };
  const readyDocument = {
    ...review.document,
    status: "ready",
    source: "import",
    size: pdfBytes.length,
  };
  // Generate a clearly synthetic image for the UI fixture, never a preflight proof.
  await page.goto("about:blank");
  const crop = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 520;
    canvas.height = 220;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 520, 220);
    context.fillStyle = "#181b22";
    context.font = "18px sans-serif";
    ["ATELIER EXEMPLE", "Rue du Test 12", "L-1234 LUXEMBOURG"].forEach(
      (line, index) => context.fillText(line, 24, 115 + index * 24),
    );
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
    if (request.method() !== "GET")
      mutations.push({
        path,
        body: request.postData() ? request.postDataJSON() : null,
        csrf: request.headers()["x-csrf-token"],
        key: request.headers()["idempotency-key"],
      });
    if (path.endsWith("/address.png")) {
      cropRequests.push(request.url());
      return route.fulfill(
        controls.cropFails
          ? { status: 503, body: "" }
          : { contentType: "image/png", body: Buffer.from(crop, "base64") },
      );
    }
    if (path === "/documents/pdf-ui-fixture/content")
      return route.fulfill({ contentType: "application/pdf", body: pdfBytes });
    let body: unknown,
      status = 200;
    if (path === "/session")
      body = {
        organization: { id: "org-postal-ui", name: "Atelier de test postal" },
        user: { id: "user-postal-ui", name: "Camille Exemple", role: "admin" },
        csrfToken: "ui-csrf",
        simulation: false,
        verifiedAccount: true,
      };
    else if (path === "/capabilities")
      body = { registration: { enabled: true } };
    else if (path === "/documents")
      body = {
        items: [readyDocument],
        nextCursor: null,
      };
    else if (request.method() === "GET" && path === "/documents/pdf-ui-fixture")
      body = readyDocument;
    else if (path === "/postal/requirements")
      body = {
        profile: {
          addressPosition: "left",
          addressPositions: ["left", "right"],
        },
      };
    else if (path === "/senders")
      body = {
        items: [
          {
            id: "sender-postal-ui",
            name: "Expéditeur de test",
            channel: "postal",
            status: "verified",
          },
        ],
      };
    else if (
      path === "/postal/preflights" ||
      path === "/postal/preflights/postal-ui-fixture"
    )
      body = review;
    else if (path.endsWith("/transfer")) {
      review.transferStatus = "prepared";
      review.canTransfer = false;
      review.draftId = "draft-ui";
      if (variant === "lost_response") return route.abort("failed");
      body = review;
    } else if (path.endsWith("/quote")) {
      if (variant === "quote_network") return route.abort("failed");
      if (quotePending || variant === "quote_pending") {
        quotePending = false;
        status = 409;
        body = {
          error: {
            code: "POSTAL_DRAFT_NOT_READY",
            message: "Le courrier est encore en cours d’analyse.",
          },
        };
      } else body = { id: "dispatch-ui" };
    } else if (path === "/dispatches/dispatch-ui") {
      body = {
        dispatch: {
          id: "dispatch-ui",
          status: "prepared",
          channel: "postal",
          document_id: review.document.id,
          recipient_json: review.recipient,
          mode: "production",
          ceiling_minor: 500,
          estimated_minor: 200,
          currency: "EUR",
          fingerprint: "fixture-fingerprint",
          created_at: "2026-09-17T00:00:00Z",
          updated_at: "2026-09-17T00:00:00Z",
          quote_expires_at: "2099-01-01T00:00:00Z",
        },
        events: [],
        attempts: [],
        approval: null,
      };
    } else {
      unmatched.push(`${request.method()} ${path}`);
      status = 404;
      body = {
        error: {
          code: "UI_FIXTURE_MISSING",
          message: "Donnée de test absente.",
        },
      };
    }
    await route.fulfill({ status, json: body });
  });
  await page.goto("/#/app/postal/postal-ui-fixture");
  return { mutations, unmatched, review, controls, cropRequests };
}

for (const format of ["canonical", "current-origin", "relative"] as const)
  test(`postal crop accepts ${format} API URLs and loads only the current authenticated endpoint`, async ({
    page,
    baseURL,
  }) => {
    const cropUrl =
      format === "canonical"
        ? canonicalCropUrl
        : format === "current-origin"
          ? new URL(cropPath, baseURL).href
          : cropPath;
    const fixture = await setup(page, "ready", cropUrl);
    await expect(
      page.getByRole("complementary", { name: "Heure limite de traitement" }),
    ).toContainText("01 h 00");
    const image = page.getByRole("img", {
      name: /Extrait de la première page/,
    });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", cropPath);
    await expect(
      page.getByRole("button", {
        name: "Valider le document et obtenir le prix",
      }),
    ).toBeEnabled();
    expect(fixture.cropRequests).toEqual([new URL(cropPath, baseURL).href]);
    expect(fixture.mutations).toEqual([]);
    expect(fixture.unmatched).toEqual([]);
  });

for (const [reason, cropUrl] of [
  ["foreign origin", `https://outside.invalid${cropPath}`],
  ["lookalike origin", `https://guteneo.com.outside.invalid${cropPath}`],
  ["credentials", `https://user:password@guteneo.com${cropPath}`],
  [
    "another preflight",
    "https://guteneo.com/api/postal/preflights/another/address.png",
  ],
  ["query", `${canonicalCropUrl}?download=1`],
  ["fragment", `${canonicalCropUrl}#address`],
  ["data URL", "data:image/png;base64,iVBORw0KGgo="],
] as const)
  test(`postal crop rejects ${reason} without requesting an image or enabling transfer`, async ({
    page,
  }) => {
    const fixture = await setup(page, "ready", cropUrl);
    await expect(
      page.getByText("L’extrait de la zone d’adresse est indisponible.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Extrait de la première page/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Valider le document et obtenir le prix",
      }),
    ).toBeDisabled();
    expect(fixture.cropRequests).toEqual([]);
    expect(fixture.mutations).toEqual([]);
    expect(fixture.unmatched).toEqual([]);
  });

test("one explicit review action transfers once and follows the quote automatically", async ({
  page,
}, testInfo) => {
  const fixture = await setup(page);
  await expect(page.locator(".pdf-canvas-wrap canvas")).toBeVisible();
  const transfer = page.getByRole("button", {
    name: "Valider le document et obtenir le prix",
  });
  await expect(transfer).toBeEnabled();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByText(/Vous autorisez le transfert de ce PDF/),
  ).toBeVisible();
  expect(fixture.mutations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await mkdir("reports/screenshots/postal-review", { recursive: true });
  await page.screenshot({
    path: `reports/screenshots/postal-review/${testInfo.project.name}.png`,
    fullPage: true,
  });
  await transfer.click();
  await expect(page).toHaveURL(/#\/app\/dispatch\/dispatch-ui$/);
  const transfers = fixture.mutations.filter((m) =>
    m.path.endsWith("/transfer"),
  );
  expect(transfers).toEqual([
    {
      path: "/postal/preflights/postal-ui-fixture/transfer",
      body: { reviewed: true, consentToTransfer: true },
      csrf: "ui-csrf",
      key: undefined,
    },
  ]);
  const quotes = fixture.mutations.filter((m) => m.path.endsWith("/quote"));
  expect(quotes).toHaveLength(2);
  expect(quotes[0].key).toBeTruthy();
  expect(quotes[1].key).toBe(quotes[0].key);
  await page.goto("/#/app/postal/postal-ui-fixture");
  await expect(page).toHaveURL(/#\/app\/dispatch\/dispatch-ui$/);
  expect(fixture.mutations.at(-1)?.key).toBe(quotes[0].key);
  expect(
    fixture.mutations.some((m) => /send|confirm|approve/.test(m.path)),
  ).toBe(false);
  expect(fixture.unmatched).toEqual([]);
});

test("lost transfer response reconciles before following the quote, never retransfers", async ({
  page,
}) => {
  const fixture = await setup(page, "lost_response");
  await expect(page.locator(".pdf-canvas-wrap canvas")).toBeVisible();
  const transfer = page.getByRole("button", {
    name: "Valider le document et obtenir le prix",
  });
  await transfer.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(transfer).toBeDisabled();
  expect(fixture.mutations).toHaveLength(1);
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/dispatch\/dispatch-ui$/);
  expect(
    fixture.mutations.filter((m) => m.path.endsWith("/transfer")),
  ).toHaveLength(1);
  expect(fixture.unmatched).toEqual([]);
});

test("an uncertain quote result stops automatic polling", async ({ page }) => {
  const fixture = await setup(page, "quote_network");
  await page
    .getByRole("button", { name: "Valider le document et obtenir le prix" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Connexion interrompue");
  await page.clock.install();
  await page.clock.fastForward(65000);
  expect(
    fixture.mutations.filter((m) => m.path.endsWith("/quote")),
  ).toHaveLength(1);
  expect(
    fixture.mutations.filter((m) => m.path.endsWith("/transfer")),
  ).toHaveLength(1);
  expect(fixture.unmatched).toEqual([]);
});

test("quote followup is bounded and can be resumed explicitly", async ({
  page,
}) => {
  await page.clock.install();
  const fixture = await setup(page, "quote_pending");
  await page
    .getByRole("button", { name: "Valider le document et obtenir le prix" })
    .click();
  for (let i = 1; i <= 20; i++) {
    await expect
      .poll(
        () => fixture.mutations.filter((m) => m.path.endsWith("/quote")).length,
      )
      .toBe(i);
    await page.clock.fastForward(3001);
  }
  await expect(
    page.getByRole("button", { name: "Reprendre le devis" }),
  ).toBeEnabled();
  await page.clock.fastForward(65000);
  expect(
    fixture.mutations.filter((m) => m.path.endsWith("/quote")),
  ).toHaveLength(20);
  expect(fixture.unmatched).toEqual([]);
});

test("an unavailable address crop can recover only after refresh and explicit review", async ({
  page,
}) => {
  const fixture = await setup(page, "crop_failed");
  await expect(
    page.getByText("L’extrait de la zone d’adresse est indisponible.", {
      exact: false,
    }),
  ).toBeVisible();
  fixture.controls.cropFails = false;
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Extrait de la première page/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Valider le document et obtenir le prix",
    }),
  ).toBeEnabled();
  expect(fixture.mutations).toEqual([]);
  expect(fixture.unmatched).toEqual([]);
});

for (const variant of ["blocked", "unknown", "crop_failed"] as const)
  test(`postal ${variant} cannot transmit a PDF`, async ({ page }) => {
    const fixture = await setup(page, variant);
    await expect(
      page.getByRole("heading", { name: "La fenêtre de l’enveloppe" }),
    ).toBeVisible();
    if (variant === "unknown") {
      await expect(page.getByRole("alert")).toContainText(
        "Ne recréez pas de brouillon",
      );
      await expect(
        page.getByRole("button", {
          name: "Valider le document et obtenir le prix",
        }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole("button", {
          name: "Valider le document et obtenir le prix",
        }),
      ).toBeDisabled();
    }
    if (variant === "blocked")
      await expect(page.locator(".postal-issues")).toContainText("Page 1");
    if (variant === "crop_failed")
      await expect(
        page.getByText("L’extrait de la zone d’adresse est indisponible.", {
          exact: false,
        }),
      ).toBeVisible();
    expect(fixture.mutations).toEqual([]);
    expect(fixture.unmatched).toEqual([]);
  });

test("postal preparation sends only document identity and selected options for server preflight", async ({
  page,
}, testInfo) => {
  const fixture = await setup(page);
  await page.goto("/#/app/prepare?document=pdf-ui-fixture");
  await page.getByRole("radio", { name: "Courrier" }).check();
  await page
    .getByLabel("Nom du destinataire", { exact: true })
    .fill("ATELIER EXEMPLE");
  await page.getByLabel("Adresse", { exact: true }).fill("Rue du Test 12");
  await page.getByLabel("Code postal", { exact: true }).fill("L-1234");
  await page.getByLabel("Ville", { exact: true }).fill("LUXEMBOURG");
  await page.getByLabel("Pays", { exact: true }).selectOption("LU");
  await page.getByRole("radio", { name: "À droite", exact: true }).check();
  await page.getByText("Budget maximum :", { exact: false }).click();
  const budget = page.getByLabel("Budget maximum en euros", { exact: true });
  await budget.fill("");
  await budget.pressSequentially("5.25");
  await expect(budget).toHaveValue("5.25");
  await page.getByText("Budget maximum :", { exact: false }).click();
  await expect(page.locator("main")).not.toContainText(/pingen/i);
  await mkdir("reports/screenshots/postal-prepare", { recursive: true });
  await page.screenshot({
    path: `reports/screenshots/postal-prepare/${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Préparer le courrier" }).click();
  await expect(page).toHaveURL(/#\/app\/postal\/postal-ui-fixture$/);
  const mutation = fixture.mutations[0];
  expect(mutation.path).toBe("/postal/preflights");
  expect(mutation.body).toEqual({
    documentId: "pdf-ui-fixture",
    senderId: "sender-postal-ui",
    recipient: fixture.review.recipient,
    options: {
      printMode: "simplex",
      printSpectrum: "grayscale",
      deliveryProduct: "cheap",
      addressPosition: "right",
    },
    ceilingMinor: 525,
  });
  expect(mutation.key).toBeTruthy();
  expect(fixture.mutations).toHaveLength(1);
  expect(fixture.unmatched).toEqual([]);
});
