import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import type { DocumentRecord, Session } from "../../apps/web/src/api";

// These HTTP fixtures verify the browser transition only. The scanner, R2
// integrity and tenant/quota boundaries have real D1 tests in document-rescan.test.ts.
for (const initialResult of ["quarantined", "unavailable"] as const) {
  test(`a rescan returning ${initialResult} stays retryable and becomes ready without another upload`, async ({
    page,
  }) => {
    await page.goto("/#/app");
    await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
    await expect(
      page.getByRole("heading", { name: "Votre correspondance, au clair." }),
    ).toBeVisible();
    const session = (await (
      await page.request.get("/api/session")
    ).json()) as Session;
    expect(session.simulation).toBe(true);

    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]).drawText("Original PDF retained during rescan");
    const bytes = Buffer.from(await pdf.save());
    let document: DocumentRecord = {
      id: "doc_rescan_browser_fixture",
      name: "Original à vérifier.pdf",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
      pages: 0,
      status: "quarantined",
      source: "import",
      created_at: "2026-09-16T12:00:00.000Z",
    };
    let rescans = 0;
    const contentPaths: string[] = [];
    const unexpectedWrites: string[] = [];
    let finishScan!: () => void;
    const scanFinished = new Promise<void>((resolve) => {
      finishScan = resolve;
    });
    await page.route(
      /\/api\/documents(?:\/[^?]*)?(?:\?.*)?$/,
      async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === "/api/documents" && request.method() === "GET") {
          await route.fulfill({
            json: { items: [document], nextCursor: null },
          });
        } else if (
          pathname === `/api/documents/${document.id}/rescan` &&
          request.method() === "POST"
        ) {
          rescans++;
          expect(request.headers()["x-csrf-token"]).toBe(session.csrfToken);
          expect(request.postDataJSON()).toEqual({});
          if (rescans === 1) {
            await route.fulfill(
              initialResult === "unavailable"
                ? {
                    status: 503,
                    json: {
                      error: {
                        code: "SCANNER_UNAVAILABLE",
                        message:
                          "Le service d’analyse est momentanément indisponible.",
                      },
                    },
                  }
                : { json: document },
            );
          } else {
            await scanFinished;
            document = { ...document, status: "ready", pages: 1 };
            await route.fulfill({ json: document });
          }
        } else if (
          pathname === `/api/documents/${document.id}/content` &&
          request.method() === "GET"
        ) {
          contentPaths.push(pathname);
          expect(document.status).toBe("ready");
          await route.fulfill({ contentType: "application/pdf", body: bytes });
        } else {
          unexpectedWrites.push(`${request.method()} ${pathname}`);
          await route.fulfill({
            status: 409,
            json: { error: { code: "UNEXPECTED" } },
          });
        }
      },
    );
    await page.route("**/api/dispatches**", async (route) => {
      if (route.request().method() === "GET") return route.continue();
      unexpectedWrites.push("dispatch write");
      await route.fulfill({
        status: 409,
        json: { error: { code: "UNEXPECTED" } },
      });
    });

    await page.goto("/#/app/documents");
    await page
      .getByRole("button", { name: /^Original à vérifier\.pdf/ })
      .click();
    const detail = page.locator(".document-detail");
    const prepare = detail.locator('a[href^="#/app/prepare?document="]');
    const retry = detail.getByRole("button", {
      name: "Relancer l’analyse du PDF",
    });
    await expect(prepare).toHaveAttribute("aria-disabled", "true");
    await expect(detail.locator("code")).toHaveText(document.sha256);
    await expect(detail.locator("canvas")).toHaveCount(0);
    expect(contentPaths).toEqual([]);
    expect(rescans).toBe(0);

    await retry.click();
    if (initialResult === "unavailable") {
      await expect(page.getByRole("alert")).toContainText(
        "Le service d’analyse est momentanément indisponible.",
      );
    } else {
      await expect(detail.getByRole("status")).toContainText(
        "L’analyse n’a pas encore validé ce PDF.",
      );
    }
    await expect(retry).toBeEnabled();
    await expect(prepare).toHaveAttribute("aria-disabled", "true");
    expect(rescans).toBe(1);
    expect(contentPaths).toEqual([]);

    await retry.click();
    await expect(
      detail.getByRole("button", { name: "Analyse en cours…" }),
    ).toBeDisabled();
    await expect(prepare).toHaveAttribute("aria-disabled", "true");
    finishScan();
    await expect(
      detail.getByRole("status").filter({ hasText: "Analyse terminée." }),
    ).toHaveText("Analyse terminée. Votre PDF est prêt.");
    await expect(retry).toHaveCount(0);
    await expect(detail.locator("canvas")).toBeVisible();
    await expect(prepare).toHaveAttribute("aria-disabled", "false");
    await expect(prepare).toHaveAttribute(
      "href",
      `#/app/prepare?document=${document.id}`,
    );
    await expect(detail.locator("code")).toHaveText(document.sha256);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(rescans).toBe(2);
    expect(contentPaths).toEqual([`/api/documents/${document.id}/content`]);
    expect(unexpectedWrites).toEqual([]);
  });
}
