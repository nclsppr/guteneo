import { createHash } from "node:crypto";
import { expect, test, type Page } from "./fixtures";
import { PDFDocument } from "pdf-lib";
import type { DocumentRecord, Session } from "../../apps/web/src/api";
import { documentAnalysis } from "../../packages/contracts/src/document-analysis";

// Browser-only HTTP fixtures. Scanner, byte integrity, tenant and quota proofs
// live in the D1 unit tests. These scenarios do not send communications.
async function documentFixture(page: Page) {
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  const session = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  expect(session.simulation).toBe(true);
  await page.clock.install();
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).drawText("Original PDF retained during verification");
  const bytes = Buffer.from(await pdf.save());
  let document: DocumentRecord = {
    id: "doc_analysis_browser_fixture",
    name: "Mon document original.pdf",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    pages: 0,
    status: "quarantined",
    source: "import",
    created_at: "2026-09-17T12:00:00.000Z",
    analysis: documentAnalysis("quarantined", "processing", "scanner_starting"),
  };
  const other: DocumentRecord = {
    ...document,
    id: "doc_other_browser_fixture",
    name: "Autre document.pdf",
    analysis: documentAnalysis("quarantined"),
  };
  let listIncludesTarget = true;
  let failRead = false;
  let rescanUnavailable = false;
  let holdRead: Promise<void> | undefined;
  let reads = 0;
  let rescans = 0;
  const contentPaths: string[] = [];
  const unexpectedWrites: string[] = [];
  await page.route(/\/api\/documents(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/documents" && request.method() === "GET") {
      return route.fulfill({
        json: {
          items: listIncludesTarget ? [document, other] : [other],
          nextCursor: null,
        },
      });
    }
    if (
      pathname === `/api/documents/${document.id}` &&
      request.method() === "GET"
    ) {
      reads++;
      if (failRead) return route.abort("failed");
      const snapshot = document;
      if (holdRead) await holdRead;
      return route.fulfill({ json: snapshot });
    }
    if (pathname === `/api/documents/${other.id}` && request.method() === "GET")
      return route.fulfill({ json: other });
    if (
      pathname === `/api/documents/${document.id}/rescan` &&
      request.method() === "POST"
    ) {
      rescans++;
      expect(request.headers()["x-csrf-token"]).toBe(session.csrfToken);
      expect(request.postDataJSON()).toEqual({});
      if (rescanUnavailable)
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "SCANNER_UNAVAILABLE",
              message:
                "Le service de vérification est momentanément indisponible.",
            },
          },
        });
      document = {
        ...document,
        status: "ready",
        pages: 1,
        analysis: documentAnalysis("ready"),
      };
      return route.fulfill({ json: document });
    }
    if (
      pathname === `/api/documents/${document.id}/content` &&
      request.method() === "GET"
    ) {
      contentPaths.push(pathname);
      expect(document.status).toBe("ready");
      return route.fulfill({ contentType: "application/pdf", body: bytes });
    }
    unexpectedWrites.push(`${request.method()} ${pathname}`);
    return route.fulfill({
      status: 409,
      json: { error: { code: "UNEXPECTED" } },
    });
  });
  await page.route("**/api/dispatches**", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    unexpectedWrites.push("dispatch write");
    return route.fulfill({
      status: 409,
      json: { error: { code: "UNEXPECTED" } },
    });
  });
  return {
    get document() {
      return document;
    },
    get reads() {
      return reads;
    },
    get rescans() {
      return rescans;
    },
    contentPaths,
    unexpectedWrites,
    other,
    setDocument(update: Partial<DocumentRecord>) {
      document = { ...document, ...update };
    },
    omitFromList() {
      listIncludesTarget = false;
    },
    failNextRead() {
      failRead = true;
    },
    resumeReads() {
      failRead = false;
    },
    failRescan(value: boolean) {
      rescanUnavailable = value;
    },
    holdNextRead(promise: Promise<void>) {
      holdRead = promise;
    },
    async open() {
      await page.goto(`/#/app/documents?document=${document.id}`);
    },
  };
}

function detailOf(page: Page) {
  return page.locator(".document-detail");
}

async function expectNotUsable(page: Page) {
  const prepare = detailOf(page).getByText("Utiliser pour un envoi", {
    exact: true,
  });
  await expect(prepare).toHaveAttribute("aria-disabled", "true");
  await expect(prepare).not.toHaveAttribute("href");
  await expect(detailOf(page).locator("canvas")).toHaveCount(0);
}

