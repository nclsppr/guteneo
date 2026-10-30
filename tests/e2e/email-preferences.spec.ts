import { expect, test } from "@playwright/test";

for (const action of ["unsubscribe", "report"] as const) {
  test(`recipient explicitly confirms ${action} without sign-in or a document access request`, async ({
    page,
  }, testInfo) => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    const token = "1".repeat(64);
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      calls.push({
        path: new URL(request.url()).pathname,
        method: request.method(),
        body: request.postDataJSON(),
      });
      await route.fulfill({
        json: {
          feedback: action === "report" ? "reported" : "unsubscribed",
          scope: "workspace",
        },
      });
    });
    await page.goto(`/?lang=fr#/email-preferences?token=${token}`);
    await expect(
      page.getByRole("heading", { name: "Préférences e-mail" }),
    ).toBeVisible();
    const firstUsefulContentMs = await page.evaluate(() => performance.now());
    await expect(page).toHaveURL(/#\/email-preferences$/);
    expect(calls).toEqual([]);
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await page
      .getByRole("button", {
        name:
          action === "report"
            ? "Signaler un e-mail non souhaité"
            : "Se désabonner",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      action === "report" ? "E-mail signalé" : "Désabonné",
    );
    expect(calls).toEqual([
      {
        path: "/api/email-preferences",
        method: "POST",
        body: { token, action },
      },
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const measurements = await page.evaluate(() => ({
      resources: performance.getEntriesByType("resource").length,
      transferBytes: (
        performance.getEntriesByType("resource") as PerformanceResourceTiming[]
      ).reduce((sum, entry) => sum + entry.transferSize, 0),
      javascriptTransferBytes: (
        performance.getEntriesByType("resource") as PerformanceResourceTiming[]
      )
        .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
        .reduce((sum, entry) => sum + entry.transferSize, 0),
      fcpMs:
        performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
        null,
    }));
    await testInfo.attach("preference-performance", {
      body: JSON.stringify({ ...measurements, firstUsefulContentMs }),
      contentType: "application/json",
    });
    await page.screenshot({
      path: testInfo.outputPath("email-preference-result.png"),
      fullPage: true,
    });
  });
}

test("a missing capability offers recovery and makes no business request", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/**", async (route) => {
    calls++;
    await route.fulfill({ status: 500, json: {} });
  });
  await page.goto("/?lang=fr#/email-preferences");
  await expect(page.getByRole("alert")).toHaveText(
    "Rouvrez le lien de préférences dans l’e-mail reçu.",
  );
  await expect(
    page.getByRole("button", { name: "Se désabonner", exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(0);
});

test("opening another email link in the same tab replaces the recipient capability", async ({
  page,
}) => {
  const requests: unknown[] = [];
  const first = "1".repeat(64);
  const second = "2".repeat(64);
  await page.route("**/api/**", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { feedback: "reported", scope: "workspace" } });
  });
  await page.goto(`/?lang=fr#/email-preferences?token=${first}`);
  await expect(page).toHaveURL(/#\/email-preferences$/);
  await page.goto(`/?lang=fr#/email-preferences?token=${second}`);
  await expect(page).toHaveURL(/#\/email-preferences$/);
  await page
    .getByRole("button", { name: "Signaler un e-mail non souhaité" })
    .click();
  await expect(page.getByRole("status")).toContainText("E-mail signalé");
  expect(requests).toEqual([{ token: second, action: "report" }]);
});
