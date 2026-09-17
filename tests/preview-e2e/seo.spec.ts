import { test, expect } from "@playwright/test";

const paths = [
  "/",
  "/journal/",
  "/journal/de-gutenberg-au-numerique/",
  "/journal/histoire-imprimerie-luxembourg/",
  "/mentions-legales/",
  "/developpeurs/",
];

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
    expect(html.includes('type="module"')).toBe(
      ["/", "/developpeurs/"].includes(path),
    );
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
    "/app",
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
  expect(urls).toEqual(paths.map((path) => `https://guteneo.com${path}`));
  const robots = await request.get("/robots.txt");
  if (new URL(robots.url()).hostname === "guteneo.com") {
    expect(await robots.text()).toContain(
      "Sitemap: https://guteneo.com/sitemap.xml",
    );
    expect(await robots.text()).not.toContain("Disallow: /\n");
  } else expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  const backend = await request.get("/api/session");
  expect(backend.status()).toBe(403);
  expect(await backend.text()).toContain("PREVIEW_ONLY");
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
