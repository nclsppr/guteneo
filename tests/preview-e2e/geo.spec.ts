import { test, expect } from "@playwright/test";

test("public pages expose the entity, contact, complete answers and real fragment targets without JavaScript", async ({
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
    await expect(page.locator('footer a[href="/about/"]')).toBeVisible();
    await expect(page.locator("main h1")).toHaveText(
      "Préparez vos documents.Choisissez leur destination.",
    );
    await expect(page.locator(".public-home-control")).toContainText(
      "désactivée par défaut",
    );
    await expect(page.locator(".public-home-beta")).toContainText(
      "aucune vente n’est ouverte",
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
    await page.goto("/support/#faq");
    await expect(page.locator(".faq-questions details")).toHaveCount(8);
    await expect(
      page.locator(".faq-questions details").first().locator("summary"),
    ).toHaveText("Mon PDF original est-il modifié ?");
    await page
      .locator(".faq-questions details")
      .first()
      .locator("summary")
      .click();
    await expect(
      page.locator(".faq-questions details").first(),
    ).toHaveAttribute("open", "");
    for (const path of [
      "/pricing/",
      "/getting-started/",
      "/how-it-works/",
      "/pdf-checks/",
    ]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator(".public-site-footer")).toHaveCount(1);
      await expect(page.locator('footer a[href="/pricing/"]')).toHaveText(
        "Tarifs",
      );
    }
    await page.goto("/about/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "À propos de Guteneo",
    );
    await expect(page.locator(".legal-date")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("homepage arrival avoids lazy visible imagery and leaves the film on its dedicated page", async ({
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
  await expect(page.locator(".homepage-film")).toHaveCount(0);
  await page.goto("/how-it-works/");
  await expect(page.locator(".homepage-film-poster img")).toHaveAttribute(
    "loading",
    "lazy",
  );
});
