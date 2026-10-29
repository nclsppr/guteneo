import { expect, test, type Page } from "@playwright/test";

// Synthetic responses only: no account, document or workspace is written.
async function fixture(page: Page) {
  const workspaces = [
    { id: "first", name: "Atelier de démonstration" },
    { id: "second", name: "Second atelier" },
  ];
  let active = "first";
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
    else if (path === "/account/workspaces")
      body = {
        items: workspaces.map((item) => ({
          ...item,
          current: item.id === active,
        })),
      };
    else if (path === "/account/workspace" && request.method() === "POST") {
      active = request.postDataJSON().organizationId;
      body = session();
    } else if (path === "/capabilities")
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
  return { reads, writes };
}

const spaces = (page: Page) =>
  page.getByRole("navigation", { name: "Espaces", exact: true });

test("the space switcher reads workspaces only when opened and moves between spaces", async ({
  page,
  isMobile,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/documents");
  const trigger = page.locator(".sidebar .space-switcher-trigger");
  await expect(trigger).toHaveAccessibleName(
    "Changer d’espace : Atelier, Atelier de démonstration",
  );
  expect(state.reads).not.toContain("/account/workspaces");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = spaces(page);
  await expect(
    panel.getByRole("link", { name: "Atelier", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    panel.getByRole("link", { name: "Studio", exact: true }),
  ).toHaveAttribute("href", "#/app/studio/templates");
  await expect(
    panel.getByRole("link", { name: "Mes documents", exact: true }),
  ).toHaveAttribute("href", "#/app/my-documents");
  await expect(
    panel.getByRole("button", { name: "Second atelier", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "Créer ou rejoindre un atelier" }),
  ).toHaveAttribute("href", "#/app/services");
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await panel.getByRole("link", { name: "Studio", exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/studio\/templates$/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toContainText("Studio");
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
  await expect(page.locator(".sidebar .space-switcher-trigger")).toContainText(
    "Studio",
  );
  await page.goto("/#/app/generation/job_fixture");
  await expect(page).toHaveURL(/#\/app\/studio\/generation\/job_fixture$/);
  await expect(
    page.locator('.workspace-navigation a[aria-current="page"]'),
  ).toHaveAttribute("href", "#/app/studio/generations");
  await page.goto("/#/app/distribution/plan_fixture");
  await expect(page).toHaveURL(/#\/app\/distribution\/plan_fixture$/);
  await expect(page.locator(".sidebar .space-switcher-trigger")).toContainText(
    "Atelier",
  );
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
  const trigger = page.locator(".sidebar .space-switcher-trigger");
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
  await expect(trigger).toContainText("Studio");
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
