import { expect, test } from "@playwright/test";

test("developer guide is SSR-readable and its download is a self-contained contract", async ({
  browser,
  request,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    viewport: testInfo.project.use.viewport,
  });
  try {
    const page = await context.newPage();
    await page.goto("/developpeurs/");
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(
      page.getByText("Bêta en préparation.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#authentification")).toContainText(
      "https://guteneo.com/mcp",
    );
    await expect(page.locator("#fiabilite")).toContainText(
      "submission_unknown",
    );
    await expect(page.locator("noscript p")).toContainText("sans JavaScript");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
  const response = await request.get("/openapi.json");
  expect(response.ok()).toBe(true);
  const spec = await response.json();
  expect(spec.openapi).toBe("3.0.3");
  expect(Object.keys(spec.paths)).toHaveLength(20);
  expect(spec.paths["/api/dispatches/{id}/approve"]).toBeUndefined();
});

test("Swagger is lazy, does not authorize or execute, and cannot follow query overrides", async ({
  page,
  context,
}, testInfo) => {
  const requested: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  expect(requested.filter((url) => /swagger|openapi\.json/.test(url))).toEqual(
    [],
  );
  requested.length = 0;
  await page.goto(
    "/developpeurs/?url=https://untrusted.invalid/spec.json&config=https://untrusted.invalid/config.json",
  );
  await expect(page.locator("main h1")).toBeVisible();
  expect(
    requested.filter(
      (url) =>
        /\/api\/|swagger|openapi\.json|untrusted\.invalid\//.test(url) &&
        new URL(url).pathname !== "/developpeurs/",
    ),
  ).toEqual([]);
  await page.screenshot({
    path: `reports/screenshots/developers/guide-${testInfo.project.name}.png`,
  });
  await context.addCookies([
    { name: "documentation-fixture", value: "not-a-secret", url: page.url() },
  ]);
  const specRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/openapi.json",
  );
  const button = page.getByRole("button", {
    name: "Ouvrir la référence Swagger",
  });
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await button.click();
  const request = await specRequest;
  expect((await request.allHeaders()).cookie).toBeUndefined();
  expect((await request.allHeaders()).authorization).toBeUndefined();
  await expect(page.locator("#swagger-reference .opblock")).toHaveCount(23);
  await expect(
    page.getByRole("button", { name: "Référence ouverte", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /authorize|try it out|execute/i }),
  ).toHaveCount(0);
  await page.locator("#swagger-reference .opblock-summary").first().click();
  await expect(
    page.locator("#swagger-reference .opblock-body").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /authorize|try it out|execute/i }),
  ).toHaveCount(0);
  expect(
    requested.filter(
      (url) => new URL(url).origin !== new URL(page.url()).origin,
    ),
  ).toEqual([]);
  expect(
    requested.filter((url) => /\/api\//.test(new URL(url).pathname)),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    (await page
      .locator("#swagger-reference .opblock-summary-path")
      .first()
      .boundingBox())!.height,
  ).toBeLessThanOrEqual(44);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `reports/screenshots/developers/reference-${testInfo.project.name}.png`,
  });
});
