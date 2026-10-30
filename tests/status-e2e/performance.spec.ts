import { test, expect } from "@playwright/test";
import { fixtures, history } from "./fixtures";

test("period snapshots avoid duplicate reads and build daily rows only on disclosure", async ({
  page,
}) => {
  const reads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/history")) reads.push(request.url());
  });
  await fixtures(page, { history: (days) => history(days, true) });
  await page.goto("/?lang=en");
  await expect(page.locator("#history-chart button")).toHaveCount(30);
  for (const days of [365, 365, 7, 365, 30, 365]) {
    await page.locator(`[data-days="${days}"]`).click();
    await expect(page.locator("#history-chart")).toHaveAttribute(
      "data-period",
      String(days),
    );
    await expect(page.locator("#history-chart")).not.toHaveAttribute(
      "aria-busy",
    );
  }
  expect(reads).toHaveLength(3);
  await expect(page.locator("#history-rows tr")).toHaveCount(0);
  await page.locator(".daily-details summary").click();
  await expect(page.locator("#history-rows tr")).toHaveCount(365);
  await page.locator("#status-language").selectOption("de");
  await page.locator("#status-theme").selectOption("dark");
  expect(reads).toHaveLength(3);
  await page.locator("#refresh").click();
  await expect.poll(() => reads.length).toBe(4);
  await expect(page.locator("#history-chart")).not.toHaveAttribute("aria-busy");
  await expect(page.locator("#history-rows tr")).toHaveCount(365);
});

test("a period snapshot expires after fifteen minutes", async ({ page }) => {
  const reads: number[] = [];
  // Isolate TTL expiry from the separate UTC-midnight invalidation below.
  await page.clock.install({ time: new Date("2026-10-28T12:00:00Z") });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/history")
      reads.push(Number(url.searchParams.get("days")));
  });
  await fixtures(page);
  await page.goto("/?lang=en");
  await expect(page.locator("#history-chart button")).toHaveCount(30);
  await page.locator('[data-days="7"]').click();
  await expect(page.locator("#history-chart button")).toHaveCount(7);
  await page.locator('[data-days="30"]').click();
  await page.clock.fastForward(14 * 60 * 1000);
  await page.locator('[data-days="7"]').click();
  expect(reads.filter((days) => days === 7)).toHaveLength(1);
  await page.locator('[data-days="30"]').click();
  await page.clock.fastForward(60 * 1000);
  await expect.poll(() => reads.filter((days) => days === 30).length).toBe(2);
  await expect(page.locator("#history-chart")).not.toHaveAttribute("aria-busy");
  await page.locator('[data-days="7"]').click();
  await expect.poll(() => reads.filter((days) => days === 7).length).toBe(2);
});

test("a new UTC day invalidates an otherwise recent period snapshot", async ({
  page,
}) => {
  const reads: number[] = [];
  await page.clock.install({ time: new Date("2026-10-28T23:59:00Z") });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/history")
      reads.push(Number(url.searchParams.get("days")));
  });
  await fixtures(page);
  await page.goto("/?lang=en");
  await expect(page.locator("#history-chart button")).toHaveCount(30);
  await page.locator('[data-days="7"]').click();
  await expect(page.locator("#history-chart button")).toHaveCount(7);
  await page.locator('[data-days="30"]').click();
  await page.clock.fastForward(2 * 60 * 1000);
  await page.locator('[data-days="7"]').click();
  await expect.poll(() => reads.filter((days) => days === 7).length).toBe(2);
});

test("switching period cancels obsolete work and retains the newest selection", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cancelled: string[] = [];
  page.on("requestfailed", (request) => cancelled.push(request.url()));
  await fixtures(page);
  await page.route(/\/api\/history\?days=7$/, async (route) => {
    await held;
    await route
      .fulfill({
        contentType: "application/json",
        body: JSON.stringify(history(7)),
      })
      .catch(() => undefined);
  });
  try {
    await page.goto("/?lang=en");
    await expect(page.locator("#history-chart button")).toHaveCount(30);
    const requested = page.waitForRequest(/\/api\/history\?days=7$/);
    await page.locator('[data-days="7"]').click();
    await requested;
    await page.locator('[data-days="365"]').click();
    await expect(page.locator("#history-chart")).toHaveAttribute(
      "data-period",
      "365",
    );
    await expect
      .poll(() => cancelled.some((url) => url.endsWith("days=7")))
      .toBe(true);
    release();
    await expect(page.locator("#history-chart")).toHaveAttribute(
      "data-period",
      "365",
    );
    await expect(page.locator("#history-chart")).not.toHaveAttribute(
      "aria-busy",
    );
  } finally {
    release();
  }
});

test("cold optional fonts do not move the already useful status page", async ({
  page,
}) => {
  const fontResponses: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.route("**/*.woff2", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  page.on("response", (response) => {
    if (response.url().endsWith(".woff2") && response.ok())
      fontResponses.push(response.url());
  });
  await page.goto("/?lang=fr", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "pass",
  );
  await expect(page.locator("#history-chart button")).toHaveCount(30);
  const before = await page.locator(".history-panel").boundingBox();
  await expect.poll(() => fontResponses.length).toBe(3);
  await page.evaluate(() => document.fonts.ready);
  const after = await page.locator(".history-panel").boundingBox();
  expect(after!.y).toBe(before!.y);
});
