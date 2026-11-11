import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { stationFixture } from "./fixtures";

const paths = [
  "/",
  "/departures",
  "/counter",
  "/documents",
  "/arrivals",
  "/lockers",
  "/destinations",
  "/timetable",
  "/studio",
  "/office",
  "/account",
];

for (const locale of ["fr", "en", "de", "lb"]) {
  test(`the public hall renders in ${locale} without privileged reads or mutations`, async ({
    page,
  }, testInfo) => {
    const fixture = await stationFixture(page, { signedIn: false });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?lang=${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const hallMeasurements = await page.evaluate(() => ({
      environment: "Vite with synthetic API; not production performance",
      headingObservedAtMs: performance.now(),
      paints: performance.getEntriesByType("paint").map((entry) => ({
        name: entry.name,
        startTimeMs: entry.startTime,
      })),
      requests: performance.getEntriesByType("resource").length,
      transferredBytes: performance
        .getEntriesByType("resource")
        .reduce(
          (sum, entry) =>
            sum + (entry as PerformanceResourceTiming).transferSize,
          0,
        ),
    }));
    await expect(page.locator('a[href*="/auth/login"]')).not.toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("hall.title");
    expect(errors).toEqual([]);
    fixture.assertReadOnly();
    expect(
      fixture.requests.filter(
        (request) =>
          ![
            "GET /session",
            "GET /personal/session",
            "GET /capabilities",
          ].includes(request),
      ),
    ).toEqual([]);
    await testInfo.attach(`hall-${locale}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await testInfo.attach(`hall-${locale}-synthetic-measurements`, {
      body: JSON.stringify(hallMeasurements, null, 2),
      contentType: "application/json",
    });
  });
}

for (const path of paths) {
  for (const locale of ["fr", "en", "de", "lb"] as const) {
    test(`${path} in ${locale} has a usable empty state and never writes on open`, async ({
      page,
    }) => {
      const fixture = await stationFixture(page, { locale });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${path}?lang=${locale}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main")).not.toBeEmpty();
      await expect(
        page.locator(
          ".station-loading, .gare-loading, .traffic-loading, .document-loading",
        ),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(fixture.missing).toEqual([]);
      await expect(page.locator("body")).not.toContainText(
        /\b(?:shell|traffic|docs|arrivals|work|state|error|section|action)\.[a-zA-Z]/,
      );
      fixture.assertReadOnly();
    });
  }
}

test("changing account in another tab removes the old document before rendering the new account", async ({
  page,
}) => {
  const fixture = await stationFixture(page, { document: true });
  await page.goto("/documents");
  await expect(
    page.getByText("Private fixture A.pdf", { exact: true }),
  ).toBeVisible();
  await fixture.replaceIdentity("B");
  await expect(
    page.getByText("Private fixture A.pdf", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Private fixture B.pdf", { exact: true }),
  ).toBeVisible();
  await fixture.replaceIdentity("A");
  await expect(
    page.getByText("Private fixture B.pdf", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Private fixture A.pdf", { exact: true }),
  ).toBeVisible();
  fixture.assertReadOnly();
});

test("losing the session in another tab purges private document content", async ({
  page,
}) => {
  const fixture = await stationFixture(page, { document: true });
  await page.goto("/documents");
  await expect(
    page.getByText("Private fixture A.pdf", { exact: true }),
  ).toBeVisible();
  await fixture.revokeDocuments(401);
  await expect(
    page.getByText("Private fixture A.pdf", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('a[href*="/auth/login"]')).not.toHaveCount(0);
  fixture.assertReadOnly();
});

test("an observer cannot open a preparation form or trigger a write", async ({
  page,
}) => {
  const fixture = await stationFixture(page, { role: "viewer" });
  await page.goto("/counter");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toHaveCount(0);
  fixture.assertReadOnly();
});

test("public theme, language, narrow layout and accessibility remain usable", async ({
  page,
}, testInfo) => {
  await stationFixture(page, { signedIn: false });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/?lang=fr");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  const language = page.locator('select:has(option[value="lb"])');
  await language.selectOption("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.reload();
  // An explicit URL language keeps precedence over the device-local preference.
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await testInfo.attach("hall-night-reduced-motion", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await testInfo.attach("synthetic-resource-measurements", {
    body: JSON.stringify(
      await page.evaluate(() => ({
        environment:
          "Vite dev server with intercepted synthetic API responses; not production performance",
        resources: performance.getEntriesByType("resource").map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          const url = new URL(resource.name);
          return {
            pathname: url.pathname,
            durationMs: resource.duration,
            transferSize: resource.transferSize,
          };
        }),
      })),
      null,
      2,
    ),
    contentType: "application/json",
  });
});
