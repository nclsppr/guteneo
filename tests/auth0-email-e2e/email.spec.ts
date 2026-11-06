import { test, expect } from "@playwright/test";
import { Liquid } from "liquidjs";
import { EMAIL_BRAND_IMAGE_BASE64 } from "../../packages/contracts/src/email-branding-image";
// @ts-expect-error JavaScript authoring module is covered by its Node contract tests.
import * as email from "../../scripts/auth0-email-templates.mjs";

const { EMAIL_LOCALES, EMAIL_LOGO, TEMPLATE_NAMES, localizedEmail } = email;

const engine = new Liquid({ strictFilters: true });
for (const name of TEMPLATE_NAMES as string[])
  for (const language of EMAIL_LOCALES as string[]) {
    test(`${name} / ${language}: readable at 320px with images available or blocked`, async ({
      page,
    }, testInfo) => {
      const portrait = Buffer.from(EMAIL_BRAND_IMAGE_BASE64, "base64");
      let images = true;
      await page.route("**/*", async (route) => {
        if (images && route.request().url() === EMAIL_LOGO)
          await route.fulfill({ contentType: "image/png", body: portrait });
        else await route.abort();
      });
      const url =
        "https://example.invalid/verify?ticket=" +
        "synthetic".repeat(100) +
        '&quoted="<value>"';
      const html = await engine.parseAndRender(localizedEmail(name).body, {
        request_language: language,
        url,
      });
      for (const available of [true, false]) {
        images = available;
        // A distinct blocked URL prevents Chromium from reusing the decoded image
        // from the preceding document without issuing an interceptable request.
        await page.setContent(
          available
            ? html
            : html.replaceAll(EMAIL_LOGO, `${EMAIL_LOGO}?images=blocked`),
          { waitUntil: "networkidle" },
        );
        expect(
          await page
            .locator("img")
            .evaluate(
              (element) => (element as HTMLImageElement).naturalWidth > 0,
            ),
        ).toBe(available);
        await expect(page.locator("img")).toHaveAttribute("width", "128");
        await expect(page.locator("img")).toHaveAttribute("height", "70");
        if (available)
          expect(
            await page.locator("img").evaluate((element) => ({
              width: (element as HTMLImageElement).naturalWidth,
              height: (element as HTMLImageElement).naturalHeight,
            })),
          ).toEqual({ width: 384, height: 210 });
        expect(await page.locator("html").getAttribute("lang")).toBe(language);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("link")).toHaveAttribute(
          "href",
          name === "welcome_email" ? "https://guteneo.com/auth/login" : url,
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(320);
        const button = await page.getByRole("link").boundingBox();
        expect(button?.height).toBeGreaterThanOrEqual(44);
        expect(button!.x).toBeGreaterThanOrEqual(8);
        expect(button!.x + button!.width).toBeLessThanOrEqual(312);
        expect(
          await page
            .getByText("guteneo", { exact: true })
            .evaluate((element) => getComputedStyle(element).color),
        ).toBe("rgb(24, 27, 34)");
        await page.screenshot({
          path: testInfo.outputPath(
            `${name}-${language}-${available ? "images" : "blocked"}.png`,
          ),
          fullPage: true,
        });
      }
    });
  }
