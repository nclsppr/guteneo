import { expect, test, type Page } from "@playwright/test";

// Synthetic browser responses only; no Stripe customer or portal is created.
async function fixture(page: Page) {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let portalRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/billing/portal") {
      portalRequests++;
      await ready;
      await route.fulfill({ json: { url: "/?synthetic-billing-portal=1" } });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/session"
          ? {
              organization: { id: "org_billing", name: "Synthetic workspace" },
              user: {
                id: "user_billing",
                name: "Synthetic administrator",
                role: "admin",
                preferredLocale: "en",
              },
              csrfToken: "synthetic-only",
              simulation: true,
            }
          : path === "/api/billing"
            ? {
                status: "connected",
                mode: "test",
                customerLinked: true,
                portalAvailable: true,
                subscriptions: [],
                usageLedger: {
                  kind: "simulation",
                  period: "2026-11",
                  channels: [],
                },
              }
            : { items: [], nextCursor: null },
    });
  });
  return { release, portalRequests: () => portalRequests };
}

for (const depart of [false, true]) {
  test(`a delayed billing portal ${depart ? "does not navigate a departed view" : "opens from the current view"}`, async ({
    page,
  }, testInfo) => {
    const portal = await fixture(page);
    const started = Date.now();
    await page.goto("/#/app/administration/billing");
    const open = page.getByRole("button", {
      name: "Open billing portal",
      exact: true,
    });
    await expect(open).toBeEnabled();
    await testInfo.attach("billing-loading", {
      body: JSON.stringify(
        {
          firstUsefulContentMs: Date.now() - started,
          ...(await page.evaluate(() => {
            const resources = performance.getEntriesByType(
              "resource",
            ) as PerformanceResourceTiming[];
            return {
              requests: resources.length,
              javascriptTransferredBytes: resources
                .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
                .reduce((sum, entry) => sum + entry.transferSize, 0),
              apiRequests: resources
                .filter((entry) =>
                  new URL(entry.name).pathname.startsWith("/api/"),
                )
                .map((entry) => new URL(entry.name).pathname),
              firstContentfulPaintMs:
                performance.getEntriesByName("first-contentful-paint")[0]
                  ?.startTime ?? null,
            };
          })),
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    if (depart)
      await page.screenshot({
        path: testInfo.outputPath("billing-current-view.png"),
        fullPage: true,
      });
    await open.click();
    await expect.poll(portal.portalRequests).toBe(1);
    if (depart) {
      await page.evaluate(() => {
        location.hash = "#/app/documents";
      });
      await expect(
        page.getByRole("heading", { name: "The raw material.", exact: true }),
      ).toBeVisible();
    }
    const response = page.waitForResponse((result) =>
      result.url().endsWith("/api/billing/portal"),
    );
    portal.release();
    await response;
    if (depart) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page).toHaveURL(/#\/app\/documents$/);
    } else {
      await expect(page).toHaveURL(/\?synthetic-billing-portal=1$/);
    }
    expect(portal.portalRequests()).toBe(1);
  });
}
