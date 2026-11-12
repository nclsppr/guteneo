import { expect, test, type Route } from "@playwright/test";
import { stationFixture } from "./fixtures";

// Synthetic transport only: no account, stored original, renderer or provider.
const headers = {
  "Access-Control-Allow-Origin": "http://127.0.0.1:8850",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST",
};
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
const doc = {
  id: "document-upload-fixture",
  name: "Uploaded fixture.pdf",
  sha256: "a".repeat(64),
  size: pdf.length,
  pages: 1,
  status: "ready",
  source: "import",
  created_at: "2026-11-11T10:00:00.000Z",
};
const personalId = `sd_${"a".repeat(32)}`;
const personal = {
  id: personalId,
  kind: "shared",
  title: "Private received fixture.pdf",
  sender: "Synthetic sender",
  status: "active",
  expiresAt: "2099-11-11T10:00:00.000Z",
  createdAt: "2026-11-11T10:00:00.000Z",
  allowOriginalDownload: false,
  allowVaultDeposit: false,
  pages: [1, 2].map((number) => ({
    number,
    width: 595,
    height: 842,
    url: `/api/personal/documents/${personalId}/pages/${number}`,
    accessibleText: "",
  })),
  audit: [],
  policy: {
    retentionDays: 7,
    allowOriginalDownload: false,
    allowVaultDeposit: false,
    personalRetentionDays: 365,
  },
};

async function preflight(route: Route): Promise<boolean> {
  if (route.request().method() !== "OPTIONS") return false;
  await route.fulfill({ status: 204, headers });
  return true;
}

