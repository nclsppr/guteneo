import { expect, test, type Page } from "@playwright/test";
import { evidencePath } from "./evidence";

async function choosePublicTheme(page: Page, theme: "light" | "dark") {
  await expect(page.locator(".public-header")).toHaveAttribute(
    "data-render-state",
    "interactive",
  );
  const toggle = page.locator(".public-theme-toggle");
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toBeVisible();
  if ((await page.locator("html").getAttribute("data-theme")) !== theme)
    await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

test("the home panorama follows the selected theme while other pages keep the compact shared footer", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/?lang=fr");
  const closing = page.locator(".public-home-closing");
  await expect(closing.getByRole("heading")).toHaveText(
    "Les idées voyagent.Les nôtres partent d’ici.",
  );
  await expect(
    closing.getByRole("link", { name: "Préparer mon premier envoi" }),
  ).toHaveAttribute("href", "/?lang=fr#installation");
  await expect(closing.locator(".founding-stamp")).toHaveCount(1);
  await expect(page.locator(".public-site-footer .founding-stamp")).toHaveCount(
    1,
  );
  const centered = await closing
    .locator(".footer-invitation-copy")
    .evaluate((copy) => {
      const center = (element: Element) => {
        const box = element.getBoundingClientRect();
        return box.x + box.width / 2;
      };
      return {
        column: center(copy),
        heading: center(copy.querySelector("h2")!),
        action: center(copy.querySelector("a")!),
        align: getComputedStyle(copy.querySelector("h2")!).textAlign,
      };
    });
  expect(centered.align).toBe("center");
  expect(Math.abs(centered.heading - centered.column)).toBeLessThanOrEqual(1);
  expect(Math.abs(centered.action - centered.heading)).toBeLessThanOrEqual(1);
  for (const theme of ["light", "dark"] as const) {
    await choosePublicTheme(page, theme);
    const footer = page.locator(".public-site-footer");
    const image = closing.locator(".public-footer-panorama img");
    await closing.scrollIntoViewIfNeeded();
    await image.evaluate((image) => (image as HTMLImageElement).decode());
    await expect
      .poll(() =>
        image.evaluate(
          (image) => new URL((image as HTMLImageElement).currentSrc).pathname,
        ),
      )
      .toBe(
        theme === "dark"
          ? "/luxembourg-dark-panorama.webp"
          : "/luxembourg-blue-panorama.webp",
      );
    await expect(image).toHaveJSProperty("naturalWidth", 2172);
    await expect(image).toHaveCSS("filter", "none");
    await expect(closing.locator(".footer-bird")).toHaveCount(3);
    await expect(closing.locator(".founding-postmark")).toHaveCSS(
      "color",
      theme === "dark" ? "rgb(246, 245, 239)" : "rgb(24, 27, 34)",
    );
    await expect(closing.locator(".footer-postage")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(closing.locator(".founding-stamp")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(closing.locator(".founding-stamp")).toHaveAttribute(
      "src",
      "/brand/gutenberg-guteneo-stamp-transparent.webp",
    );
    const stampBox = (await closing.locator(".footer-postage").boundingBox())!;
    const panoramaBox = (await image.boundingBox())!;
    expect(stampBox.y + stampBox.height).toBeLessThanOrEqual(panoramaBox.y);
    expect(
      (await closing.boundingBox())!.y + (await closing.boundingBox())!.height,
    ).toBeLessThanOrEqual((await footer.boundingBox())!.y);
    await closing
      .locator(".founding-stamp")
      .evaluate((image) => (image as HTMLImageElement).decode());
    await closing.screenshot({
      path: await evidencePath(
        `public-amendment/${info.project.name}-home-footer-${theme}.png`,
      ),
    });
    await page.locator(".public-header").scrollIntoViewIfNeeded();
    await expect(page.locator(".public-header .brand-wordmark")).toHaveCSS(
      "color",
      theme === "dark" ? "rgb(246, 245, 239)" : "rgb(24, 27, 34)",
    );
    await expect(page.locator(".public-header .brand")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(page.locator(".public-header .brand-mark")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    const portraitPaper = await page
      .locator(".public-header .brand-picture")
      .evaluate((picture) => {
        const paper = getComputedStyle(picture, "::before");
        return {
          color: paper.backgroundColor,
          inset: parseFloat(paper.left),
          width: picture.getBoundingClientRect().width,
        };
      });
    expect(portraitPaper.color).toBe("rgb(255, 255, 255)");
    expect(portraitPaper.inset).toBeCloseTo(portraitPaper.width * 0.105, 1);
    if (theme === "dark") {
      await expect
        .poll(() =>
          page
            .locator(".public-header .brand-mark")
            .evaluate(
              (image) =>
                new URL((image as HTMLImageElement).currentSrc).pathname,
            ),
        )
        .toBe("/brand/guteneo-portrait-128.webp");
    }
    await page.locator(".public-header").screenshot({
      path: await evidencePath(
        `public-amendment/${info.project.name}-header-${theme}.png`,
      ),
    });
  }
  for (const path of [
    "/pricing/",
    "/getting-started/",
    "/journal/",
    "/support/",
  ]) {
    await page.goto(path);
    await expect(page.locator(".public-site-footer")).toHaveCount(1);
    await expect(page.locator(".public-footer-panorama")).toHaveCount(0);
    await expect(page.locator("footer nav a")).toHaveCount(16);
    await expect(page.locator(".public-margin-swallow")).toHaveCount(2);
    await expect(page.locator(".public-page-swallows")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  }
  await page.goto("/?lang=fr");
  await page.locator(".public-home-closing").getByRole("link").click();
  await expect(page.locator("#installation")).toBeFocused();
  await page.goto("/?lang=en#/app/account");
  await expect(page.locator(".sidebar .brand-wordmark")).toHaveCSS(
    "color",
    "rgb(246, 245, 239)",
  );
  await expect(page.locator(".sidebar .brand")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".dashboard-artwork")).toHaveCount(0);
  await expect(page.locator(".public-page-swallows")).toHaveCount(0);
});

test("editorial artwork uses theme-specific assets directly on the page without added frames", async ({
  page,
}, info) => {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto("/journal/?lang=fr");
    await choosePublicTheme(page, theme);
    const art = page.locator(".journal-story-art").first();
    await expect(art).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(art).toHaveCSS("border-radius", "0px");
    await expect(art).toHaveCSS("padding", "0px");
    await page.locator(".journal-story-art img").evaluateAll(async (images) => {
      await Promise.all(
        images.map((image) => (image as HTMLImageElement).decode()),
      );
    });
    const journalSources = await page
      .locator(".journal-story-art img")
      .evaluateAll((images) =>
        images.map(
          (image) => new URL((image as HTMLImageElement).currentSrc).pathname,
        ),
      );
    for (const source of journalSources) {
      expect(source).toMatch(/\.webp$/);
      expect(source.includes("-dark")).toBe(theme === "dark");
    }
    await page.locator(".public-site-footer").scrollIntoViewIfNeeded();
    await page
      .locator(".public-site-footer img")
      .evaluateAll(async (images) => {
        await Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        );
      });
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: await evidencePath(
        `public-amendment/${info.project.name}-journal-${theme}.png`,
      ),
      fullPage: true,
    });
    for (const slug of [
      "from-gutenberg-to-digital",
      "printing-history-luxembourg",
    ]) {
      await page.goto(`/journal/${slug}/?lang=fr`);
      const hero = page.locator(".article-hero");
      await expect(hero.locator(".article-art-paper")).toHaveCount(0);
      await expect(hero.locator("picture")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(hero.locator("picture")).toHaveCSS("padding", "0px");
      await expect(hero.locator("picture img")).toHaveCSS("filter", "none");
      await expect(hero.locator("picture img")).toHaveCSS(
        "mix-blend-mode",
        "normal",
      );
      await expect(hero.locator(":scope > figcaption")).toContainText(
        "Illustration contemporaine",
      );
      await hero
        .locator("img")
        .evaluate((image) => (image as HTMLImageElement).decode());
      const source = await hero
        .locator("img")
        .evaluate(
          (image) => new URL((image as HTMLImageElement).currentSrc).pathname,
        );
      expect(source.includes("-dark")).toBe(theme === "dark");
      await hero.screenshot({
        path: await evidencePath(
          `public-amendment/${info.project.name}-${slug}-${theme}.png`,
        ),
      });
    }
  }
});

test("native artwork sources follow the system dark theme without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  try {
    await page.goto("/journal/from-gutenberg-to-digital/?lang=en");
    const portrait = page.locator(".public-header .brand-mark");
    const art = page.locator(".article-hero img");
    await expect(art).toBeVisible();
    await expect
      .poll(() =>
        portrait.evaluate(
          (image) => new URL((image as HTMLImageElement).currentSrc).pathname,
        ),
      )
      .toBe("/brand/guteneo-portrait-128.webp");
    await expect
      .poll(() =>
        art.evaluate((image) => (image as HTMLImageElement).currentSrc),
      )
      .toContain("gutenberg-to-digital-dark");
    await expect(page.locator("footer nav a")).toHaveCount(16);
    await expect(page.locator(".public-footer-panorama")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
