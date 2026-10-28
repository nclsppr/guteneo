import { expect, test, type Page } from "@playwright/test";

const accountChunk = /\/assets\/account-page-[^/]+\.js$/;
const accountLink = '.sidebar nav a[href="#/app/account"]';

// Only synthetic browser responses are used; no account or document is written.
async function fixture(page: Page, waitForSession?: Promise<void>) {
  const reads: string[] = [];
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") reads.push(path);
    else writes.push(path);
    if (path === "/api/session") {
      await waitForSession;
      return route.fulfill({
        json: {
          organization: { id: "route-workshop", name: "Synthetic workshop" },
          user: {
            id: "route-user",
            name: "Synthetic user",
            role: "admin",
            preferredLocale: "en",
            preferredDashboardAppearance: "classic",
          },
          csrfToken: "synthetic-route-only",
          simulation: true,
        },
      });
    }
    return route.fulfill({
      json: {
        items: [],
        connections: [],
        canManage: true,
        nextCursor: null,
        registration: { enabled: true },
      },
    });
  });
  return { reads, writes };
}

test("initial workshop route code loads alongside authority without mounting private content early", async ({
  page,
}) => {
  let releaseSession!: () => void;
  const session = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  const state = await fixture(page, session);
  let requested = false;
  await page.route(accountChunk, (route) => {
    requested = true;
    return route.continue();
  });
  try {
    await page.goto("/#/app/account");
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator(".workspace")).toHaveCount(0);
    expect(state.reads).toEqual(["/api/session"]);
    expect(state.writes).toEqual([]);
    releaseSession();
    await expect(
      page.getByRole("heading", { name: "My account", exact: true }),
    ).toBeVisible();
    expect(state.reads.filter((path) => path === "/api/session")).toHaveLength(
      1,
    );
    expect(state.writes).toEqual([]);
  } finally {
    releaseSession();
  }
});

test("a failed requested route retains navigation and offers an explicit page reload", async ({
  page,
}, info) => {
  const state = await fixture(page);
  let chunkRequests = 0;
  let unavailable = true;
  await page.route(accountChunk, (route) => {
    chunkRequests += 1;
    return unavailable ? route.abort("failed") : route.continue();
  });
  await page.goto("/#/app/account");
  await expect(page.getByRole("alert")).toContainText(
    "This page could not be loaded.",
  );
  await expect(page.locator(".sidebar")).toBeVisible();
  expect(state.writes).toEqual([]);
  const failures = chunkRequests;
  const previousDocument = await page.evaluate(() => performance.timeOrigin);
  unavailable = false;
  await page
    .getByRole("button", { name: "Reload the page", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => performance.timeOrigin))
    .not.toBe(previousDocument);
  if (info.project.name === "iphone-webkit") {
    // WebKit retains the simulated aborted module-preload failure across reload.
    // The action reloads once; it never loops or substitutes private content.
    await expect(page.getByRole("alert")).toContainText(
      "This page could not be loaded.",
    );
    await expect(page.locator(".sidebar")).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { name: "My account", exact: true }),
    ).toBeVisible();
    expect(chunkRequests).toBe(failures + 1);
  }
  expect(state.writes).toEqual([]);
});

test("cold navigation keeps the current useful content until code is ready and still honors the existing veto", async ({
  page,
}) => {
  const state = await fixture(page);
  let requested = 0;
  let releaseCode!: () => void;
  const code = new Promise<void>((resolve) => {
    releaseCode = resolve;
  });
  await page.route(accountChunk, async (route) => {
    requested += 1;
    await code;
    await route.continue();
  });
  try {
    await page.goto("/#/app/documents");
    await expect(page.locator(".workspace main h1")).toBeVisible();
    const originalHeading = await page
      .locator(".workspace main h1")
      .textContent();
    const target = page.locator(".sidebar-account .workspace-identity-profile");
    await page.evaluate(() => {
      window.addEventListener(
        "guteneo:before-workspace-navigation",
        (event) => event.preventDefault(),
        { once: true },
      );
    });
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/app\/documents$/);
    await expect(page.locator(".workspace main h1")).toHaveText(
      originalHeading!,
    );
    expect(requested).toBe(0);
    await target.focus();
    await target.press("Enter");
    await expect.poll(() => requested).toBe(1);
    await expect(page.locator(".workspace main h1")).toHaveText(
      originalHeading!,
    );
    expect(state.reads.some((path) => path.startsWith("/api/account/"))).toBe(
      false,
    );
    releaseCode();
    await expect(
      page.getByRole("heading", { name: "My account", exact: true }),
    ).toBeVisible();
    expect(state.writes).toEqual([]);
  } finally {
    releaseCode();
  }
});

test("an obsolete route import never replaces the destination selected afterward", async ({
  page,
}) => {
  const state = await fixture(page);
  let releaseCode!: () => void;
  let requested = false;
  const code = new Promise<void>((resolve) => {
    releaseCode = resolve;
  });
  await page.route(accountChunk, async (route) => {
    requested = true;
    await code;
    await route.continue();
  });
  try {
    await page.goto("/#/app/account");
    await expect.poll(() => requested).toBe(true);
    const menu = page.locator(".workspace-navigation summary");
    if (await menu.isVisible()) await menu.click();
    await expect(page.locator(accountLink)).toBeVisible();
    await page.locator('.sidebar nav a[href="#/app/documents"]').click();
    await expect(page.locator(".workspace main h1")).toBeVisible();
    const heading = await page.locator(".workspace main h1").textContent();
    releaseCode();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page).toHaveURL(/#\/app\/documents$/);
    await expect(page.locator(".workspace main h1")).toHaveText(heading!);
    expect(state.reads.some((path) => path.startsWith("/api/account/"))).toBe(
      false,
    );
    expect(state.writes).toEqual([]);
  } finally {
    releaseCode();
  }
});
