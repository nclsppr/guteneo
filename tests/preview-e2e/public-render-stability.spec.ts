import { expect, test, type Page } from "@playwright/test";

const publicApplication = process.env.GUTENEO_PUBLIC_APP === "1";

async function headingPresentation(page: Page) {
  return page.locator("main h1").evaluate(async (heading) => {
    // FontFaceSet.ready can wait for deferred modules on WebKit. Load the
    // measured heading/header faces directly while those modules are held.
    const typography = [
      heading,
      ...document.querySelectorAll("header a, header button, header summary"),
    ];
    // Optional faces may retain their fallback after WebKit's loading deadline
    // even with successful HTTP responses. Font delivery has its own suite;
    // this measurement accepts that fallback and still requires stable geometry.
    const fontLoads = await Promise.allSettled(
      typography.map((element) => {
        const style = getComputedStyle(element);
        const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return document.fonts.load(font, element.textContent ?? "");
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const rect = heading.getBoundingClientRect();
    const style = getComputedStyle(heading);
    return {
      text: heading.textContent,
      lang: document.documentElement.lang,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      font: style.font,
      margin: style.margin,
      rejectedOptionalFontLoads: fontLoads.filter(
        (result) => result.status === "rejected",
      ).length,
    };
  });
}

for (const [locale, title] of [
  ["fr", "Tarifs"],
  ["en", "Pricing"],
  ["de", "Preise"],
  ["lb", "Präisser"],
] as const) {
  test(`initial ${locale} pricing layout and language survive delayed interaction code`, async ({
    page,
    context,
    baseURL,
  }) => {
    let releaseScripts: () => void = () => {};
    const heldScripts = new Promise<void>((resolve) => {
      releaseScripts = resolve;
    });
    let scriptRequests = 0;
    let sessionRequests = 0;
    const writes: string[] = [];
    const fontHttpErrors: string[] = [];
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (path.endsWith(".woff2") && response.status() >= 400)
        fontHttpErrors.push(`${response.status()} ${path}`);
    });
    await context.addCookies([
      { name: "guteneo_locale", value: "account.en", url: baseURL! },
    ]);
    await page.route("**/assets/*.js", async (route) => {
      scriptRequests += 1;
      await heldScripts;
      await route.continue();
    });
    await page.route("**/api/**", (route) => {
      const request = route.request();
      if (!["GET", "HEAD"].includes(request.method()))
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      if (new URL(request.url()).pathname === "/api/session")
        sessionRequests += 1;
      return route.fulfill({
        json: {
          user: {
            id: "render-stability-user",
            role: "member",
            name: "Example",
            preferredLocale: "en",
          },
          organization: { id: "render-stability-org", name: "Example" },
          csrfToken: "render-stability-fixture",
          simulation: true,
        },
      });
    });
    try {
      await page.goto(`/pricing/?lang=${locale}`, { waitUntil: "commit" });
      await expect(page.locator("main h1")).toHaveText(title);
      await expect.poll(() => scriptRequests).toBeGreaterThan(0);
      await expect(
        page.locator('header[data-render-state="interactive"]'),
      ).toHaveCount(0);
      const initial = await headingPresentation(page);
      expect(initial.lang).toBe(locale);
      const initialPadding = await page
        .locator(".public-detail-heading")
        .evaluate((heading) => getComputedStyle(heading).paddingTop);
      expect(initialPadding).toBe(
        await page.evaluate(() => (innerWidth <= 760 ? "38px" : "58px")),
      );

      releaseScripts();
      await expect(
        page.locator('header[data-render-state="interactive"]'),
      ).toBeVisible();
      const interactive = await headingPresentation(page);
      expect(interactive.text).toBe(initial.text);
      expect(interactive.lang).toBe(initial.lang);
      expect(interactive.font).toBe(initial.font);
      expect(interactive.margin).toBe(initial.margin);
      for (const dimension of ["top", "left", "width", "height"] as const)
        expect(interactive[dimension]).toBeCloseTo(initial[dimension], 0);
      expect(writes).toEqual([]);
      expect(fontHttpErrors).toEqual([]);
      if (publicApplication) expect(sessionRequests).toBe(0);
      await test.info().attach("initial-and-interactive-layout", {
        body: JSON.stringify({ initial, interactive }),
        contentType: "application/json",
      });
    } finally {
      releaseScripts();
    }
  });
}

test("a legacy device-only choice reaches localized HTML before its first visible heading", async ({
  page,
}) => {
  const visibleHeadings: { language: string; text: string }[] = [];
  await page.exposeFunction(
    "recordPublicHeading",
    (sample: { language: string; text: string }) => {
      visibleHeadings.push(sample);
    },
  );
  await page.addInitScript(() => {
    localStorage.setItem("guteneo.locale", "de");
    let previous = "";
    const record = (
      window as unknown as Window & {
        recordPublicHeading: (sample: {
          language: string;
          text: string;
        }) => Promise<void>;
      }
    ).recordPublicHeading;
    function sample() {
      const heading = document.querySelector("main h1");
      const text = heading?.textContent ?? "";
      if (
        heading &&
        text &&
        text !== previous &&
        heading.getBoundingClientRect().height > 0 &&
        getComputedStyle(heading).visibility === "visible"
      ) {
        previous = text;
        void record({ language: document.documentElement.lang, text });
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.goto("/pricing/");
  await expect(page).toHaveURL(/\/pricing\/\?lang=de$/);
  await expect(
    page.locator('header[data-render-state="interactive"]'),
  ).toBeVisible();
  await expect(page.locator("main h1")).toHaveText("Preise");
  await expect.poll(() => visibleHeadings.length).toBeGreaterThan(0);
  expect(visibleHeadings).toEqual([{ language: "de", text: "Preise" }]);
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBe("de");
});

test("an account presentation hint selects initial public HTML without a session dependency", async ({
  page,
  context,
  baseURL,
}) => {
  let releaseScripts: () => void = () => {};
  const heldScripts = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  let sessionRequests = 0;
  await context.addCookies([
    { name: "guteneo_locale", value: "account.de", url: baseURL! },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("guteneo.locale", "lb");
  });
  await page.route("**/assets/*.js", async (route) => {
    await heldScripts;
    await route.continue();
  });
  await page.route("**/api/**", (route) => {
    if (new URL(route.request().url()).pathname === "/api/session")
      sessionRequests += 1;
    return route.fulfill({ status: 401, json: { error: "No session" } });
  });
  try {
    const response = await page.goto("/pricing/", { waitUntil: "commit" });
    expect(response?.headers()["content-language"]).toBe("de");
    await expect(page.locator("main h1")).toHaveText("Preise");
    await expect(
      page.locator('header[data-render-state="interactive"]'),
    ).toHaveCount(0);
    releaseScripts();
    await expect(
      page.locator('header[data-render-state="interactive"]'),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.locator("main h1")).toHaveText("Preise");
    expect(sessionRequests).toBe(0);
    expect(
      await page.evaluate(() => localStorage.getItem("guteneo.locale")),
    ).toBe("lb");
  } finally {
    releaseScripts();
  }
});
