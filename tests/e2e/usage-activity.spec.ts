import { expect, test, type Page } from "@playwright/test";
import { workspacePermissions } from "../../packages/contracts/src/roles";
import type {
  UsageActivity,
  UsageActivityDay,
} from "../../packages/contracts/src/usage-activity";

// Projection fixtures only: API integration tests prove the dated accounting
// sources, their tenant boundaries and the separation of simulation evidence.
async function fixture(page: Page, locale: "fr" | "de" = "fr") {
  const reads: string[] = [];
  const writes: string[] = [];
  let failYear: number | undefined;
  let simulation = false;
  await page.clock.setFixedTime(new Date("2026-10-25T12:00:00.000Z"));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") reads.push(`${url.pathname}${url.search}`);
    else writes.push(url.pathname);
    let body: unknown = { items: [], nextCursor: null };
    if (url.pathname === "/api/session")
      body = {
        organization: { id: "activity-fixture", name: "Activity fixture" },
        user: {
          id: "activity-reader",
          name: "Camille Example",
          role: "admin",
          preferredLocale: locale,
        },
        permissions: workspacePermissions("admin"),
        csrfToken: "fixture-only",
        simulation: false,
      };
    if (url.pathname === "/api/usage")
      body = {
        period: "2026-09",
        currentPeriod: "2026-10",
        availablePeriods: ["2026-10", "2026-09"],
        items: [
          {
            channel: "postal",
            period: "2026-09",
            limit_count: 10000,
            reserved_count: 0,
            confirmed_count: 2,
            limit_minor: 5000,
            reserved_minor: 0,
            confirmed_minor: 900,
            currency: "EUR",
          },
        ],
        welcomeCredit: {
          kind: "promotional",
          currency: "EUR",
          grantedMinor: 5000,
          reservedMinor: 100,
          spentMinor: 900,
          availableMinor: 4000,
          grantedAt: "2024-02-01T10:00:00Z",
          status: "available",
          renewal: "none",
          topUpAvailable: false,
        },
      };
    if (url.pathname === "/api/usage/activity") {
      const year = Number(url.searchParams.get("year"));
      if (year === failYear) {
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Fixture unavailable",
            },
          },
        });
        return;
      }
      const days: UsageActivityDay[] =
        year === 2026
          ? [
              {
                date: "2026-01-02",
                amountMinor: 200,
                dispatchCount: 1,
                chargeCount: 2,
              },
              {
                date: "2026-01-03",
                amountMinor: 700,
                dispatchCount: 3,
                chargeCount: 3,
              },
              {
                date: "2026-10-10",
                amountMinor: 0,
                dispatchCount: 1,
                chargeCount: 1,
              },
            ]
          : year === 2024
            ? [
                {
                  date: "2024-02-29",
                  amountMinor: 150,
                  dispatchCount: 1,
                  chargeCount: 1,
                },
              ]
            : [];
      body = {
        year,
        currentYear: 2026,
        availableYears: [2026, 2025, 2024],
        asOf: "2026-10-25T12:00:00.000Z",
        timeZone: "UTC",
        currency: "EUR",
        evidence: simulation ? "simulation" : "production",
        days,
        totals: days.reduce(
          (sum, day) => ({
            amountMinor: sum.amountMinor + day.amountMinor,
            dispatchCount: sum.dispatchCount + day.dispatchCount,
            chargeCount: sum.chargeCount + day.chargeCount,
            activeDays: sum.activeDays + 1,
          }),
          { amountMinor: 0, dispatchCount: 0, chargeCount: 0, activeDays: 0 },
        ),
      } satisfies UsageActivity;
    }
    await route.fulfill({ status: 200, json: body });
  });
  return {
    reads,
    writes,
    fail: (year?: number) => {
      failYear = year;
    },
    simulate: () => {
      simulation = true;
    },
  };
}

