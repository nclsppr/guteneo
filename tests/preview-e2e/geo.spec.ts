import { test, expect } from "@playwright/test";

test("homepage exposes the entity, contact, questions and real fragment targets without JavaScript", async ({
  browser,
  baseURL,
  browserName,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const schemas = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const nodes = schemas.map((value) => JSON.parse(value));
    const organization = nodes.find((node) => node["@type"] === "Organization");
    expect(organization).toMatchObject({
      name: "Guteneo",
      url: "https://guteneo.com",
      email: "guteneo@pieper.fr",
    });
    expect(organization.logo.url).toBe(
      "https://guteneo.com/brand/guteneo-stamp.png",
    );
    expect(nodes.find((node) => node["@type"] === "Person")).toMatchObject({
      name: "Nicolas Pieper",
      sameAs: [
        "https://www.linkedin.com/in/nicolaspieper",
        "https://github.com/nclsppr",
        "https://twitter.com/NicolasPieper",
      ],
    });
    await expect(
      page.locator('a[href="mailto:guteneo@pieper.fr"]'),
    ).toBeVisible();
    await expect(page.locator('a[href="/a-propos/"]')).toBeVisible();
    expect(await page.locator("h2, h3, h4").allTextContents()).toEqual(
      expect.arrayContaining(["Mon PDF original est-il modifié ?"]),
    );
    const missing = await page.locator('a[href*="#"]').evaluateAll((links) =>
      links.flatMap((link) => {
        const url = new URL((link as HTMLAnchorElement).href);
        return url.pathname === location.pathname &&
          url.hash &&
          !document.getElementById(decodeURIComponent(url.hash.slice(1)))
          ? [url.hash]
          : [];
      }),
    );
    expect(missing).toEqual([]);
    const badAlt = await page.locator("img").evaluateAll((images) =>
      images
        .map((image) => image as HTMLImageElement)
        .filter(
          (image) =>
            image.alt && (image.alt.length < 2 || image.alt.length > 125),
        )
        .map((image) => image.alt),
    );
    expect(badAlt).toEqual([]);
    // WebKit follows macOS link tabbing: Option-Tab includes links.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(page.locator(".skip-link").first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#landing-main")).toBeFocused();
    await page.goto("/a-propos/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "À propos de Guteneo",
    );
    await expect(page.locator(".legal-date")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("arrival images load eagerly while the below-fold film poster remains lazy", async ({
  page,
}) => {
  await page.goto("/");
  const visibleLazyImages = await page
    .locator('img[loading="lazy"]')
    .evaluateAll((images) =>
      images
        .filter((image) => {
          const bounds = image.getBoundingClientRect();
          return (
            bounds.width > 0 &&
            bounds.height > 0 &&
            bounds.top < innerHeight &&
            bounds.bottom > 0
          );
        })
        .map((image) => image.getAttribute("src")),
    );
  expect(visibleLazyImages).toEqual([]);
  await expect(page.locator(".homepage-film-poster img")).toHaveAttribute(
    "loading",
    "lazy",
  );
});