test("processing becomes ready through status reads, retaining the original and its direct link", async ({
  page,
}, testInfo) => {
  const fixture = await documentFixture(page);
  fixture.omitFromList();
  await fixture.open();
  const detail = detailOf(page);
  await expect(
    detail.locator(".document-analysis").getByRole("status"),
  ).toContainText("Vérification du PDF en cours");
  await expect(
    detail.locator(".document-analysis").getByRole("status"),
  ).toContainText("pas besoin de le déposer à nouveau");
  await expectNotUsable(page);
  await expect(
    detail.getByRole("button", { name: "Relancer la vérification" }),
  ).toHaveCount(0);
  await expect(detail.locator("code")).toHaveText(fixture.document.sha256);
  await expect(page.getByText("En quarantaine", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("document-processing.png"),
    fullPage: true,
  });
  fixture.setDocument({
    status: "ready",
    pages: 1,
    analysis: documentAnalysis("ready"),
  });
  await page.clock.fastForward(15_001);
  await expect(
    detail.locator(".document-analysis").getByRole("status"),
  ).toContainText("PDF prêt");
  await expect(detail.locator("canvas")).toBeVisible();
  await expect(detail.locator("code")).toHaveText(fixture.document.sha256);
  const prepare = detail.getByRole("link", { name: "Utiliser pour un envoi" });
  await expect(prepare).toHaveAttribute(
    "href",
    `#/app/prepare?document=${fixture.document.id}`,
  );
  await expect(prepare).toHaveAttribute("aria-disabled", "false");
  const completedReads = fixture.reads;
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(completedReads);
  await prepare.click();
  await expect(
    page.getByRole("combobox", { name: "Document", exact: true }),
  ).toHaveValue(fixture.document.id);
  await expect(
    page.getByRole("option", { name: "Mon document original.pdf · 1 p." }),
  ).toHaveCount(1);
  expect(fixture.rescans).toBe(0);
  expect(fixture.contentPaths.length).toBeGreaterThanOrEqual(1);
  expect(
    fixture.contentPaths.every(
      (path) => path === `/api/documents/${fixture.document.id}/content`,
    ),
  ).toBe(true);
  expect(fixture.unexpectedWrites).toEqual([]);
});

test("legacy quarantine stays manually recoverable with an honest failure and no automatic rescan", async ({
  page,
}) => {
  const fixture = await documentFixture(page);
  fixture.setDocument({ analysis: undefined });
  fixture.failRescan(true);
  await fixture.open();
  const detail = detailOf(page);
  await expect(
    detail.locator(".document-analysis").getByRole("status"),
  ).toContainText("PDF à vérifier");
  await expect(detail).not.toContainText("automatiquement");
  await expectNotUsable(page);
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(1);
  expect(fixture.rescans).toBe(0);
  const retry = detail.getByRole("button", {
    name: "Relancer la vérification",
  });
  await retry.click();
  await expect(page.getByRole("alert")).toContainText(
    "momentanément indisponible",
  );
  await expect(retry).toBeEnabled();
  await expectNotUsable(page);
  fixture.failRescan(false);
  await retry.click();
  await expect(
    detail.locator(".document-analysis").getByRole("status"),
  ).toContainText("PDF prêt");
  await expect(detail.locator("canvas")).toBeVisible();
  expect(fixture.rescans).toBe(2);
  expect(fixture.unexpectedWrites).toEqual([]);
});

