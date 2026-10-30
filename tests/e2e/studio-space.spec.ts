import { expect, test, type Page } from "@playwright/test";

// Synthetic responses only: no account, document or workspace is written.
async function fixture(
  page: Page,
  options: {
    /** Listed but no longer a membership: the server refuses to enter it. */
    revoked?: boolean;
    /** Holds each workspace list until the test releases it. */
    holdLists?: boolean;
  } = {},
) {
  const workspaces = [
    { id: "first", name: "Atelier de démonstration" },
    { id: "second", name: "Second atelier" },
    ...(options.revoked ? [{ id: "third", name: "Atelier retiré" }] : []),
  ];
  let active = "first";
  let revokedRead = false;
  const held: (() => void)[] = [];
  const reads: string[] = [];
  const writes: { path: string; body: unknown }[] = [];
  const session = () => {
    const workspace = workspaces.find((item) => item.id === active)!;
    return {
      organization: workspace,
      user: {
        id: "studio-user",
        name: "Camille Exemple",
        email: "camille@example.invalid",
        role: "admin",
        preferredLocale: "fr",
      },
      csrfToken: `csrf-${active}`,
      simulation: true,
    };
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
    if (request.method() === "GET") reads.push(path);
    else writes.push({ path, body: request.postDataJSON() });
    let body: unknown = { items: [], nextCursor: null };
    if (path === "/session") body = session();
    else if (path === "/account/workspaces") {
      // The list as it stands when the request arrives, answered later if held.
      const items = workspaces
        .filter((item) => item.id !== "third" || !revokedRead)
        .map((item) => ({ ...item, current: item.id === active }));
      if (options.revoked)
        revokedRead = items.some((item) => item.id === "third");
      if (options.holdLists) await new Promise<void>((go) => held.push(go));
      body = { items };
    } else if (path === "/account/workspace" && request.method() === "POST") {
      const { organizationId } = request.postDataJSON();
      if (organizationId === "third")
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "MEMBERSHIP_REQUIRED",
              message: "You are not a member of this workspace.",
            },
          },
        });
      active = organizationId;
      body = session();
    } else if (path === "/documents")
      body = {
        items: [
          {
            id: `document_${active}`,
            name: `Courrier ${active}.pdf`,
            sha256: "0".repeat(64),
            size: 1024,
            pages: 1,
            status: "verified",
            source: "upload",
            created_at: "2026-10-29T08:00:00.000Z",
          },
        ],
        nextCursor: null,
      };
    else if (path === "/capabilities")
      body = { scanner: "disabled_in_local_simulation" };
    else if (path === "/overview")
      body = {
        documents: 0,
        dispatches: {
          total: 0,
          approval: 0,
          in_progress: 0,
          attention: 0,
          done: 0,
        },
      };
    else if (path === "/dataset-ai-policy")
      body = {
        enabled: false,
        transferApproved: false,
        configured: false,
        dailyLimit: 0,
        usedToday: 0,
      };
    await route.fulfill({ json: body });
  });
  return {
    reads,
    writes,
    release: () => held.splice(0).forEach((go) => go()),
    heldCount: () => held.length,
  };
}

const spaces = (page: Page) =>
  page.getByRole("navigation", { name: "Espaces de travail", exact: true });
const applications = (page: Page) =>
  page.getByRole("navigation", { name: "Applications", exact: true });
const applicationTrigger = (page: Page) =>
  page.locator(".sidebar .application-switcher .space-switcher-trigger");
const workspaceTrigger = (page: Page) =>
  page.locator(".sidebar .workspace-switcher .space-switcher-trigger");

