import { test, expect } from "@playwright/test";
import publicSite from "../../packages/contracts/src/public-site.json" with { type: "json" };
import { publicLanguagePicker } from "../public-language";
import cards from "../../packages/contracts/src/social-cards.json" with { type: "json" };
import { getPublicSocialCopy } from "../../apps/web/src/editorial/social-copy";

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
    expect(html).toContain('property="og:title" content="guteneo"');
    expect(html).toContain('property="og:description" content="guteneo.com"');
    expect(html).toContain(
      `property="og:image" content="https://guteneo.com${cards.neutral.src}"`,
    );
    expect(html).not.toMatch(/property="og:locale"/);
    expect([
      ...html.matchAll(/hreflang="(?:x-default|fr|en|de|lb)"/g),
    ]).toHaveLength(5);
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
    paths
      .flatMap((path) => [
        `https://guteneo.com${path}`,
        ...publicSite.locales.map(
          (locale) => `https://guteneo.com${path}?lang=${locale}`,
        ),
      ])
      .sort(),
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
    const selector = await publicLanguagePicker(page);
    await expect(selector).toHaveValue("en");
    await selector.selectOption("de");
    await expect(page).toHaveURL(new RegExp(`${path}\\?lang=de$`));
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
  for (const path of ["/app", "/app/prepare?entry=direct", "/app/plan"]) {
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
  await page.goto("/");
  await page.locator('a[href="/app/plan"]').click();
  await expect(page).toHaveURL(/\/#\/app\/plan$/);
  await expect(
    page.getByRole("heading", { name: "Horizon plan", level: 1 }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Horizon plan", level: 1 }),
  ).toBeVisible();
  expect(backendRequests).toEqual([]);
  const backend = await request.get("/api/session");
  expect(backend.status()).toBe(403);
  expect(await backend.json()).toMatchObject({
    error: { code: "PREVIEW_ONLY" },
  });
});

test("explicit-language pages are translated and shareable without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    locale: "fr-FR",
    baseURL,
  });
  const locales = {
    fr: "fr_FR",
    en: "en_GB",
    de: "de_DE",
    lb: "lb_LU",
  } as const;
  try {
    const page = await context.newPage();
    for (const path of [
      "/",
      "/journal/de-gutenberg-au-numerique/",
      "/confidentialite/",
      "/assistants/chatgpt/",
    ]) {
      let frenchHeading = "";
      for (const locale of ["fr", "en", "de", "lb"] as const) {
        const copy = getPublicSocialCopy(path, locale)!;
        const response = await page.goto(`${path}?lang=${locale}`, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page).toHaveTitle(copy.title);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          `https://guteneo.com${path}?lang=${locale}`,
        );
        await expect(
          page.locator('meta[property="og:locale"]'),
        ).toHaveAttribute("content", locales[locale]);
        await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
          "content",
          copy.title,
        );
        await expect(
          page.locator('meta[property="og:description"]'),
        ).toHaveAttribute("content", copy.description);
        const heading = (await page.locator("main h1").innerText()).trim();
        expect(heading).toBeTruthy();
        if (locale === "fr") frenchHeading = heading;
        else expect(heading).not.toBe(frenchHeading);
        const image = path.startsWith("/journal/")
          ? "/editorial/gutenberg-to-digital.webp"
          : cards[locale].src;
        await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
          "content",
          `https://guteneo.com${image}`,
        );
      }
    }
    await page.goto("/journal/de-gutenberg-au-numerique/?lang=de");
    await page.locator('main a[href="/journal/?lang=de"]').first().click();
    await expect(page).toHaveURL(/\/journal\/\?lang=de$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  } finally {
    await context.close();
  }
});

test("a selection on a generic link is preserved in the URL and the crawler response", async ({
  page,
  request,
}) => {
  await page.goto("/support/");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "guteneo",
  );
  await (await publicLanguagePicker(page)).selectOption("de");
  await expect(page).toHaveURL(/\/support\/\?lang=de$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  const copy = getPublicSocialCopy("/support/", "de")!;
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    copy.title,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `https://guteneo.com${cards.de.src}`,
  );
  const crawler = await request.get(page.url(), {
    headers: { "user-agent": "Discordbot/2.0", "accept-language": "en-US" },
  });
  expect(crawler.status()).toBe(200);
  const html = await crawler.text();
  expect(html).toContain('<html lang="de">');
  expect(html).toContain(`property="og:title" content="${copy.title}"`);
  expect(html).toContain(
    `property="og:image" content="https://guteneo.com${cards.de.src}"`,
  );
  expect(html).toContain(
    'rel="canonical" href="https://guteneo.com/support/?lang=de"',
  );
});

