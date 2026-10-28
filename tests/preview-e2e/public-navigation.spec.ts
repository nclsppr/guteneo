import { expect, test, type Page } from "@playwright/test";
import site from "../../packages/contracts/src/public-site.json" with { type: "json" };
import { publicLanguagePicker } from "../public-language";

const publicApplication = process.env.GUTENEO_PUBLIC_APP === "1";

type PublicHead = {
  title: string;
  canonical: string | null;
  description: string | null;
  type: string | null;
  alternates: { language: string | null; href: string | null }[];
  schemas: unknown[];
};

async function publicHead(page: Page): Promise<PublicHead> {
  return page.evaluate(() => ({
    title: document.title,
    canonical:
      document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
      null,
    description:
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") ?? null,
    type:
      document
        .querySelector('meta[property="og:type"]')
        ?.getAttribute("content") ?? null,
    alternates: [
      ...document.querySelectorAll('link[rel="alternate"][hreflang]'),
    ].map((element) => ({
      language: element.getAttribute("hreflang"),
      href: element.getAttribute("href"),
    })),
    schemas: [
      ...document.querySelectorAll('script[type="application/ld+json"]'),
    ].map((element) => JSON.parse(element.textContent ?? "null")),
  }));
}

async function expectedHead(page: Page, path: string): Promise<PublicHead> {
  const response = await page.request.get(path);
  expect(response.ok()).toBe(true);
  const html = await response.text();
  const attribute = (pattern: RegExp) => html.match(pattern)?.[1] ?? null;
  return {
    title: attribute(/<title>([^<]*)<\/title>/) ?? "",
    canonical: attribute(/<link rel="canonical" href="([^"]+)"/),
    description:
      attribute(/<meta name="description" content="([^"]*)"/)
        ?.replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'") ?? null,
    type: attribute(/<meta property="og:type" content="([^"]*)"/),
    alternates: [
      ...html.matchAll(
        /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g,
      ),
    ].map((match) => ({ language: match[1], href: match[2] })),
    schemas: [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ].map((match) => JSON.parse(match[1])),
  };
}

async function interactive(page: Page) {
  await expect(
    page.locator('header[data-render-state="interactive"]'),
  ).toBeVisible();
}