test("the application and workspace switchers stay separate and read workspaces only when opened", async ({
  page,
  isMobile,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/documents");
  const application = applicationTrigger(page);
  const workspace = workspaceTrigger(page);
  await expect(application).toHaveAccessibleName(
    "Application : Correspondance",
  );
  await expect(workspace).toHaveAccessibleName(
    "Espace de travail : Atelier de démonstration",
  );
  expect(state.reads).not.toContain("/account/workspaces");
  await application.focus();
  await page.keyboard.press("Enter");
  await expect(application).toHaveAttribute("aria-expanded", "true");
  const apps = applications(page);
  await expect(
    apps.getByRole("link", { name: "Correspondance", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    apps.getByRole("link", { name: "Studio", exact: true }),
  ).toHaveAttribute("href", "#/app/studio/templates");
  await expect(
    apps.getByRole("link", { name: "Mes documents", exact: true }),
  ).toHaveAttribute("href", "#/app/my-documents");
  // Applications never list workspaces, and opening them reads none.
  await expect(apps.getByRole("button")).toHaveCount(0);
  expect(state.reads).not.toContain("/account/workspaces");
  await page.keyboard.press("Escape");
  await expect(application).toHaveAttribute("aria-expanded", "false");
  await expect(application).toBeFocused();
  await workspace.click();
  const panel = spaces(page);
  await expect(
    panel.getByRole("button", { name: "Second atelier", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("link", {
      name: "Créer ou rejoindre un espace de travail",
    }),
  ).toHaveAttribute("href", "#/app/services");
  await page.keyboard.press("Escape");
  await expect(workspace).toBeFocused();
  await application.click();
  await apps.getByRole("link", { name: "Studio", exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/studio\/templates$/);
  await expect(application).toHaveAttribute("aria-expanded", "false");
  await expect(application).toContainText("Studio");
  await expect(workspace).toContainText("Atelier de démonstration");
  const studio = page.getByRole("navigation", {
    name: "Navigation du Studio",
    exact: true,
  });
  if (isMobile) await page.locator(".workspace-navigation summary").click();
  await expect(
    studio.getByRole("link", { name: "Modèles", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    studio.getByRole("link", { name: "Données", exact: true }),
  ).toHaveAttribute("href", "#/app/studio/datasets");
  await expect(page.locator(".workspace-create")).toHaveCount(0);
  expect(
    state.reads.filter((path) => path === "/account/workspaces"),
  ).toHaveLength(1);
  expect(state.writes).toEqual([]);
});

test("earlier Studio links keep their query and prepared batches stay with dispatches", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/templates?new=blank");
  await expect(page).toHaveURL(/#\/app\/studio\/templates\?new=blank$/);
  await expect(applicationTrigger(page)).toContainText("Studio");
  await page.goto("/#/app/generation/job_fixture");
  await expect(page).toHaveURL(/#\/app\/studio\/generation\/job_fixture$/);
  await expect(
    page.locator('.workspace-navigation a[aria-current="page"]'),
  ).toHaveAttribute("href", "#/app/studio/generations");
  await page.goto("/#/app/distribution/plan_fixture");
  await expect(page).toHaveURL(/#\/app\/distribution\/plan_fixture$/);
  await expect(applicationTrigger(page)).toContainText("Correspondance");
  await expect(
    page.locator('.workspace-navigation a[aria-current="page"]'),
  ).toHaveAttribute("href", "#/app/dispatches");
  expect(state.writes).toEqual([]);
});

test("switching workspace honours a refusal and lands at the root of the current space", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/studio/datasets");
  const trigger = workspaceTrigger(page);
  await expect(trigger).toContainText("Atelier de démonstration");
  // A screen with unsaved work refuses through the existing navigation veto.
  await page.evaluate(() => {
    window.addEventListener(
      "guteneo:before-workspace-navigation",
      (event) => event.preventDefault(),
      { once: true },
    );
  });
  await trigger.click();
  await spaces(page)
    .getByRole("button", { name: "Second atelier", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/studio\/datasets$/);
  expect(state.writes).toEqual([]);
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await spaces(page)
    .getByRole("button", { name: "Second atelier", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/studio\/templates$/);
  await expect(trigger).toContainText("Second atelier");
  await expect(applicationTrigger(page)).toContainText("Studio");
  expect(state.writes).toEqual([
    { path: "/account/workspace", body: { organizationId: "second" } },
  ]);
});

test("every workshop entry of an administrator stays in view at 1280 by 720", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Desktop sidebar geometry; phones use the collapsed navigation.",
  );
  await fixture(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const route of ["", "/documents", "/dispatches", "/admin"]) {
    await page.goto(`/#/app${route}`);
    await expect(page.locator("#main-content h1")).toBeVisible();
    const layout = await page
      .locator(".workspace-navigation")
      .evaluate((element) => ({
        scrolls: element.scrollHeight > element.clientHeight,
        bottom: element.getBoundingClientRect().bottom,
        links: [...element.querySelectorAll("nav a")].map(
          (link) => link.getBoundingClientRect().bottom,
        ),
      }));
    expect(layout.links).toHaveLength(12);
    expect(layout.scrolls, route || "/app").toBe(false);
    for (const bottom of layout.links)
      expect(bottom).toBeLessThanOrEqual(layout.bottom);
  }
});

test("A to B to A always offers the other workspace and shows its own documents", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/documents");
  const trigger = workspaceTrigger(page);
  const main = page.locator("#main-content");
  await expect(main.getByText("Courrier first.pdf")).toBeVisible();
  await trigger.click();
  await spaces(page)
    .getByRole("button", { name: "Second atelier", exact: true })
    .click();
  await expect(trigger).toContainText("Second atelier");
  await page.goto("/#/app/documents");
  await expect(main.getByText("Courrier second.pdf")).toBeVisible();
  await expect(main.getByText("Courrier first.pdf")).toHaveCount(0);
  // The list read for the first workspace marked it current; it is not reused.
  await trigger.click();
  const panel = spaces(page);
  await expect(
    panel.getByRole("button", { name: "Second atelier", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Atelier de démonstration", exact: true })
    .click();
  await expect(trigger).toContainText("Atelier de démonstration");
  await page.goto("/#/app/documents");
  await expect(main.getByText("Courrier first.pdf")).toBeVisible();
  await expect(main.getByText("Courrier second.pdf")).toHaveCount(0);
  expect(state.writes).toEqual([
    { path: "/account/workspace", body: { organizationId: "second" } },
    { path: "/account/workspace", body: { organizationId: "first" } },
  ]);
  expect(
    state.reads.filter((path) => path === "/account/workspaces"),
  ).toHaveLength(2);
});

test("a withdrawn membership is refused, keeps the current workspace and leaves the list", async ({
  page,
}) => {
  const state = await fixture(page, { revoked: true });
  await page.goto("/#/app/documents");
  const trigger = workspaceTrigger(page);
  await trigger.click();
  await spaces(page)
    .getByRole("button", { name: "Atelier retiré", exact: true })
    .click();
  await expect(
    spaces(page).getByText("You are not a member of this workspace."),
  ).toBeVisible();
  await expect(trigger).toContainText("Atelier de démonstration");
  await expect(page).toHaveURL(/#\/app\/documents$/);
  await page.keyboard.press("Escape");
  await trigger.click();
  await expect(
    spaces(page).getByRole("button", { name: "Second atelier", exact: true }),
  ).toBeVisible();
  await expect(
    spaces(page).getByRole("button", { name: "Atelier retiré", exact: true }),
  ).toHaveCount(0);
  expect(
    state.reads.filter((path) => path === "/account/workspaces"),
  ).toHaveLength(2);
});

test("a late workspace list for the previous workspace is never shown", async ({
  page,
}) => {
  const state = await fixture(page, { holdLists: true });
  await page.goto("/#/app/documents");
  const trigger = workspaceTrigger(page);
  await trigger.click();
  await expect.poll(() => state.heldCount()).toBe(1);
  state.release();
  await spaces(page)
    .getByRole("button", { name: "Second atelier", exact: true })
    .click();
  await expect(trigger).toContainText("Second atelier");
  // The read for the second workspace waits; nothing from the first appears.
  await trigger.click();
  await expect.poll(() => state.heldCount()).toBe(1);
  await expect(
    spaces(page).getByRole("button", { name: "Atelier de démonstration" }),
  ).toHaveCount(0);
  await expect(
    spaces(page).getByRole("button", { name: "Second atelier" }),
  ).toHaveCount(0);
  state.release();
  await expect(
    spaces(page).getByRole("button", {
      name: "Atelier de démonstration",
      exact: true,
    }),
  ).toBeVisible();
});

test("menus opened on a page stay closed when the person returns to it", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/#/app/documents");
  const workspace = workspaceTrigger(page);
  const account = page.locator(".workspace-identity-trigger");
  await workspace.click();
  await expect(workspace).toHaveAttribute("aria-expanded", "true");
  await page.goto("/#/app");
  await page.goto("/#/app/documents");
  await expect(workspace).toHaveAttribute("aria-expanded", "false");
  await account.click();
  await expect(account).toHaveAttribute("aria-expanded", "true");
  await page.goto("/#/app");
  await page.goto("/#/app/documents");
  await expect(account).toHaveAttribute("aria-expanded", "false");
});
