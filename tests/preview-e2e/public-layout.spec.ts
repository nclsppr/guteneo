import { expect, test } from "@playwright/test";
import { evidencePath } from "./evidence";

const paths = [
  "/",
  "/pricing/",
  "/how-it-works/",
  "/getting-started/",
  "/pdf-checks/",
  "/journal/",
  "/journal/from-gutenberg-to-digital/",
  "/about/",
  "/legal/",
  "/privacy/",
  "/terms/",
  "/support/",
  "/roles/",
  "/assistants/",
  "/assistants/chatgpt/",
  "/developers/",
];

test("the public toolbar keeps its three controls inside the frame at 320px in every language", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  for (const locale of ["fr", "en", "de", "lb"] as const) {
    await page.goto(`/?lang=${locale}`);
    await expect(page.locator(".public-header")).toHaveAttribute(
      "data-render-state",
      "interactive",
    );
    const header = (await page.locator(".public-header").boundingBox())!;
    for (const control of await page
      .locator(
        ".public-header-actions > .public-theme-toggle, .public-header-actions > .language-menu, .public-header-actions > .public-menu-toggle",
      )
      .all()) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(header.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(
        header.x + header.width + 1,
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    const toggle = page.locator(".public-theme-toggle");
    await expect(toggle).toHaveAccessibleName(
      {
        fr: "Passer au mode sombre",
        en: "Switch to dark mode",
        de: "Zum dunklen Modus wechseln",
        lb: "Op den donkele Modus wiesselen",
      }[locale]!,
    );
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAccessibleName(
      {
        fr: "Passer au mode clair",
        en: "Switch to light mode",
        de: "Zum hellen Modus wechseln",
        lb: "Op den helle Modus wiesselen",
      }[locale]!,
    );
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }
});

for (const width of [1440, 390]) {
  test(`public pages share one frame and identical footer at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    let reference:
      { x: number; width: number; footerHeight: number } | undefined;
    for (const path of paths) {
      await page.goto(`${path}?lang=fr`);
      await expect(page.locator(".public-header")).toHaveAttribute(
        "data-render-state",
        "interactive",
      );
      await page.evaluate(() => document.fonts.ready);
      const header = page.locator(".public-header");
      const main = page.locator(".public-site > main");
      await expect(main).toHaveCount(1);
      const footer = page.locator(".public-site-footer");
      const headerBox = (await header.boundingBox())!;
      const mainBox = (await main.boundingBox())!;
      const footerBox = (await footer.boundingBox())!;
      reference ??= {
        x: headerBox.x,
        width: headerBox.width,
        footerHeight: footerBox.height,
      };
      for (const box of [headerBox, mainBox, footerBox]) {
        expect(
          Math.abs(box.x - reference.x),
          `${path} left edge`,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(box.width - reference.width),
          `${path} frame width`,
        ).toBeLessThanOrEqual(1);
      }
      expect(
        Math.abs(footerBox.height - reference.footerHeight),
        `${path} common footer height`,
      ).toBeLessThanOrEqual(1);
      await expect(footer.locator("nav a")).toHaveCount(15);
      await expect(footer.locator(".founding-stamp")).toHaveCount(1);
      await expect(footer.locator(".public-margin-swallow")).toHaveCount(2);
      await expect(page.locator(".public-theme-toggle")).toHaveCount(1);
      const toggleBox = (await page
        .locator(".public-theme-toggle")
        .boundingBox())!;
      expect(toggleBox.width).toBeGreaterThanOrEqual(44);
      expect(toggleBox.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      for (const copy of await page
        .locator(".article-copy, .legal-copy")
        .all()) {
        if (width === 1440)
          expect((await copy.boundingBox())!.width).toBeLessThan(
            headerBox.width * 0.8,
          );
      }
      const name =
        path === "/" ? "home" : path.replaceAll("/", "-").replace(/^-|-$/g, "");
      await page.screenshot({
        path: await evidencePath(
          `public-layout/${info.project.name}-${width}-${name}-top.png`,
        ),
      });
      await footer.scrollIntoViewIfNeeded();
      await footer
        .locator("img")
        .evaluateAll(async (images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        );
      await footer.screenshot({
        path: await evidencePath(
          `public-layout/${info.project.name}-${width}-${name}-footer.png`,
        ),
      });
    }
  });
}