for (const blocked of [
  "security_rejected",
  "pdf_rejected",
  "rejected",
  "purged",
  "integrity_failure",
] as const) {
  test(`${blocked} offers a concrete recovery and never exposes preview or preparation`, async ({
    page,
  }) => {
    const fixture = await documentFixture(page);
    const status =
      blocked === "rejected" || blocked === "purged" ? blocked : "quarantined";
    fixture.setDocument({
      status,
      analysis: documentAnalysis(status, "blocked", blocked),
    });
    await fixture.open();
    await expect(
      detailOf(page).locator(".document-analysis").getByRole("status"),
    ).toContainText(fixture.document.analysis!.title);
    await expectNotUsable(page);
    await expect(
      detailOf(page).getByRole("button", { name: "Relancer la vérification" }),
    ).toHaveCount(0);
    if (blocked === "integrity_failure") {
      await expect(
        detailOf(page).getByRole("link", { name: "Contacter l’assistance" }),
      ).toHaveAttribute("href", "mailto:guteneo@pieper.fr");
    } else {
      await detailOf(page)
        .getByRole("button", { name: "Choisir un autre PDF" })
        .click();
      await expect(page.getByLabel("Fichier PDF")).toBeFocused();
    }
    await page.clock.fastForward(60_000);
    expect(fixture.reads).toBe(1);
    expect(fixture.rescans).toBe(0);
    expect(fixture.contentPaths).toEqual([]);
    expect(fixture.unexpectedWrites).toEqual([]);
    await page.goto(`/#/app/prepare?document=${fixture.document.id}`);
    await expect(
      page.getByRole("button", { name: "Vérifier et préparer" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Voir le suivi du PDF" }),
    ).toBeVisible();
  });
}

test("a status network failure stops polling and offers a read-only recovery", async ({
  page,
}) => {
  const fixture = await documentFixture(page);
  await fixture.open();
  await expect(
    detailOf(page).locator(".document-analysis").getByRole("status"),
  ).toContainText("Vérification du PDF en cours");
  fixture.failNextRead();
  await page.clock.fastForward(15_001);
  await expect(
    page.getByRole("status").filter({ hasText: "Le suivi du PDF" }),
  ).toContainText("Votre PDF reste enregistré");
  const failedReads = fixture.reads;
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(failedReads);
  fixture.resumeReads();
  fixture.setDocument({
    status: "ready",
    pages: 1,
    analysis: documentAnalysis("ready"),
  });
  await page.getByRole("button", { name: "Actualiser le suivi" }).click();
  await expect(
    detailOf(page).locator(".document-analysis").getByRole("status"),
  ).toContainText("PDF prêt");
  expect(fixture.rescans).toBe(0);
  expect(fixture.unexpectedWrites).toEqual([]);
});

test("automatic browser follow-up stops after ten minutes", async ({
  page,
}) => {
  const fixture = await documentFixture(page);
  await fixture.open();
  await expect(
    detailOf(page).locator(".document-analysis").getByRole("status"),
  ).toContainText("Vérification du PDF en cours");
  await page.clock.fastForward(600_001);
  await expect(
    page.getByRole("status").filter({ hasText: "Le suivi automatique" }),
  ).toContainText("en pause");
  await expect(
    page.getByRole("button", { name: "Actualiser le suivi" }),
  ).toBeEnabled();
  await expectNotUsable(page);
  const pausedReads = fixture.reads;
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(pausedReads);
  expect(fixture.rescans).toBe(0);
});

test("a late status response cannot reopen a previous document after selection changes", async ({
  page,
}) => {
  const fixture = await documentFixture(page);
  await fixture.open();
  await expect(
    detailOf(page).locator(".document-analysis").getByRole("status"),
  ).toContainText("Vérification du PDF en cours");
  let release!: () => void;
  fixture.holdNextRead(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  await page.clock.fastForward(15_001);
  await expect.poll(() => fixture.reads).toBe(2);
  await page.getByRole("button", { name: /^Autre document.pdf/ }).click();
  await expect(
    detailOf(page).getByRole("heading", { name: "Autre document.pdf" }),
  ).toBeVisible();
  release();
  await page.clock.fastForward(30_000);
  await expect(
    detailOf(page).getByRole("heading", { name: "Autre document.pdf" }),
  ).toBeVisible();
  await detailOf(page).getByRole("button", { name: "Fermer" }).click();
  await expect(detailOf(page)).toHaveCount(0);
  await page.clock.fastForward(30_000);
  expect(fixture.reads).toBe(2);
  expect(fixture.rescans).toBe(0);
  expect(fixture.unexpectedWrites).toEqual([]);
});

test("a completed verification remains ready in the library after the detail closes", async ({
  page,
}) => {
  const fixture = await documentFixture(page);
  await fixture.open();
  await expect(
    detailOf(page).locator(".document-analysis").getByRole("status"),
  ).toContainText("Vérification du PDF en cours");
  fixture.setDocument({
    status: "ready",
    pages: 1,
    analysis: documentAnalysis("ready"),
  });
  await page.clock.fastForward(15_001);
  await expect(
    detailOf(page).locator(".document-analysis").getByRole("status"),
  ).toContainText("PDF prêt");
  await detailOf(page).getByRole("button", { name: "Fermer" }).click();
  await expect(detailOf(page)).toHaveCount(0);
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: /^Mon document original.pdf/ }),
    });
  await expect(row).toContainText("PDF prêt");
  await expect(row.getByRole("cell", { name: "1", exact: true })).toHaveCount(
    1,
  );
  expect(fixture.rescans).toBe(0);
  expect(fixture.unexpectedWrites).toEqual([]);
});
