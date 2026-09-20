import { evidencePath } from "./evidence";
import { expect, test } from "@playwright/test";

const slugs = ["de-gutenberg-au-numerique", "histoire-imprimerie-luxembourg"];

for (const slug of slugs) {
  test(`editorial reading, artwork and contents: ${slug}`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`/journal/${slug}/`);
    await expect(page.locator("main h1")).toHaveCount(1);
    const hero = page.locator(".article-hero img");
    await expect(hero).toBeVisible();
    await expect
      .poll(() =>
        hero.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    expect(
      await hero.evaluate(
        (element: HTMLImageElement) => new URL(element.currentSrc).pathname,
      ),
    ).toMatch(
      /^\/editorial\/(gutenberg-to-digital|luxembourg-printing)(-small)?\.webp$/,
    );
    await expect(page.locator(".article-hero figcaption")).toContainText(
      "Illustration contemporaine",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: await evidencePath(
        `editorial/${slug}-${testInfo.project.name}.png`,
      ),
    });
    const firstChapter = page.locator(".article-copy section").first();
    const firstId = await firstChapter.getAttribute("id");
    await page.locator(`.article-contents a[href="#${firstId}"]`).click();
    expect(new URL(page.url()).hash).toBe(`#${firstId}`);
    expect(
      await firstChapter.evaluate(
        (element) => element.getBoundingClientRect().top,
      ),
    ).toBeLessThan(100);
    await expect(firstChapter.getByRole("heading")).toBeVisible();
    await page.screenshot({
      path: await evidencePath(
        `editorial/${slug}-reading-${testInfo.project.name}.png`,
      ),
    });
    const targets = await page
      .locator(".chapter-sources a")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")!.slice(1)),
      );
    for (const id of new Set(targets))
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
