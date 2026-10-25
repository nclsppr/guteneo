import { expect, test, type Page } from "@playwright/test";
import { workspacePermissions } from "../../packages/contracts/src/roles";

// Browser projection fixtures only. The integration suite exercises retained
// monthly rows, current credit and authorization against real local D1.
async function fixture(page: Page, failCurrent = false) {
  const reads: string[] = [];
  const writes: string[] = [];
  let failLatest = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") reads.push(`${url.pathname}${url.search}`);
    else writes.push(url.pathname);
    let body: unknown = { items: [], nextCursor: null };
    if (url.pathname === "/api/session")
      body = {
        organization: { id: "history-fixture", name: "History fixture" },
        user: {
          id: "history-reader",
          name: "Camille Example",
          role: "admin",
          preferredLocale: "fr",
        },
        permissions: workspacePermissions("admin"),
        csrfToken: "fixture-only",
        simulation: false,
      };
    else if (url.pathname === "/api/usage/activity")
      body = {
        year: 2026,
        currentYear: 2026,
        availableYears: [2026],
        asOf: "2026-10-25T12:00:00.000Z",
        timeZone: "UTC",
        currency: "EUR",
        evidence: "production",
        days: [
          { date: "2026-09-17", amountMinor: 9, dispatchCount: 1, chargeCount: 1 },
          { date: "2026-09-21", amountMinor: 354, dispatchCount: 1, chargeCount: 1 },
        ],
        totals: {
          amountMinor: 363,
          dispatchCount: 2,
          chargeCount: 2,
          activeDays: 2,
        },
      };
    else if (url.pathname === "/api/usage") {
      const selected = url.searchParams.get("period");
      if (
        (failCurrent && selected === "2026-10") ||
        (failLatest && selected === "latest")
      ) {
        failLatest = false;
        await route.fulfill({
          status: 503,
          json: {
            error: { code: "SERVICE_UNAVAILABLE", message: "Fixture error" },
          },
        });
        return;
      }
      const period = selected === "latest" ? "2026-09" : selected;
      body = {
        period,
        currentPeriod: "2026-10",
        availablePeriods: ["2026-10", "2026-09"],
        welcomeCredit: {
          kind: "promotional",
          currency: "EUR",
          grantedMinor: 5000,
          reservedMinor: 100,
          spentMinor: 363,
          availableMinor: 4537,
          grantedAt: "2026-09-17T10:00:00Z",
          status: "available",
          renewal: "none",
          topUpAvailable: false,
        },
        items:
          period === "2026-09"
            ? [
                {
                  channel: "fax",
                  period,
                  limit_count: 10000,
                  reserved_count: 1,
                  confirmed_count: 1,
                  limit_minor: 5000,
                  reserved_minor: 100,
                  confirmed_minor: 9,
                  currency: "EUR",
                },
                {
                  channel: "postal",
                  period,
                  limit_count: 10000,
                  reserved_count: 0,
                  confirmed_count: 1,
                  limit_minor: 5000,
                  reserved_minor: 0,
                  confirmed_minor: 354,
                  currency: "EUR",
                },
              ]
            : [],
      };
    }
    await route.fulfill({ status: 200, json: body });
  });
  return {
    reads,
    writes,
    allowCurrent: () => {
      failCurrent = false;
    },
    failNextLatest: () => {
      failLatest = true;
    },
  };
}

test("retained usage opens after rollover and every month stays selectable", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/usage");
  const month = page.getByLabel("Mois de consommation", { exact: true });
  await expect(month).toHaveValue("2026-09");
  await expect(month.locator("option")).toHaveText([
    "octobre 2026",
    "septembre 2026",
  ]);
  await expect(page.locator(".usage-ledger")).toContainText("0,09");
  await expect(page.locator(".usage-ledger")).toContainText("3,54");
  await expect(
    page.getByText("Aucun envoi enregistré pour ce mois."),
  ).toHaveCount(0);
  await month.selectOption("2026-10");
  await expect(month).toHaveValue("2026-10");
  await expect(
    page.getByText("Aucun envoi enregistré pour ce mois."),
  ).toBeVisible();
  await expect(page.locator(".credit-balance")).toContainText("3,63");
  await month.selectOption("2026-09");
  await expect(page.locator(".usage-ledger")).toContainText("3,54");
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(month).toHaveValue("2026-09");
  expect(state.reads).toContain("/api/usage?period=latest");
  expect(state.reads).toContain("/api/usage?period=2026-10");
  expect(state.reads).toContain("/api/usage?period=2026-09");
  expect(state.writes).toEqual([]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("a failed month read remains an error instead of claiming empty history", async ({
  page,
}) => {
  const state = await fixture(page, true);
  await page.goto("/#/app/usage");
  const month = page.getByLabel("Mois de consommation", { exact: true });
  await expect(month).toHaveValue("2026-09");
  await month.selectOption("2026-10");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText("Aucun envoi enregistré pour ce mois."),
  ).toHaveCount(0);
  await expect(page.locator(".usage-ledger")).toHaveCount(0);
  await expect(month).toBeEnabled();
  await expect(month).toHaveValue("2026-10");
  await expect(month.locator("option")).toHaveText([
    "octobre 2026",
    "septembre 2026",
  ]);
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect
    .poll(
      () =>
        state.reads.filter((path) => path === "/api/usage?period=2026-10")
          .length,
    )
    .toBe(2);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(month).toHaveValue("2026-10");
  state.allowCurrent();
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(
    page.getByText("Aucun envoi enregistré pour ce mois."),
  ).toBeVisible();
  await expect(month).toHaveValue("2026-10");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await month.selectOption("2026-09");
  await expect(page.locator(".usage-ledger")).toContainText("3,54");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("failed latest-month refresh keeps its resolved month and recovers on retry", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/usage");
  const month = page.getByLabel("Mois de consommation", { exact: true });
  await expect(month).toHaveValue("2026-09");
  state.failNextLatest();
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(month).toHaveValue("2026-09");
  await expect(month.locator("option")).toHaveText([
    "octobre 2026",
    "septembre 2026",
  ]);
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(month).toHaveValue("2026-09");
  await expect(page.locator(".usage-ledger")).toContainText("3,54");
  expect(state.writes).toEqual([]);
});