for (const appearance of ["classic", "v2"] as const) {
  test(`${appearance}: annual activity shows actual amounts, zero-cent operations and selected day detail`, async ({
    page,
    isMobile,
  }, testInfo) => {
    const state = await fixture(page);
    await page.goto(`/?appearance=${appearance}#/app/usage`);
    await expect(page.locator(".workspace")).toHaveAttribute(
      "data-appearance",
      appearance,
    );
    const activity = page.locator(".usage-activity");
    const grid = activity.getByRole("grid", {
      name: "Consommation quotidienne en 2026",
    });
    await expect(grid).toBeVisible();
    if (!isMobile) {
      expect(
        await activity
          .locator(".usage-activity-scroll")
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
    }
    await expect(grid.locator("button")).toHaveCount(365);
    await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(activity.locator(".usage-activity-summary")).toContainText(
      "9,00",
    );
    await expect(activity.locator(".usage-activity-summary")).toContainText(
      "6 opérations comptabilisées",
    );
    const day = grid.locator('[data-date="2026-01-02"]');
    await expect(day).toHaveAttribute(
      "aria-label",
      /vendredi 2 janvier 2026.*2,00.*2 opérations comptabilisées/,
    );
    await expect(day).toHaveAttribute("data-level", "2");
    await expect(grid.locator('[data-date="2026-01-03"]')).toHaveAttribute(
      "data-level",
      "4",
    );
    await expect(grid.locator('[data-date="2026-10-10"]')).toHaveAttribute(
      "data-level",
      "1",
    );
    await expect(grid.locator('[data-date="2026-01-01"]')).toHaveAttribute(
      "data-level",
      "0",
    );
    await expect(grid.locator('[data-date="2026-10-26"]')).toBeDisabled();
    await expect(grid.locator('[data-date="2026-10-25"]')).toBeEnabled();
    await day.click();
    const detail = activity.locator(".usage-activity-detail");
    await expect(detail).toContainText("vendredi 2 janvier 2026");
    await expect(detail).toContainText("2,00");
    await expect(detail.locator("dd")).toHaveText([/2,00/, "2", "1"]);
    await grid.locator('[data-date="2026-01-01"]').click();
    await expect(detail).toContainText(
      "Aucune consommation enregistrée pour ce jour.",
    );
    await expect(detail.locator("dd")).toHaveText([/0,00/, "0", "0"]);
    await expect(activity).toContainText("par jour UTC");
    await expect(
      page.getByLabel("Mois de consommation", { exact: true }),
    ).toHaveValue("2026-09");
    await expect(page.locator(".usage-ledger")).toContainText("9,00");
    await expect(page.locator(".credit-balance")).toContainText("40,00");
    expect(state.writes).toEqual([]);
    await day.click();
    await expect(detail.locator("dd")).toHaveText([/2,00/, "2", "1"]);
    await page.screenshot({
      path: testInfo.outputPath(
        appearance === "v2" ? "annual-activity-v2.png" : "annual-activity.png",
      ),
      fullPage: true,
    });
  });
}

test("calendar supports leap years, roving keyboard focus and contained mobile scrolling", async ({
  page,
  isMobile,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/usage");
  const activity = page.locator(".usage-activity");
  await page
    .getByLabel("Année d’activité", { exact: true })
    .selectOption("2024");
  const grid = activity.getByRole("grid", {
    name: "Consommation quotidienne en 2024",
  });
  await expect(grid.locator("button")).toHaveCount(366);
  const leap = grid.locator('[data-date="2024-02-29"]');
  await leap.click();
  await expect(leap).toBeFocused();
  await leap.press("ArrowRight");
  await expect(grid.locator('[data-date="2024-03-07"]')).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(grid.locator('[data-date="2024-03-06"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(grid.locator('[data-date="2024-01-01"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(grid.locator('[data-date="2024-12-31"]')).toBeFocused();
  await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(activity.locator(".usage-activity-detail")).toContainText(
    "mardi 31 décembre 2024",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  if (isMobile) {
    const bounds = await leap.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(24);
    expect(
      await activity
        .locator(".usage-activity-scroll")
        .evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);
  }
  expect(state.reads).toContain("/api/usage/activity?year=2024");
  expect(state.writes).toEqual([]);
});

test("failed year reads stay distinct from empty years and recover without losing monthly history", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/usage");
  const activity = page.locator(".usage-activity");
  state.fail(2025);
  await page
    .getByLabel("Année d’activité", { exact: true })
    .selectOption("2025");
  await expect(activity.getByRole("alert")).toBeVisible();
  await expect(activity.getByRole("grid")).toHaveCount(0);
  await expect(
    activity.getByText(
      "Aucune consommation datée enregistrée pour cette année.",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".usage-ledger")).toContainText("9,00");
  await expect(
    page.getByLabel("Année d’activité", { exact: true }),
  ).toHaveValue("2025");
  state.fail();
  await activity
    .getByRole("button", { name: "Réessayer", exact: true })
    .click();
  await expect(activity.getByRole("grid")).toBeVisible();
  await expect(
    activity.getByText(
      "Aucune consommation datée enregistrée pour cette année.",
    ),
  ).toBeVisible();
  await expect(activity.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("refresh reloads the annual view and simulation stays visibly labelled", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/usage");
  const activity = page.locator(".usage-activity");
  await expect(activity.getByRole("grid")).toBeVisible();
  state.simulate();
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(activity).toContainText(
    "Activité simulée — ces montants sont fictifs.",
  );
  expect(
    state.reads.filter((path) => path === "/api/usage/activity?year=2026"),
  ).toHaveLength(2);
  expect(state.writes).toEqual([]);
});

test("German calendar remains translated and usable at 320 pixels", async ({
  page,
}, testInfo) => {
  const state = await fixture(page, "de");
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/#/app/usage");
  const activity = page.locator(".usage-activity");
  await expect(
    activity.getByRole("heading", { name: "Tägliche Aktivität" }),
  ).toBeVisible();
  await expect(page.getByLabel("Aktivitätsjahr", { exact: true })).toHaveValue(
    "2026",
  );
  await expect(activity.locator(".usage-activity-detail")).toContainText(
    "Tagesverbrauch",
  );
  await expect(activity).not.toContainText("Daily consumption");
  await expect(activity).not.toContainText("Related dispatches");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("annual-activity-de-320.png"),
    fullPage: true,
  });
  expect(state.writes).toEqual([]);
});
