import { expect, test, type Page } from "@playwright/test";
import { fixtureBase, fixtureResponse } from "../fixtures/belvedere";

async function canonicalApplication(page: Page, initialView?: "finance") {
  let authorised = true;
  const reads: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("request", (request) => reads.push(new URL(request.url()).pathname));
  await page.route("**/belvedere", async (route) => {
    const response = await page.request.get(fixtureBase);
    const html = (await response.text())
      .replace(
        `name="guteneo-belvedere" content="${fixtureBase}"`,
        'name="guteneo-belvedere" content="/belvedere"',
      )
      .replace(
        "<head>",
        '<head><meta name="guteneo-account-locale" content="fr">',
      );
    await route.fulfill({ response, body: html });
  });
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        organization: {
          id: "platform-workspace",
          name: "Authorized workspace",
        },
        user: {
          id: "watcher",
          name: "Camille Watcher",
          email: "watcher@example.test",
          role: "viewer",
          preferredLocale: "fr",
        },
        csrfToken: "canonical-session-csrf",
        canAccessBelvedere: authorised,
        simulation: false,
      },
    }),
  );
  await page.route("**/belvedere/api/**", (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(
      "/belvedere/api/",
      `${fixtureBase}/api/`,
    );
    const data = fixtureResponse(url);
    return route.fulfill({ status: data ? 200 : 404, json: data ?? {} });
  });
  await page.goto(`/belvedere${initialView ? `#${initialView}` : ""}`);
  await expect(
    page.getByRole("heading", {
      name: initialView ? "Finances" : "Le monde de guteneo.",
      exact: true,
    }),
  ).toBeVisible();
  return {
    reads,
    failures,
    revoke: () => {
      authorised = false;
    },
  };
}

async function openNavigation(page: Page) {
  const nav = page.getByRole("navigation", { name: "Navigation Belvédère" });
  if (!(await nav.isVisible()))
    await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  return nav;
}

test("canonical entry keeps every view, the globe and the shared application/account controls", async ({
  page,
}, info) => {
  const state = await canonicalApplication(page);
  await openNavigation(page);
  const switcher = page.locator(".application-switcher > button");
  await switcher.click();
  const applications = page.getByRole("navigation", {
    name: "Applications",
    exact: true,
  });
  await expect(
    applications.getByRole("link", { name: "Studio", exact: true }),
  ).toHaveAttribute("href", "/#/app/studio/templates");
  await expect(
    applications.getByRole("link", { name: "Correspondance", exact: true }),
  ).toHaveAttribute("href", "/#/app");
  await expect(
    applications.getByRole("link", { name: "Mes documents", exact: true }),
  ).toHaveAttribute("href", "/#/app/my-documents");
  await expect(
    applications.getByRole("link", { name: "Belvédère", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await switcher.press("Escape");
  await expect(switcher).toBeFocused();

  const identity = page.locator(".workspace-identity-trigger");
  await expect(identity).toContainText("Camille Watcher");
  await expect(identity.locator(".workspace-identity-avatar")).toBeVisible();
  await identity.click();
  const menu = page.locator(".workspace-identity-menu");
  await expect(menu.locator(".workspace-identity-profile")).toHaveAttribute(
    "href",
    "/#/app/account",
  );
  const switchHref = await menu
    .locator(".workspace-switch-account")
    .getAttribute("href");
  expect(new URL(switchHref!, page.url()).searchParams.get("returnTo")).toBe(
    "/belvedere",
  );
  await menu.locator(".theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await identity.press("Escape");
  await expect(identity).toBeFocused();
  await page.screenshot({
    path: info.outputPath("canonical-dark.png"),
    fullPage: true,
  });

  for (const name of [
    "Espaces de travail",
    "Envois",
    "Membres",
    "Connexions",
    "Finances",
    "Infrastructure",
    "Synthèse",
  ]) {
    const nav = await openNavigation(page);
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page.locator("#belvedere-main h1")).toHaveText(name);
    await expect(page.locator("#belvedere-main .bv-loading")).toHaveCount(0);
  }
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toBeVisible();
  expect(state.reads.some((path) => path.startsWith("/auth/"))).toBe(false);
  expect(state.reads).not.toContain("/api/documents");
  expect(state.failures).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("returning after capability revocation removes previously displayed platform data", async ({
  page,
}) => {
  const state = await canonicalApplication(page);
  state.revoke();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText(
    "Votre accès à Belvédère a expiré ou n’est plus autorisé.",
  );
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Vérifier mon accès" }),
  ).toHaveAttribute("href", "/belvedere");
  expect(state.failures).toEqual([]);
});

test("short mobile menus stay on screen and logout uses the current canonical CSRF", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await canonicalApplication(page);
  await openNavigation(page);
  await page.locator(".workspace-identity-trigger").click();
  const menu = page.locator(".workspace-identity-menu");
  const bounds = await menu.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(600);
  await page.route("**/api/logout", (route) =>
    route.fulfill({ json: { signedOut: true } }),
  );
  const [request] = await Promise.all([
    page.waitForRequest("**/api/logout"),
    menu.locator(".workspace-sign-out").click(),
  ]);
  expect(request.method()).toBe("POST");
  expect(request.headers()["x-csrf-token"]).toBe("canonical-session-csrf");
  await expect(page).toHaveURL("http://127.0.0.1:8794/");
});

test("direct finance entry defers globe resources until the overview is requested", async ({
  page,
}) => {
  const state = await canonicalApplication(page, "finance");
  expect(state.reads.some((path) => /belvedere-globe.*\.js$/.test(path))).toBe(
    false,
  );
  expect(
    state.reads.some((path) =>
      /pdf\.worker|pdf-viewer|template-designer/.test(path),
    ),
  ).toBe(false);
  const nav = await openNavigation(page);
  await nav.getByRole("link", { name: "Synthèse", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toBeVisible();
  expect(state.reads.some((path) => /belvedere-globe.*\.js$/.test(path))).toBe(
    true,
  );
  expect(state.failures).toEqual([]);
});
