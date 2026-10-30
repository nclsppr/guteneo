import { expect, test } from "@playwright/test";

test("mobile navigation closes on Escape after pointer and keyboard opening", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/developers/"]) {
      await test.step(`${path} at ${width}px`, async () => {
        await page.goto(path);
        const toggle = page.locator(".public-menu-toggle");
        const navigation = page.locator(".public-mobile-navigation");

        await toggle.click();
        await expect(navigation).toBeVisible();
        // WebKit pointer activation can leave focus on the document body.
        await page.keyboard.press("Escape");
        await expect(navigation).toBeHidden();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(toggle).toBeFocused();

        await page.keyboard.press("Enter");
        await expect(navigation).toBeVisible();
        await navigation.locator("a").first().focus();
        await expect(navigation.locator("a").first()).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(navigation).toBeHidden();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(toggle).toBeFocused();
      });
    }
  }
});
