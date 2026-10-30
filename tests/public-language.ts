import { expect, type Page } from "@playwright/test";

/** Public pages share one language disclosure at every viewport width. */
export async function publicLanguagePicker(page: Page) {
  await expect(
    page.locator('header[data-render-state="interactive"]'),
  ).toBeVisible();
  const menu = page.locator("header .language-menu");
  if (!(await menu.evaluate((element) => element.hasAttribute("open"))))
    await menu.locator("summary").click();
  const picker = page.locator('header select[name="language"]:visible');
  await expect(picker).toHaveCount(1);
  await expect(picker).toBeVisible();
  return picker;
}
