import { expect, type Page } from "@playwright/test";

/** Public pages expose language choices inside the appropriate navigation menu. */
export async function publicLanguagePicker(page: Page) {
  const mobileToggle = page.locator("header .mobile-menu-toggle");
  if (await mobileToggle.isVisible()) {
    if ((await mobileToggle.getAttribute("aria-expanded")) !== "true")
      await mobileToggle.click();
  } else {
    const menu = page.locator("header .language-menu");
    if (!(await menu.evaluate((element) => element.hasAttribute("open"))))
      await menu.locator("summary").click();
  }
  const picker = page.locator('header select[name="language"]:visible');
  await expect(picker).toHaveCount(1);
  await expect(picker).toBeVisible();
  return picker;
}
