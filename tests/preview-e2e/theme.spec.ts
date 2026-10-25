import { expect, test } from "@playwright/test";

test("system appearance follows the browser and an explicit choice survives navigation", async ({
  page,
}) => {
  const businessRequests: string[] = [];
  page.on("request", (request) => {
    if (/^\/(api|auth|oauth|mcp)(\/|$)/.test(new URL(request.url()).pathname))
      businessRequests.push(request.url());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?lang=en#/app/account");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "system",
  );
  const control = page.locator(
    ".account-display-preferences .theme-control select",
  );
  await expect(control).toHaveValue("system");
  const route = new URL(page.url()).hash;
  await control.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(new URL(page.url()).hash).toBe(route);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(control).toHaveValue("light");
  await control.selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await control.selectOption("dark");
  await page.goto("/journal/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#2450db",
  );
  expect(businessRequests).toEqual([]);
});

test("the head applies a stored choice before the application module runs", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("guteneo.theme", "dark"));
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.goto("/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "dark",
  );
  expect(
    await page
      .locator("html")
      .evaluate((root) => getComputedStyle(root).colorScheme),
  ).toBe("dark");
});

test("the first paint can use the host-only theme cookie when local storage is blocked", async ({
  page,
  context,
  baseURL,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await context.addCookies([
    { name: "guteneo_theme", value: "dark", url: baseURL! },
  ]);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage disabled", "SecurityError");
      },
    });
  });
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.goto("/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("an explicit theme writes only a bounded host-only presentation cookie", async ({
  page,
  context,
}) => {
  await page.goto("/?lang=en#/app/account");
  await page
    .locator(".account-display-preferences .theme-control select")
    .selectOption("dark");
  const cookie = (await context.cookies()).find(
    (entry) => entry.name === "guteneo_theme",
  )!;
  const address = new URL(page.url());
  expect(cookie).toMatchObject({
    value: "dark",
    domain: address.hostname,
    path: "/",
    sameSite: "Lax",
    secure: address.protocol === "https:",
    httpOnly: false,
  });
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 3600 * 24 * 364);
});

test("a theme choice still works while browser storage is blocked", async ({
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
  await page.goto("/?lang=en#/app/account");
  const control = page.locator(
    ".account-display-preferences .theme-control select",
  );
  await control.selectOption("dark");
  await expect(control).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await control.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("an open page follows an explicit choice made in another tab", async ({
  page,
  context,
}) => {
  await page.goto("/?lang=en#/app/account");
  const second = await context.newPage();
  await second.goto("/?lang=en#/app/account");
  await second
    .locator(".account-display-preferences .theme-control select")
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.locator(".account-display-preferences .theme-control select"),
  ).toHaveValue("dark");
  await second.close();
});

test("theme changes keep the original PDF and email on paper before consent", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("guteneo.theme", "dark"));
  await page.goto(
    "/?lang=en&appearance=v2#/app/dispatch/preview_atelier_dispatch_1",
  );
  const canvas = page.locator(".pdf-canvas-wrap canvas").first();
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((element) => ({
      scheme: getComputedStyle(element).colorScheme,
      filter: getComputedStyle(element).filter,
      background: getComputedStyle(element).backgroundColor,
    })),
  ).toEqual({
    scheme: "light",
    filter: "none",
    background: "rgb(255, 255, 255)",
  });
  await expect(
    page
      .frameLocator(".email-preview")
      .getByText("Hello Camille,", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".approval-panel input[type=checkbox]").first(),
  ).not.toBeChecked();
  await expect(page.locator(".dashboard-artwork")).toHaveCount(0);
});
