import { expect, test, type Page } from "@playwright/test";

async function textGeometry(page: Page) {
  return page.locator("main h1, main h2, main p").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
}

for (const path of ["/", "/pricing/"]) {
  test(`late fonts leave visible ${path} text stationary`, async ({ page }) => {
    let releaseFonts: () => void = () => {};
    const fontGate = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    const fontRequests: string[] = [];
    await page.route(/\.woff2(?:\?|$)/, async (route) => {
      fontRequests.push(new URL(route.request().url()).pathname);
      await fontGate;
      await route.continue();
    });
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    try {
      await page.goto(`${path}?lang=fr`, { waitUntil: "domcontentloaded" });
      await expect(
        page.locator('header[data-render-state="interactive"]'),
      ).toBeVisible();
      const preloads = page.locator('head link[rel="preload"][as="font"]');
      await expect(preloads).toHaveCount(3);
      expect(
        await preloads.evaluateAll((links) =>
          links.every(
            (link) =>
              link.getAttribute("type") === "font/woff2" &&
              link.hasAttribute("crossorigin"),
          ),
        ),
      ).toBe(true);
      await expect.poll(() => fontRequests.length).toBeGreaterThanOrEqual(3);
      // Pass the optional font's brief initial period while its bytes are held.
      await page.waitForTimeout(300);
      const fontFaces = await page.evaluate(() =>
        [...document.fonts].map((face) => ({
          display: face.display,
          status: face.status,
        })),
      );
      expect(fontFaces.length).toBeGreaterThan(0);
      // WebKit completes an optional face's timeline before its request settles.
      expect(fontFaces.every((face) => face.status !== "loaded")).toBe(true);
      expect(fontFaces.every((face) => face.display === "optional")).toBe(true);
      const before = await textGeometry(page);
      releaseFonts();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      await page.waitForLoadState("networkidle");
      const after = await textGeometry(page);
      expect(after).toHaveLength(before.length);
      for (const [index, initial] of before.entries()) {
        const loaded = after[index]!;
        expect(loaded.text).toBe(initial.text);
        for (const dimension of ["x", "y", "width", "height"] as const)
          expect(loaded[dimension]).toBeCloseTo(initial[dimension], 1);
      }
      await test.info().attach("late-font-text-geometry", {
        body: JSON.stringify({ path, fontRequests, before, after }),
        contentType: "application/json",
      });
    } finally {
      releaseFonts();
    }
  });
}
