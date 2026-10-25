import { expect, test, type Page } from "@playwright/test";
import { publicLanguagePicker } from "../public-language";

test.use({ locale: "en-GB" });

async function preferGerman(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => ["es-ES", "de-AT", "en-GB"],
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("the first supported browser preference is automatic and a manual choice survives reload", async ({
  page,
}) => {
  await preferGerman(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.goto("/how-it-works/");
  await expect(page.locator('[data-film="introduction"]')).toHaveAttribute(
    "data-locale",
    "de",
  );
  await page.goto("/");
  let picker = await publicLanguagePicker(page);
  await expect(picker).toHaveValue("auto");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBeNull();

  await picker.selectOption("lb");
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBe("lb");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  picker = await publicLanguagePicker(page);
  await expect(picker).toHaveValue("lb");

  await picker.selectOption("auto");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(picker).toHaveValue("auto");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBeNull();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(await publicLanguagePicker(page)).toHaveValue("auto");
});

test("automatic mode removes a URL language override and preserves other URL state", async ({
  page,
}) => {
  await preferGerman(page);
  await page.goto("/?lang=lb&campaign=language-navigation#how");
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  const picker = await publicLanguagePicker(page);
  await expect(picker).toHaveValue("lb");
  await picker.selectOption("auto");
  await expect(picker).toHaveValue("auto");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  const url = new URL(page.url());
  expect(url.searchParams.has("lang")).toBe(false);
  expect(url.searchParams.get("campaign")).toBe("language-navigation");
  expect(url.hash).toBe("#how");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBeNull();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(await publicLanguagePicker(page)).toHaveValue("auto");
});

test("choosing the detected language still records an explicit choice and can return to automatic", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const picker = await publicLanguagePicker(page);
  await expect(picker).toHaveValue("auto");
  await picker.selectOption("en");
  await expect(picker).toHaveValue("en");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBe("en");
  await picker.selectOption("auto");
  await expect(picker).toHaveValue("auto");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBeNull();
});

test("narrow public headers keep one row and navigation yields to language selection", async ({
  page,
}) => {
  for (const width of [430, 320]) {
    await page.setViewportSize({ width, height: 932 });
    await page.goto("/?lang=lb");
    const header = page.locator("header.site-header");
    const toggle = header.locator(".public-menu-toggle");
    const brand = header.locator(":scope > .brand");
    const languageButton = header.locator(".language-menu summary");
    await expect(toggle).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const headerBounds = await header.boundingBox();
    const brandBounds = await brand.boundingBox();
    const toggleBounds = await toggle.boundingBox();
    expect(headerBounds).not.toBeNull();
    expect(brandBounds).not.toBeNull();
    expect(toggleBounds).not.toBeNull();
    expect(headerBounds!.height).toBeLessThanOrEqual(80);
    expect(brandBounds!.x + brandBounds!.width).toBeLessThanOrEqual(
      toggleBounds!.x,
    );
    expect(brandBounds!.y).toBeLessThan(toggleBounds!.y + toggleBounds!.height);
    expect(toggleBounds!.y).toBeLessThan(brandBounds!.y + brandBounds!.height);
    await expectNoHorizontalOverflow(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const mobileLinks = header.locator(
      ".public-mobile-navigation > a:visible",
    );
    await expect(mobileLinks).toHaveCount(9);
    expect(
      await mobileLinks.evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
      ),
    ).toEqual([
      "/how-it-works/",
      "/pricing/",
      "/assistants/",
      "/getting-started/",
      "/pdf-checks/",
      "/journal/",
      "/developers/",
      "/support/",
      "/app",
    ]);
    expect((await header.boundingBox())!.height).toBe(headerBounds!.height);
    // Touch activation on WebKit does not implicitly focus a button.
    await toggle.focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();

    await toggle.click();
    const picker = await publicLanguagePicker(page);
    await expect(picker).toHaveValue("lb");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect((await header.boundingBox())!.height).toBe(headerBounds!.height);
    const pickerBounds = await picker.boundingBox();
    expect(pickerBounds!.x).toBeGreaterThanOrEqual(0);
    expect(pickerBounds!.x + pickerBounds!.width).toBeLessThanOrEqual(width);
    await expectNoHorizontalOverflow(page);
    await picker.focus();
    await page.keyboard.press("Escape");
    await expect(languageButton).toBeFocused();
    await expect(picker).toBeHidden();
  }
});

test("the desktop language menu opens by keyboard and restores focus on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const menu = page.locator("header .language-menu");
  const summary = menu.locator("summary");
  const picker = menu.locator('select[name="language"]');
  await expect(summary).toBeVisible();
  await expect(picker).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(picker).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(picker).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(summary).toBeFocused();

  await summary.click();
  await expect(picker).toBeVisible();
  await page.locator("main h1").click();
  await expect(picker).toBeHidden();
});

test("public subpage language panels remain fully inside narrow phone viewports", async ({
  page,
}) => {
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 932 });
    for (const path of [
      "/assistants/",
      "/developers/",
      "/journal/",
      "/legal/",
      "/privacy/",
    ]) {
      await test.step(`${path} at ${width}px`, async () => {
        await page.goto(`${path}?lang=lb`);
        const header = page.locator("header.site-header");
        await expect(header).toBeVisible();
        // Compare the closed/open menu only after font metrics have settled.
        await page.evaluate(() => document.fonts.ready);
        const closedHeight = await header.evaluate(
          (element) => element.getBoundingClientRect().height,
        );
        const picker = await publicLanguagePicker(page);
        const panel = header.locator(".language-menu-panel");
        await expect
          .poll(() =>
            header.evaluate(
              (element) => element.getBoundingClientRect().height,
            ),
          )
          .toBe(closedHeight);
        for (const locale of ["lb", "de", "auto"]) {
          await picker.selectOption(locale);
          await expect(panel).toBeVisible();
          const bounds = await panel.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return { x: box.x, width: box.width };
          });
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          await expectNoHorizontalOverflow(page);
        }
      });
    }
  }
});
