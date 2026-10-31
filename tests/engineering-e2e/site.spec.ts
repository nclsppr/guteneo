import { expect, test } from "@playwright/test";

test("reading surfaces remain usable with light, dark and reduced-motion preferences", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator(".gutenberg-note img").first()).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".gutenberg-note img")
          .first()
          .evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    const ink = await page
      .locator(".engineering-wordmark")
      .first()
      .evaluate((element) => getComputedStyle(element).color);
    expect(ink).toBe(
      colorScheme === "dark" ? "rgb(246, 245, 239)" : "rgb(24, 27, 34)",
    );
    expect(
      await page
        .locator(".engineering-brand")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
  }
  expect(failures).toEqual([]);
});

test("the static host applies security headers and exposes no application routes", async ({
  request,
}) => {
  const home = await request.get("/");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  for (const route of [
    "/__missing_engineering_page__/",
    "/api/documents",
    "/mcp",
  ])
    expect((await request.get(route)).status()).toBe(404);
});

test("all feature branches and the permission matrix are reachable", async ({
  page,
}) => {
  await page.goto("/features/");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Documents and protection", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Documents and protection");
  await expect(page.locator("li[id^='feature-']").first()).toBeVisible();
  await page.goto("/features/permissions/");
  await expect(
    page.getByRole("columnheader", { name: "Connected assistant" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("Markdown and assistant indexes contain the same useful prose", async ({
  request,
}) => {
  const markdown = await request.get("/index.md");
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain(
    "Good printing starts with a clear proof",
  );
  const index = await request.get("/llms.txt");
  expect(index.ok()).toBe(true);
  expect(await index.text()).toContain("features");
});

test("local search opens, finds a provider and restores keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Search documentation",
    exact: true,
  });
  await trigger.click();
  const query = page.getByRole("combobox", { name: "Search documentation" });
  await query.fill("Telnyx");
  await expect(
    page.locator("[data-search-results]").getByRole("option").first(),
  ).toBeVisible();
  await expect(page.locator("[data-search-results]")).toContainText(
    /Telnyx|delivery|architecture/i,
  );
  await query.press("Escape");
  await expect(query).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("technical figures have keyboard steps, textual alternatives and downloadable SVGs", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [route, asset, id] of [
    ["/architecture/system/", "system-architecture", "system"],
    ["/architecture/dispatch-lifecycle/", "dispatch-lifecycle", "dispatch"],
    ["/workflows/documents/", "document-pipeline", "documents"],
    ["/engineering/provider-maintenance/", "provider-freshness", "freshness"],
  ]) {
    await page.goto(route);
    const figure = page.locator(`guteneo-anatomy[data-figure="${id}"]`);
    await expect(figure).toBeVisible();
    const steps = figure.locator("[data-step]");
    await steps.first().focus();
    await steps.first().press("ArrowRight");
    await expect(steps.nth(1)).toBeFocused();
    await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "true");
    await figure
      .getByText("Read the complete explanation", { exact: true })
      .click();
    await expect(figure.locator("details ol")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    for (const suffix of ["", "-mermaid"]) {
      const svg = await request.get(`/illustrations/${asset}${suffix}.svg`);
      expect(svg.ok()).toBe(true);
      expect(await svg.text()).toContain("<svg");
    }
  }
});

test("Mermaid diagrams and administration are discoverable; engineering references are available", async ({ page }) => {
  await page.goto("/");
  await page.locator('main a[href="/architecture/diagrams/"]').first().click();
  await expect(page.locator("h1")).toContainText("Mermaid");
  await expect(page.locator(".mermaid-figure")).toHaveCount(4);
  for (const chart of await page.locator(".mermaid-figure img").all()) {
    await chart.scrollIntoViewIfNeeded();
    await expect.poll(() => chart.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const diagramRegion = page.locator(".mermaid-paper").first();
  await diagramRegion.focus();
  await diagramRegion.press("ArrowRight");
  await expect.poll(() => diagramRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  await page.goto("/");
  await page.locator('main a[href="/administration/belvedere/"]').first().click();
  await expect(page.locator("h1")).toContainText("Belvédère");
  await expect(page.getByRole("main")).toContainText("The seven views");
  await expect(page.getByRole("main")).toContainText("Membership grants no platform-wide Belvédère access");

  for (const [route, heading] of [
    ["/architecture/data-model/", /data model/i],
    ["/engineering/releases/", /release/i],
    ["/engineering/troubleshooting/", /troubleshoot/i],
  ] as const) {
    await page.goto(route);
    await expect(page.locator("h1")).toContainText(heading);
    await expect(page.getByRole("main")).not.toContainText("TODO");
  }
});