for (const [locale, pricing] of [
  ["fr", "Tarifs"],
  ["en", "Pricing"],
  ["de", "Preise"],
  ["lb", "Präisser"],
] as const) {
  test(`public ${locale} links change content, focus and metadata without a document reload`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const apiRequests: string[] = [];
    await page.route("**/api/**", (route) => {
      const request = route.request();
      apiRequests.push(
        `${request.method()} ${new URL(request.url()).pathname}`,
      );
      return route.fulfill({ status: 401, json: { error: "No session" } });
    });
    await page.goto(`/?lang=${locale}`);
    await interactive(page);
    const origin = await page.evaluate(() => performance.timeOrigin);
    const documentRequests: string[] = [];
    page.on("request", (request) => {
      if (request.isNavigationRequest()) documentRequests.push(request.url());
    });
    const samples: Record<string, unknown>[] = [];
    for (const path of [...site.paths.filter((path) => path !== "/"), "/"]) {
      const expected = await expectedHead(page, `${path}?lang=${locale}`);
      let target = page
        .locator(
          path === "/"
            ? "header a.brand"
            : `.public-site-footer a[href^="${path}"]`,
        )
        .first();
      if (path !== "/" && (await target.count()) === 0)
        target = page
          .locator(`main a[href^="${path}"]:not([aria-hidden="true"])`)
          .first();
      if ((await target.count()) === 0) {
        const index = path.startsWith("/journal/")
          ? "/journal/"
          : "/assistants/";
        await page.locator(`.public-site-footer a[href^="${index}"]`).focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(`${index}?lang=${locale}`);
        target = page
          .locator(`main a[href^="${path}"]:not([aria-hidden="true"])`)
          .first();
      }
      await target.focus();
      const started = await page.evaluate(() => performance.now());
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`${path}?lang=${locale}`);
      await interactive(page);
      await expect(page.locator("main h1")).toBeVisible();
      if (path === "/pricing/")
        await expect(page.locator("main h1")).toHaveText(pricing);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.activeElement?.tagName === "MAIN" ||
              document.activeElement?.matches("main h1") === true,
          ),
        )
        .toBe(true);
      await expect.poll(() => publicHead(page)).toEqual(expected);
      const sample = await page.evaluate(async (started) => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        return {
          milliseconds: performance.now() - started,
          timeOrigin: performance.timeOrigin,
          heading: document.querySelector("main h1")?.textContent,
          resources: performance
            .getEntriesByType("resource")
            .filter((entry) => entry.startTime >= started)
            .map((entry) => {
              const resource = entry as PerformanceResourceTiming;
              return {
                path: new URL(resource.name).pathname,
                type: resource.initiatorType,
                transferSize: resource.transferSize,
                decodedBodySize: resource.decodedBodySize,
              };
            }),
        };
      }, started);
      expect(sample.timeOrigin).toBe(origin);
      samples.push({ path, ...sample });
    }
    expect(documentRequests).toEqual([]);
    expect(apiRequests).toEqual(
      publicApplication
        ? ["GET /api/capabilities", "GET /api/capabilities"]
        : [],
    );
    await info.attach("public-navigation-resources", {
      body: JSON.stringify(samples),
      contentType: "application/json",
    });

    await page.goBack();
    await expect(page).toHaveURL(`/assistants/cursor/?lang=${locale}`);
    await expect(page.locator("main h1")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`/assistants/?lang=${locale}`);
    await page.goForward();
    await expect(page).toHaveURL(`/assistants/cursor/?lang=${locale}`);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    expect(documentRequests).toEqual([]);
  });
}

test("mobile page navigation dismisses its menu and leaves the new main focused", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=en");
  await interactive(page);
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.locator(".public-menu-toggle").click();
  const link = page.locator('.public-mobile-navigation a[href^="/pricing/"]');
  await expect(link).toBeVisible();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main h1")).toHaveText("Pricing");
  await expect(page.locator(".public-mobile-navigation")).toBeHidden();
  await expect(page.locator(".public-menu-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement?.tagName === "MAIN" ||
          document.activeElement?.matches("main h1") === true,
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("the first public page change works while subsequent code and document requests are blocked", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  await interactive(page);
  const origin = await page.evaluate(() => performance.timeOrigin);
  const blocked: string[] = [];
  await page.route("**/*", (route) => {
    const request = route.request();
    if (request.isNavigationRequest() || request.resourceType() === "script") {
      blocked.push(request.url());
      return route.abort("failed");
    }
    return route.continue();
  });
  await page
    .locator('.public-site-footer a[href^="/pricing/"]')
    .evaluate((element) => (element as HTMLAnchorElement).click());
  await expect(page).toHaveURL("/pricing/?lang=en");
  await expect(page.locator("main h1")).toHaveText("Pricing");
  await expect(page.locator(".public-site-footer nav a")).toHaveCount(16);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  expect(blocked).toEqual([]);
});

test("public server links keep working before delayed initial interaction code arrives", async ({
  page,
}) => {
  let release: () => void = () => {};
  const heldEntry = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => {
    await heldEntry;
    await route.continue();
  });
  try {
    await page.goto("/?lang=en", { waitUntil: "commit" });
    await expect(page.locator("main h1")).toBeVisible();
    await expect(
      page.locator('header[data-render-state="interactive"]'),
    ).toHaveCount(0);
    const origin = await page.evaluate(() => performance.timeOrigin);
    await page
      .locator('.public-site-footer a[href^="/pricing/"]')
      .evaluate((element) => (element as HTMLAnchorElement).click());
    await expect(page).toHaveURL("/pricing/?lang=en");
    await expect(page.locator("main h1")).toHaveText("Pricing");
    expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
    release();
    await interactive(page);
  } finally {
    release();
  }
});

test("complete public content and native links survive unavailable initial interaction code", async ({
  page,
}) => {
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) =>
    route.abort("failed"),
  );
  await page.goto("/pricing/?lang=en");
  await expect(page.locator("main h1")).toHaveText("Pricing");
  await expect(page.locator(".public-site-footer nav a")).toHaveCount(16);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://guteneo.com/pricing/?lang=en",
  );
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.locator('.public-site-footer a[href^="/support/"]').click();
  await expect(page).toHaveURL("/support/?lang=en");
  await expect(page.locator("main h1")).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
});

