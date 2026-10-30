import { expect, test, type Page, type Request } from "@playwright/test";
import type { PersonalSession } from "../../apps/web/src/personal-api";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function personalSession(): PersonalSession {
  return {
    user: {
      id: "recovery-reader",
      name: "Synthetic recovery reader",
      email: "recovery-reader@example.invalid",
      preferredLocale: "en",
    },
    csrfToken: "synthetic-recovery-csrf",
    simulation: true,
    mfa: false,
    strongAuthentication: false,
    documentAccessAllowed: true,
    documentAccessMode: "verified_account",
    authenticationPolicyVersion: "synthetic",
    amr: [],
    acr: null,
    verifiedAccount: true,
    authenticatedAt: Date.now(),
    workspaces: [],
  };
}

async function heldRecovery(page: Page) {
  const reads: string[] = [];
  const writes: string[] = [];
  const navigations: string[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    (request.method() === "GET" ? reads : writes).push(url.pathname);
    if (url.pathname === "/api/personal/session")
      return route.fulfill({ json: personalSession() });
    if (url.pathname === "/api/personal/documents")
      return route.fulfill({
        json: {
          items: [
            {
              id: "document-recovery-reader",
              title: "Document for recovery reader",
              sender: "Synthetic sending workspace",
              kind: url.searchParams.get("kind") ?? "shared",
              status: "active",
              expiresAt: "2026-12-01T00:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      });
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.resourceType() === "document")
      navigations.push(request.url());
  });
  const started = deferred();
  const release = deferred();
  const drained = deferred();
  const finished = deferred();
  let recoveryRequest: Request | undefined;
  const finish = (request: Request) => {
    if (request === recoveryRequest) finished.resolve();
  };
  page.on("requestfinished", finish);
  page.on("requestfailed", finish);
  await page.route("**/assets/personal-area-*.js", async (route) => {
    if (route.request().resourceType() !== "fetch") {
      await route.fulfill({
        status: 503,
        contentType: "text/javascript",
        headers: { "Cache-Control": "no-store" },
        body: "/* Synthetic unavailable personal module. */",
      });
      return;
    }
    recoveryRequest = route.request();
    started.resolve();
    await release.promise;
    try {
      const response = await route.fetch();
      await route.fulfill({ response });
    } catch {
      // Navigation may already have cancelled this public asset request.
    } finally {
      drained.resolve();
    }
  });
  await page.goto("/#/app/my-documents");
  await expect(page.getByRole("alert")).toContainText(
    "Cette page n’a pas pu être chargée.",
  );
  const reload = page.getByRole("button", {
    name: "Recharger la page",
    exact: true,
  });
  await reload.click();
  await started.promise;
  await expect(reload).toBeDisabled();
  return {
    reads,
    writes,
    navigations,
    release: release.resolve,
    async settle() {
      release.resolve();
      await Promise.all([finished.promise, drained.promise]);
      await frames(page);
    },
  };
}

async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function navigate(page: Page, route: string) {
  await page.evaluate((next) => {
    window.location.hash = next;
  }, route);
  await frames(page);
}

for (const detour of [
  "another personal page",
  "the public homepage",
] as const) {
  test(`a pending code recovery cannot reload a new visit after leaving for ${detour}`, async ({
    page,
  }) => {
    const state = await heldRecovery(page);
    const marker = "synthetic-new-visit-marker";
    try {
      if (detour === "another personal page") {
        await navigate(page, "/app/services");
        await expect(page).toHaveURL(/#\/app\/services$/);
        await expect(page.getByRole("alert")).toContainText(
          "Cette page n’a pas pu être chargée.",
        );
      } else {
        await navigate(page, "/");
        await expect(page.locator(".public-home")).toBeVisible();
      }
      await navigate(page, "/app/my-documents");
      await expect(page).toHaveURL(/#\/app\/my-documents$/);
      await expect(page.getByRole("alert")).toContainText(
        "Cette page n’a pas pu être chargée.",
      );
      await page.evaluate((value) => {
        Reflect.set(window, "recoveryVisitMarker", value);
      }, marker);
      const navigationCount = state.navigations.length;
      await state.settle();
      expect(state.navigations).toHaveLength(navigationCount);
      expect(
        await page.evaluate(() => Reflect.get(window, "recoveryVisitMarker")),
      ).toBe(marker);
      expect(state.reads).not.toContain("/api/session");
      expect(state.reads).not.toContain("/api/personal/documents");
      expect(
        state.reads.every((path) => path.startsWith("/api/personal/")),
      ).toBe(true);
      expect(state.writes).toEqual([]);
    } finally {
      state.release();
    }
  });
}
