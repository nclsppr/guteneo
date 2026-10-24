import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { E2E_ORIGIN, E2E_PAGES } from "../../apps/status/production-e2e";

test.beforeEach(async ({ browser }) => {
  // This is also the side-effect boundary: no auth redirect, API mutation,
  // third-party analytics, hosted renderer, arbitrary destination or download.
  await browser.route("**/*", async (route) => {
    const url = new URL(route.request.url);
    const publicPage = E2E_PAGES.some((page) =>
      `${url.pathname}${url.search}` === page.path);
    const asset = !url.search && /\.(?:js|css|woff2?|webp|png|svg|ico|jpe?g|mp4|webm)$/i.test(url.pathname) &&
      !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/");
    if (route.request.method === "GET" && url.origin === E2E_ORIGIN && (publicPage || asset))
      await route.continue();
    else await route.abort();
  });
});

for (const page of E2E_PAGES) {
  test(page.id, async ({ app, browser }) => {
    await app.open(page.path);
    await expect(browser.locator("main")).toBeVisible();
    await expect(browser.locator("h1")).toBeVisible();
    const valid = await browser.evaluate((locale) => {
      const main = document.querySelector("main"), heading = document.querySelector("h1");
      return location.origin === "https://guteneo.com" && document.documentElement.lang === locale &&
        !!main && main.textContent!.trim().length > 100 && !!heading?.textContent?.trim() &&
        document.documentElement.scrollWidth <= window.innerWidth + 1 &&
        document.querySelectorAll('input[type="password"]').length === 0;
    }, page.locale);
    expect(valid).toBe(true);
  });
}