test("automatic language survives returning to the original document path", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  await interactive(page);
  const origin = await page.evaluate(() => performance.timeOrigin);
  await (await publicLanguagePicker(page)).selectOption("auto");
  await expect(page).toHaveURL("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.locator('.public-site-footer a[href^="/pricing/"]').click();
  await expect(page).toHaveURL("/pricing/");
  await expect(page.locator("main h1")).toHaveText("Tarifs");
  await page.locator("header a.brand").click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.goBack();
  await expect(page).toHaveURL("/pricing/");
  await expect(page.locator("main h1")).toHaveText("Tarifs");
  await page.goForward();
  await expect(page).toHaveURL("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("cross-page bookmarks focus their target and browser history restores the previous scroll", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/support/?lang=en");
  await interactive(page);
  await page.locator(".public-site-footer").scrollIntoViewIfNeeded();
  const origin = await page.evaluate(() => performance.timeOrigin);
  const savedScroll = await page.evaluate(() => scrollY);
  await page
    .locator('.public-site-footer a[href^="/privacy/"]')
    .evaluate((element) => {
      const link = element as HTMLAnchorElement;
      link.href = "/privacy/?lang=en#rights";
      link.click();
    });
  await expect(page).toHaveURL("/privacy/?lang=en#rights");
  await expect(page.locator("#rights")).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator("#rights")
        .evaluate((element) => Math.abs(element.getBoundingClientRect().top)),
    )
    .toBeLessThan(120);
  await page.locator(".public-site-footer").scrollIntoViewIfNeeded();
  const destinationScroll = await page.evaluate(() => scrollY);
  await page.goBack();
  await expect(page).toHaveURL("/support/?lang=en");
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeCloseTo(savedScroll, 0);
  await page.goForward();
  await expect(page).toHaveURL("/privacy/?lang=en#rights");
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeCloseTo(destinationScroll, 0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("article and assistant destinations keep their own schema and fragment history", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/journal/?lang=en");
  await interactive(page);
  const origin = await page.evaluate(() => performance.timeOrigin);
  const article = "/journal/from-gutenberg-to-digital/";
  const expected = await expectedHead(page, `${article}?lang=en`);
  await page.locator(`main a[href^="${article}"]`).first().click();
  await expect(page).toHaveURL(`${article}?lang=en`);
  await expect.poll(() => publicHead(page)).toEqual(expected);
  await page.locator('.public-site-footer a[href^="/assistants/"]').click();
  await page.locator('main a[href^="/assistants/chatgpt/"]').first().click();
  await expect(page).toHaveURL("/assistants/chatgpt/?lang=en");
  await expect
    .poll(() => publicHead(page))
    .toEqual(await expectedHead(page, "/assistants/chatgpt/?lang=en"));
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);

  // A same-document bookmark keeps native history and scroll semantics.
  const heading = page.locator("main h1");
  await heading.evaluate((element) => {
    element.id = "navigation-bookmark";
  });
  await page.evaluate(() => {
    const anchor = document.createElement("a");
    anchor.href = "#navigation-bookmark";
    anchor.textContent = "Bookmark";
    document.querySelector("main")!.appendChild(anchor);
    anchor.click();
  });
  await expect(page).toHaveURL(/#navigation-bookmark$/);
  await page.goBack();
  await expect(page).toHaveURL("/assistants/chatgpt/?lang=en");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});
