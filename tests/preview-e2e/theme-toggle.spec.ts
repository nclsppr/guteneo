import { expect, test } from "@playwright/test";

for (const system of ["light", "dark"] as const) {
  test(`the public theme button works before initial application code loads with a ${system} system theme`, async ({
    page,
    context,
  }) => {
    const next = system === "dark" ? "light" : "dark";
    await page.emulateMedia({ colorScheme: system });
    await page.addInitScript(() => {
      const state = window as typeof window & { themeChanges: number };
      state.themeChanges = 0;
      window.addEventListener(
        "guteneo-theme-change",
        () => state.themeChanges++,
      );
    });
    let release!: () => void;
    const entryReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldEntries = 0;
    await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => {
      heldEntries += 1;
      await entryReady;
      await route.continue();
    });
    try {
      await page.goto("/pricing/?lang=en", { waitUntil: "commit" });
      const root = page.locator("html");
      const header = page.locator(".public-header");
      const button = page.locator("button[data-theme-toggle]");
      const darkSource = header
        .locator('source[data-theme-source="dark"]')
        .first();
      await expect(button).toHaveCount(1);
      await expect(button).toBeVisible();
      await expect.poll(() => heldEntries).toBeGreaterThan(0);
      await expect(header).not.toHaveAttribute(
        "data-render-state",
        "interactive",
      );
      await expect(root).toHaveAttribute("data-theme", system);
      await expect(root).toHaveAttribute("data-theme-preference", "system");
      await expect(darkSource).toHaveAttribute(
        "media",
        system === "dark" ? "all" : "not all",
      );
      await expect(button).toHaveAccessibleName(`Switch to ${next} mode`);
      await button.click();
      await expect(root).toHaveAttribute("data-theme", next);
      await expect(root).toHaveAttribute("data-theme-preference", next);
      await expect(darkSource).toHaveAttribute(
        "media",
        next === "dark" ? "all" : "not all",
      );
      await expect(button).toHaveAccessibleName(`Switch to ${system} mode`);
      expect(
        await page.evaluate(() => localStorage.getItem("guteneo.theme")),
      ).toBe(next);
      expect(
        (await context.cookies()).find(
          (cookie) => cookie.name === "guteneo_theme",
        )?.value,
      ).toBe(next);
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { themeChanges: number }).themeChanges,
        ),
      ).toBe(1);

      release();
      await expect(header).toHaveAttribute("data-render-state", "interactive");
      await expect(root).toHaveAttribute("data-theme", next);
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { themeChanges: number }).themeChanges,
        ),
      ).toBe(1);
      await button.focus();
      await button.press("Enter");
      await expect(root).toHaveAttribute("data-theme", system);
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { themeChanges: number }).themeChanges,
        ),
      ).toBe(2);
    } finally {
      release();
    }
  });
}

test("the public button follows the system until chosen and works with blocked storage", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage disabled", "SecurityError");
      },
    });
  });
  await page.goto("/?lang=en");
  const root = page.locator("html");
  const button = page.locator("button[data-theme-toggle]");
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(button).toHaveAccessibleName("Switch to light mode");
  await button.click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("data-theme-preference", "light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(button).toHaveAccessibleName("Switch to dark mode");
});