test("browser language inference leaves a generic share link language-neutral", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ locale: "de-DE", baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/support/");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page).toHaveURL(/\/support\/$/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "guteneo",
    );
    await expect(
      page.locator('meta[property="og:description"]'),
    ).toHaveAttribute("content", "guteneo.com");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `https://guteneo.com${cards.neutral.src}`,
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("Automatic restores neutral sharing, generic public links and fallback structured data", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ locale: "de-DE", baseURL });
  const path = "/journal/de-gutenberg-au-numerique/";
  try {
    const page = await context.newPage();
    await page.goto(`${path}?lang=lb&campaign=sharing`);
    await expect(
      page.locator('main a[href="/journal/?lang=lb"]').first(),
    ).toBeVisible();
    const picker = await publicLanguagePicker(page);
    await expect(picker).toHaveValue("lb");
    await picker.selectOption("auto");
    await expect(picker).toHaveValue("auto");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    const url = new URL(page.url());
    expect(url.searchParams.has("lang")).toBe(false);
    expect(url.searchParams.get("campaign")).toBe("sharing");
    expect(
      await page.evaluate(() => localStorage.getItem("guteneo.locale")),
    ).toBeNull();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://guteneo.com${path}`,
    );
    for (const [selector, content] of [
      ['meta[property="og:title"]', "guteneo"],
      ['meta[name="twitter:title"]', "guteneo"],
      ['meta[property="og:description"]', "guteneo.com"],
      ['meta[property="og:image"]', `https://guteneo.com${cards.neutral.src}`],
      ['meta[name="twitter:image"]', `https://guteneo.com${cards.neutral.src}`],
    ]) {
      await expect(page.locator(selector)).toHaveAttribute("content", content);
    }
    await expect(page.locator('meta[property="og:locale"]')).toHaveCount(0);
    await expect(
      page.locator('main a[href="/journal/"]').first(),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.locator("#root a[href]").evaluateAll(
          (anchors, publicPaths) =>
            anchors.filter((anchor) => {
              const target = new URL((anchor as HTMLAnchorElement).href);
              return (
                target.origin === location.origin &&
                publicPaths.includes(target.pathname) &&
                !target.hash.startsWith("#/app") &&
                target.searchParams.has("lang")
              );
            }).length,
          publicSite.paths,
        ),
      )
      .toBe(0);
    await expect
      .poll(async () => {
        const schemas = (
          await page
            .locator('script[type="application/ld+json"]')
            .allTextContents()
        ).map((text) => JSON.parse(text));
        return schemas.find((schema) => schema["@type"] === "Article");
      })
      .toMatchObject({
        inLanguage: "fr",
        url: `https://guteneo.com${path}`,
        mainEntityOfPage: `https://guteneo.com${path}`,
        headline: getPublicSocialCopy(path, "fr")!.title.replace(
          / \| Guteneo$/,
          "",
        ),
      });
  } finally {
    await context.close();
  }
});

test("localized navigation stays shareable when preference storage is unavailable", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"] as const) {
      Storage.prototype[method] = () => {
        throw new Error("Storage disabled for this browser");
      };
    }
  });
  await page.goto("/?lang=de");
  const menu = page.locator(".mobile-menu-toggle");
  if (await menu.isVisible()) await menu.click();
  const assistants = page
    .locator('header a[href^="/assistants/"]:visible')
    .first();
  await expect(assistants).toHaveAttribute("href", "/assistants/?lang=de");
  const copiedLink = await assistants.getAttribute("href");
  const response = await request.get(copiedLink!);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(
    'property="og:locale" content="de_DE"',
  );
  await assistants.click();
  await expect(page).toHaveURL(/\/assistants\/\?lang=de$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    getPublicSocialCopy("/assistants/", "de")!.title,
  );
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
