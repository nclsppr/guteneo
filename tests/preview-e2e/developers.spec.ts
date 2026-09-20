import { expect, test } from "@playwright/test";

const publicApplication = process.env.GUTENEO_PUBLIC_APP === "1";

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
  expect(Object.keys(spec.paths)).toHaveLength(23);
  expect(spec.paths["/api/documents/{id}"].get.operationId).toBe("getDocument");
  expect(spec.paths["/api/dispatches/{id}/renew-quote"].post.operationId).toBe(
    "renewFaxQuote",
  );
  expect(spec.paths["/api/postal/address-pages"].post.operationId).toBe(
    "createPostalAddressPage",
  );
  expect(spec.paths["/api/dispatches/{id}/approve"]).toBeUndefined();
});

test("Swagger is lazy, does not authorize or execute, and cannot follow query overrides", async ({
  browser,
  baseURL,
  page,
  context,
}, testInfo) => {
  // Homepage session discovery belongs to its own context. Documentation must
  // remain API-free and error-free regardless of that separate bootstrap.
  const homeContext = await browser.newContext({
    baseURL,
    viewport: testInfo.project.use.viewport,
  });
  try {
    const home = await homeContext.newPage();
    const homeRequests: string[] = [];
    const homeErrors: { text: string; url?: string }[] = [];
    const sessionUrl = new URL("/api/session", baseURL).href;
    const expectedDenial = (text: string, url: string | undefined) =>
      publicApplication &&
      url === sessionUrl &&
      /^Failed to load resource: the server responded with a status of 401(?:\s|$)/.test(
        text,
      );
    home.on("request", (request) => homeRequests.push(request.url()));
    home.on("pageerror", (error) => homeErrors.push({ text: error.message }));
    home.on("console", (message) => {
      if (message.type() === "error")
        homeErrors.push({ text: message.text(), url: message.location().url });
    });
    const denial = publicApplication
      ? home.waitForResponse(
          (response) =>
            response.url() === sessionUrl &&
            response.request().method() === "GET",
        )
      : null;
    const denialConsole = publicApplication
      ? home.waitForEvent("console", {
          predicate: (message) =>
            message.type() === "error" &&
            expectedDenial(message.text(), message.location().url),
        })
      : null;
    await home.goto("/");
    if (denial && denialConsole) {
      const response = await denial;
      expect(response.status()).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "AUTHENTICATION_REQUIRED" },
      });
      await response.finished();
      const message = await denialConsole;
      await testInfo.attach("anonymous-home-session-denial", {
        body: JSON.stringify({
          status: response.status(),
          code: "AUTHENTICATION_REQUIRED",
          console: { text: message.text(), url: message.location().url },
        }),
        contentType: "application/json",
      });
    }
    expect(
      homeRequests.filter((url) => /swagger|openapi\.json/.test(url)),
    ).toEqual([]);
    expect(
      homeErrors.filter(({ text, url }) => !expectedDenial(text, url)),
    ).toEqual([]);
    expect(
      homeErrors.filter(({ text, url }) => expectedDenial(text, url)),
    ).toHaveLength(publicApplication ? 1 : 0);
  } finally {
    await homeContext.close();
  }
  const requested: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
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
    path: publicApplication
      ? testInfo.outputPath("guide.png")
      : `reports/screenshots/developers/guide-${testInfo.project.name}.png`,
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
  await expect(page.locator("#swagger-reference .opblock")).toHaveCount(26);
  await expect(
    page.locator("#operations-Courrier-createPostalAddressPage"),
  ).toHaveCount(1);
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
    path: publicApplication
      ? testInfo.outputPath("reference.png")
      : `reports/screenshots/developers/reference-${testInfo.project.name}.png`,
  });
});
