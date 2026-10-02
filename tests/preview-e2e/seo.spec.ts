import { test, expect } from "@playwright/test";
import publicSite from "../../packages/contracts/src/public-site.json" with { type: "json" };

const publicApplication = process.env.GUTENEO_PUBLIC_APP === "1";

const paths = publicSite.paths;

test("public routes expose complete initial HTML, metadata and true HTTP statuses", async ({
  request,
}) => {
  const titles = new Set<string>();
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<main[\s>]/);
    expect(html).toMatch(/<h1[\s>]/);
    expect(html).toContain(`rel="canonical" href="https://guteneo.com${path}"`);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
    expect(title).toBeTruthy();
    titles.add(title!);
    // Only the canonical domain is indexable; local and fallback hosts stay private.
    const primary = new URL(response.url()).hostname === "guteneo.com";
    expect(response.headers()["x-robots-tag"] ?? null).toBe(
      primary ? null : "noindex, nofollow",
    );
    expect(html).toMatch(/<script\b[^>]*type="module"[^>]*src="\/assets\//);
    if (path.startsWith("/journal/") && path !== "/journal/") {
      const schemas = [
        ...html.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((match) => JSON.parse(match[1]));
      expect(
        schemas.some((schema) =>
          ["Article", "BlogPosting"].includes(schema["@type"]),
        ),
      ).toBe(true);
      expect(
        schemas.some((schema) => schema["@type"] === "BreadcrumbList"),
      ).toBe(true);
      expect(html).toContain('href="/journal/"');
    }
    if (path !== "/") {
      const redirect = await request.get(path.slice(0, -1), {
        maxRedirects: 0,
      });
      expect(redirect.status()).toBeGreaterThanOrEqual(300);
      expect(redirect.status()).toBeLessThan(400);
      expect(
        new URL(redirect.headers().location, response.url()).pathname,
      ).toBe(path);
      const htmlRedirect = await request.get(`${path}index.html`, {
        maxRedirects: 0,
      });
      expect(htmlRedirect.status()).toBeGreaterThanOrEqual(300);
      expect(htmlRedirect.status()).toBeLessThan(400);
      expect(
        new URL(htmlRedirect.headers().location, response.url()).pathname,
      ).toBe(path);
    }
  }
  expect(titles.size).toBe(paths.length);
  for (const path of [
    "/does-not-exist/",
    "/journal/unpublished/",
    "/assistants/unknown-assistant/",
    "/app/unknown",
    "/app/prepare/unknown",
    "/missing.css",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  }
  const sitemap = await request.get("/sitemap.xml");
  const urls = [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(
    (match) => match[1],
  );
  expect(urls.sort()).toEqual(
    paths.map((path) => `https://guteneo.com${path}`).sort(),
  );
  const robots = await request.get("/robots.txt");
  if (new URL(robots.url()).hostname === "guteneo.com") {
    expect(await robots.text()).toContain(
      "Sitemap: https://guteneo.com/sitemap.xml",
    );
    expect(await robots.text()).not.toContain("Disallow: /\n");
  } else expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  const backend = await request.get("/api/session");
  expect(backend.status()).toBe(publicApplication ? 401 : 403);
  expect(await backend.json()).toMatchObject({
    error: {
      code: publicApplication ? "AUTHENTICATION_REQUIRED" : "PREVIEW_ONLY",
    },
  });
});

test("every public page applies its language selector without preview API calls", async ({
  page,
}) => {
  test.skip(
    publicApplication,
    "This contract qualifies the browser-only preview",
  );
  const accountRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (/^\/(api|auth|oauth|mcp)\//.test(new URL(request.url()).pathname))
      accountRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const path of paths) {
    const response = await page.goto(`${path}?lang=en`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const selector = page.locator('select[name="language"]').first();
    await expect(selector).toHaveValue("en");
    await selector.selectOption("de");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(selector).toHaveValue("de");
    expect(
      await page.evaluate(() => localStorage.getItem("guteneo.locale")),
    ).toBe("de");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.locator("main h1")).toHaveCount(1);
  }
  expect(accountRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("app entry links resolve privately and reach the existing preview router", async ({
  page,
  request,
}) => {
  test.skip(publicApplication, "Preview navigation uses only browser fixtures");
  const backendRequests: string[] = [];
  page.on("request", (request) => {
    if (/^\/(api|auth|oauth|mcp)(\/|$)/.test(new URL(request.url()).pathname))
      backendRequests.push(request.url());
  });
  for (const path of ["/app", "/app/prepare?entry=direct"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await request.fetch(path, { method });
      expect(response.status()).toBe(200);
      expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
      expect(response.headers()["cache-control"]).toBe("no-store");
      if (method === "HEAD") expect(await response.text()).toBe("");
    }
    const write = await request.post(path);
    expect(write.status()).toBe(403);
    expect(await write.json()).toMatchObject({
      error: { code: "PREVIEW_ONLY" },
    });
  }
  await page.goto("/");
  await page.locator('.footer-colophon a[href="/app"]').click();
  await expect(page).toHaveURL(/\/#\/app$/);
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  await page.goto("/");
  await page.locator('a[href="/app/prepare?entry=direct"]').click();
  await expect(page).toHaveURL(/\/#\/app\/prepare\?entry=direct$/);
  await expect(
    page.getByRole("heading", { name: "Préparer une correspondance." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Préparer une correspondance." }),
  ).toBeVisible();
  await page.goto("/app?lang=en");
  await expect(page).toHaveURL(/\/\?lang=en#\/app$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(backendRequests).toEqual([]);
  const backend = await request.get("/api/session");
  expect(backend.status()).toBe(403);
  expect(await backend.json()).toMatchObject({
    error: { code: "PREVIEW_ONLY" },
  });
});

test("journal content and ordinary navigation work with JavaScript disabled", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto("/journal/");
    await expect(page.locator("main h1")).toBeVisible();
    await page
      .locator('a[href="/journal/de-gutenberg-au-numerique/"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/journal\/de-gutenberg-au-numerique\/$/);
    await expect(page.locator("main h1")).toBeVisible();
    expect((await page.locator("main").innerText()).length).toBeGreaterThan(
      1000,
    );
    await page.locator('main a[href="/journal/"]').first().click();
    await expect(page).toHaveURL(/\/journal\/$/);
    await page.goto("/journal/histoire-imprimerie-luxembourg/");
    await expect(page.locator("main h1")).toBeVisible();
    expect((await page.locator("main").innerText()).length).toBeGreaterThan(
      1000,
    );
    await page.goto("/mentions-legales/");
    await expect(page.locator("main h1")).toBeVisible();
  } finally {
    await context.close();
  }
});
