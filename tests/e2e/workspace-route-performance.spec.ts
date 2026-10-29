import { expect, test, type Page } from "@playwright/test";
import { blankTemplate } from "../../packages/templates/gallery";
import type { TemplateView } from "../../packages/contracts/src/template-workflow";

const accountChunk = /\/assets\/account-page-[^/]+\.js$/;
const accountMenu = ".sidebar-account .workspace-identity-trigger";
const accountLink = ".sidebar-account .workspace-identity-profile";

// The profile link lives in the closed account menu; each use opens it first.
async function profileLink(page: Page) {
  await page.locator(accountMenu).click();
  return page.locator(accountLink);
}

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
}) => {
  const state = await fixture(page);
  let chunkRequests = 0;
  let recoveryRequests = 0;
  let unavailable = true;
  await page.route(accountChunk, (route) => {
    chunkRequests += 1;
    if (route.request().resourceType() === "fetch") recoveryRequests += 1;
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
  await expect(
    page.getByRole("heading", { name: "My account", exact: true }),
  ).toBeVisible();
  // One explicit public-code refresh precedes the new document. Its module
  // request may reuse that response; neither path permits a reload loop.
  expect(recoveryRequests).toBe(1);
  expect(chunkRequests).toBeGreaterThanOrEqual(failures + 1);
  expect(chunkRequests).toBeLessThanOrEqual(failures + 2);
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
    await page.evaluate(() => {
      window.addEventListener(
        "guteneo:before-workspace-navigation",
        (event) => event.preventDefault(),
        { once: true },
      );
    });
    let target = await profileLink(page);
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/app\/documents$/);
    await expect(page.locator(".workspace main h1")).toHaveText(
      originalHeading!,
    );
    await expect(page.locator("#main-content")).not.toHaveAttribute(
      "inert",
      "",
    );
    expect(requested).toBe(0);
    target = await profileLink(page);
    await target.focus();
    await target.press("Enter");
    await expect.poll(() => requested).toBe(1);
    await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
    await expect(page.locator("#main-content")).toHaveAttribute(
      "aria-busy",
      "true",
    );
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
    await expect(page.locator("#main-content")).not.toHaveAttribute(
      "inert",
      "",
    );
    expect(state.writes).toEqual([]);
  } finally {
    releaseCode();
  }
});

test("template edits remain protected before and during a cold route transition", async ({
  page,
}) => {
  const state = await fixture(page);
  const envelope = blankTemplate();
  // Exercise the real metadata editor and navigation guard independently of pdfme.
  await page.route(/\/assets\/template-designer-[^/]+\.js$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export default function SyntheticDesigner() { return null; }",
    }),
  );
  const model: TemplateView = {
    id: "transition-template",
    name: envelope.name,
    ownerId: "route-user",
    state: "draft",
    visibility: "private",
    revision: 1,
    currentVersion: null,
    permissions: { use: true, edit: true, publish: true, share: true },
    canDelete: true,
    envelope,
    createdAt: "2026-10-28T00:00:00.000Z",
    updatedAt: "2026-10-28T00:00:00.000Z",
  };
  await page.route("**/api/templates/transition-template", (route) => {
    if (route.request().method() === "GET")
      state.reads.push("/api/templates/transition-template");
    else state.writes.push("/api/templates/transition-template");
    return route.fulfill({ json: model });
  });
  let requested = false;
  let releaseCode!: () => void;
  const code = new Promise<void>((resolve) => {
    releaseCode = resolve;
  });
  await page.route(accountChunk, async (route) => {
    requested = true;
    await code;
    await route.continue();
  });
  try {
    await page.goto("/#/app/studio/template/transition-template");
    const field = page.getByLabel("Template name", { exact: true });
    const save = page.getByRole("button", { name: "Save draft", exact: true });
    await expect(field).toHaveValue(model.name);
    await expect(save).toBeDisabled();
    await field.fill("Unsaved synthetic edit");
    await expect(save).toBeEnabled();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const dialog = page.waitForEvent("dialog").then(async (confirmation) => {
      expect(confirmation.message()).toContain("unsaved changes");
      await confirmation.dismiss();
    });
    await (await profileLink(page)).click();
    await dialog;
    await expect(page).toHaveURL(
      /#\/app\/studio\/template\/transition-template$/,
    );
    await expect(field).toHaveValue("Unsaved synthetic edit");
    expect(requested).toBe(false);
    await field.fill(model.name);
    await expect(save).toBeDisabled();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await (await profileLink(page)).click();
    await expect.poll(() => requested).toBe(true);
    const main = page.locator("#main-content");
    await expect(main).toHaveAttribute("inert", "");
    await expect(main).toHaveAttribute("aria-busy", "true");
    await expect(field).toHaveValue(model.name);
    const rectangle = await field.boundingBox();
    expect(rectangle).not.toBeNull();
    await page.mouse.click(
      rectangle!.x + rectangle!.width / 2,
      rectangle!.y + rectangle!.height / 2,
    );
    await page.keyboard.type("Late synthetic edit");
    await expect(field).toHaveValue(model.name);
    expect(
      await field.evaluate((element) => document.activeElement === element),
    ).toBe(false);
    expect(state.writes).toEqual([]);
    releaseCode();
    await expect(
      page.getByRole("heading", { name: "My account", exact: true }),
    ).toBeVisible();
    await expect(main).not.toHaveAttribute("inert", "");
    await expect(main).not.toHaveAttribute("aria-busy", "true");
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
    await expect(page.locator(accountMenu)).toBeVisible();
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