test("an observer cannot import or render workspace documents", async ({
  page,
}) => {
  const fixture = await stationFixture(page, { role: "viewer" });
  await page.goto("/documents");
  await expect(
    page.getByRole("heading", { name: "Documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Importer un PDF", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Créer depuis du HTML", exact: true }),
  ).toHaveCount(0);
  fixture.assertReadOnly();
});

test("an explicit PDF upload sends multipart content with CSRF then follows its saved identifier", async ({
  page,
}) => {
  await stationFixture(page);
  const uploads: { contentType: string; csrf: string; body: string }[] = [];
  await page.route((url) => url.pathname === "/api/documents" || url.pathname.startsWith("/api/documents/"), async (route) => {
    if (await preflight(route)) return;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/documents" && request.method() === "POST") {
      uploads.push({
        contentType: request.headers()["content-type"] ?? "",
        csrf: request.headers()["x-csrf-token"] ?? "",
        body: request.postData() ?? "",
      });
      return route.fulfill({ status: 201, headers, json: doc });
    }
    if (path.endsWith("/content"))
      return route.fulfill({
        headers,
        contentType: "application/pdf",
        body: pdf,
      });
    if (path === `/api/documents/${doc.id}`)
      return route.fulfill({ headers, json: doc });
    return route.fulfill({
      headers,
      json: { items: uploads.length ? [doc] : [], nextCursor: null },
    });
  });
  await page.goto("/documents");
  expect(uploads).toEqual([]);
  await page
    .getByRole("button", { name: "Importer un PDF", exact: true })
    .click();
  await page.getByLabel("Fichier PDF", { exact: true }).setInputFiles({
    name: doc.name,
    mimeType: "application/pdf",
    buffer: pdf,
  });
  expect(uploads).toEqual([]);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Importer un PDF", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/documents\\?document=${doc.id}$`));
  await expect(
    page.getByRole("heading", { name: doc.name, exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe.document-pdf")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  expect(uploads).toHaveLength(1);
  expect(uploads[0].contentType).toContain("multipart/form-data;");
  expect(uploads[0].csrf).toBe("fixture-csrf-A");
  expect(uploads[0].body).toContain(`filename="${doc.name}"`);
});

test("a quarantined original never exposes PDF bytes or a prepare action", async ({
  page,
}) => {
  await stationFixture(page);
  const contentRequests: string[] = [];
  await page.route((url) => url.pathname === "/api/documents" || url.pathname.startsWith("/api/documents/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/content")) contentRequests.push(path);
    return route.fulfill({
      headers,
      json:
        path === `/api/documents/${doc.id}`
          ? {
              ...doc,
              status: "quarantined",
              analysis: { state: "processing", nextAction: "wait" },
            }
          : { items: [], nextCursor: null },
    });
  });
  await page.goto(`/documents?document=${doc.id}`);
  await expect(
    page.getByRole("heading", { name: doc.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Vérification en cours", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe.document-pdf")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Préparer un envoi", exact: true }),
  ).toHaveCount(0);
  expect(contentRequests).toEqual([]);
});

test("a received share reads authorized pages and text without downloading the original", async ({
  page,
}) => {
  await stationFixture(page);
  const downloads: string[] = [];
  await page.route((url) => url.pathname.startsWith("/api/personal/documents/"), async (route) => {
    if (await preflight(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/download")) {
      downloads.push(path);
      return route.fulfill({
        status: 403,
        headers,
        json: { error: { code: "FORBIDDEN" } },
      });
    }
    if (path.endsWith("/text"))
      return route.fulfill({
        headers,
        json: { text: "Accessible synthetic document text" },
      });
    if (/\/pages\/\d+$/.test(path))
      return route.fulfill({ headers, contentType: "image/png", body: image });
    if (path.endsWith("/events"))
      return route.fulfill({ headers, json: { recorded: true } });
    return route.fulfill({ headers, json: personal });
  });
  await page.goto(`/arrivals?document=${personalId}`);
  await expect(
    page.getByRole("heading", { name: personal.title, exact: true }),
  ).toBeVisible();
  await expect(page.locator("img.document-page-image")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Télécharger le PDF", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Lire le texte", exact: true })
    .click();
  await expect(
    page.getByText("Accessible synthetic document text", { exact: true }),
  ).toBeVisible();
  expect(downloads).toEqual([]);
});

test("a refused next page clears the received document without an original fallback", async ({
  page,
}) => {
  await stationFixture(page);
  const originalReads: string[] = [];
  await page.route((url) => url.pathname.startsWith("/api/personal/documents/"), async (route) => {
    if (await preflight(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/download")) originalReads.push(path);
    if (path.endsWith("/pages/2"))
      return route.fulfill({
        status: 403,
        headers,
        json: { error: { code: "FORBIDDEN", message: "Access revoked." } },
      });
    if (path.endsWith("/pages/1"))
      return route.fulfill({ headers, contentType: "image/png", body: image });
    if (path.endsWith("/events"))
      return route.fulfill({ headers, json: { recorded: true } });
    return route.fulfill({ headers, json: personal });
  });
  await page.goto(`/arrivals?document=${personalId}`);
  await expect(page.locator("img.document-page-image")).toBeVisible();
  await page.getByRole("button", { name: "Suivante", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: personal.title, exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("img.document-page-image")).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
  expect(originalReads).toEqual([]);
});

test("an allowed original download still requires an explicit action and current CSRF", async ({
  page,
}) => {
  await stationFixture(page);
  const downloads: { method: string; csrf: string }[] = [];
  await page.route((url) => url.pathname.startsWith("/api/personal/documents/"), async (route) => {
    if (await preflight(route)) return;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/download")) {
      downloads.push({
        method: request.method(),
        csrf: request.headers()["x-csrf-token"] ?? "",
      });
      return route.fulfill({
        headers,
        contentType: "application/pdf",
        body: pdf,
      });
    }
    if (/\/pages\/\d+$/.test(path))
      return route.fulfill({ headers, contentType: "image/png", body: image });
    if (path.endsWith("/events"))
      return route.fulfill({ headers, json: { recorded: true } });
    return route.fulfill({
      headers,
      json: { ...personal, allowOriginalDownload: true },
    });
  });
  await page.goto(`/arrivals?document=${personalId}`);
  await expect(
    page.getByRole("heading", { name: personal.title, exact: true }),
  ).toBeVisible();
  expect(downloads).toEqual([]);
  const started = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Télécharger le PDF", exact: true })
    .click();
  expect((await started).suggestedFilename()).toBe(personal.title);
  expect(downloads).toEqual([{ method: "POST", csrf: "fixture-csrf-A" }]);
});

test("a page arriving after the tab is hidden is recorded only when actually visible", async ({
  page,
}) => {
  await stationFixture(page);
  await page.addInitScript(() => {
    // Deterministic visibility fixture, independent of viewport and OS focus.
    Object.defineProperty(window, "IntersectionObserver", {
      value: class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe(target: Element) {
          queueMicrotask(() =>
            this.callback(
              [{ target, isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            ),
          );
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    });
  });
  let releaseImage: (() => void) | undefined;
  const displayed: unknown[] = [];
  await page.route((url) => url.pathname.startsWith("/api/personal/documents/"), async (route) => {
    if (await preflight(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/pages/1")) {
      await new Promise<void>((resolve) => {
        releaseImage = resolve;
      });
      return route.fulfill({ headers, contentType: "image/png", body: image });
    }
    if (path.endsWith("/events")) {
      displayed.push(route.request().postDataJSON());
      return route.fulfill({ headers, json: { recorded: true } });
    }
    return route.fulfill({ headers, json: personal });
  });
  await page.goto(`/arrivals?document=${personalId}`);
  await expect.poll(() => Boolean(releaseImage)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  releaseImage!();
  await expect(page.locator("img.document-page-image")).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(displayed).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => displayed)
    .toEqual([{ type: "page_displayed", page: 1 }]);
});
