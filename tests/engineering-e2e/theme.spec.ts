import { expect, test } from "@playwright/test";

test("engineering shares explicit and system appearance choices without replacing Nimbus", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const control = page.getByRole("combobox", {
    name: "Appearance",
    exact: true,
  });
  await expect(control).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await control.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("guteneo.theme"))).toBe(
    "light",
  );
  await page.reload();
  await expect(control).toHaveValue("light");
  await page.goto("/features/");
  await expect(control).toHaveValue("light");
  const other = await context.newPage();
  await other.goto("/");
  await other
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("dark");
  await expect(control).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await control.selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#2450db",
  );
  await other.close();
});

test("engineering preserves earlier ui-mode choices once and works when storage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("ui-mode", "light"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "Appearance", exact: true }),
  ).toHaveValue("light");
  expect(
    await page.evaluate(() => ({
      current: localStorage.getItem("guteneo.theme"),
      legacy: localStorage.getItem("ui-mode"),
    })),
  ).toEqual({ current: "light", legacy: null });
  await page.evaluate(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    }),
  );
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("engineering static reading uses the system dark palette without scripts", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto(baseURL!);
  expect(
    await page
      .locator("html")
      .evaluate((root) => getComputedStyle(root).colorScheme),
  ).toBe("dark");
  expect(
    await page
      .locator(".engineering-wordmark")
      .first()
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe("rgb(246, 245, 239)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await context.close();
});
