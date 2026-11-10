import { expect, test, type Page } from "@playwright/test";
import type { Session } from "../../apps/web/src/api";
import { workspacePermissions } from "../../packages/contracts/src/roles";

async function installWorkspaceFixture(page: Page) {
  // Every request, including the workspace switch, is a synthetic response.
  await page.addInitScript(() =>
    localStorage.setItem("guteneo.theme", "light"),
  );
  const workspaces = [
    { id: "first-workspace", name: "Atelier de contrôle des identités" },
    { id: "second-workspace", name: "Deuxième atelier" },
  ];
  const session: Session = {
    organization: workspaces[0],
    user: {
      id: "layering-user",
      name: "Camille Nom partagé",
      email: "camille.identite@example.invalid",
      role: "member",
      preferredLocale: "fr",
    },
    permissions: workspacePermissions("member"),
    csrfToken: "synthetic-layering-csrf",
    simulation: false,
    verifiedAccount: true,
  };
  const writes: { path: string; body: unknown }[] = [];
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let body: unknown;
    if (method === "GET" && path === "/api/session") body = session;
    else if (method === "GET" && path === "/api/account/workspaces")
      body = { items: workspaces };
    else if (method === "GET" && path === "/api/account/contacts")
      body = { items: [], hasMore: false };
    else if (method === "POST" && path === "/api/account/workspace") {
      const payload = request.postDataJSON();
      writes.push({ path, body: payload });
      expect(payload).toEqual({ organizationId: "second-workspace" });
      session.organization = workspaces[1];
      body = session;
    } else if (method === "GET" && path === "/api/capabilities")
      body = { scanner: "ready", simulation: false };
    else if (method === "GET" && path === "/api/attention")
      body = {
        items: [],
        nextCursor: null,
        observedAt: "2026-11-10T00:00:00.000Z",
      };
    else if (method === "GET" && path === "/api/overview")
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
    else if (
      method === "GET" &&
      [
        "/api/documents",
        "/api/dispatches",
        "/api/connections",
        "/api/templates",
      ].includes(path)
    )
      body = { items: [], nextCursor: null };
    else {
      unexpected.push(`${method} ${path}`);
      return route.fulfill({
        status: 404,
        json: { error: "Unexpected fixture request" },
      });
    }
    await route.fulfill({ json: body });
  });
  return { session, writes, unexpected };
}

test("workspace and application choices remain clickable beside the closed account control", async ({
  page,
}, info) => {
  const { session, writes, unexpected } = await installWorkspaceFixture(page);
  let releaseOverview: () => void = () => {};
  const heldOverview = new Promise<void>((resolve) => {
    releaseOverview = resolve;
  });
  let overviewRequested = false;
  await page.route("**/assets/overview-page-*.js", async (route) => {
    overviewRequested = true;
    await heldOverview;
    await route.continue();
  });
  try {
    await page.goto("/#/app/documents");
    const workspace = page.locator(".sidebar .workspace-switcher > button");
    const identity = page.locator(".sidebar .workspace-identity-trigger");
    await expect(identity).toContainText(session.user.name);
    await workspace.click();
    const choices = page.getByRole("navigation", {
      name: "Espaces de travail",
      exact: true,
    });
    const second = choices.getByRole("button", {
      name: "Deuxième atelier",
      exact: true,
    });
    await expect(second).toBeVisible();
    await page.screenshot({ path: info.outputPath("workspace-choice.png") });
    // An actual pointer click must reach this choice, even where it overlaps
    // the account row in the mobile header.
    await second.click({ timeout: 5_000 });
    await expect(workspace).toContainText("Deuxième atelier");
    await expect(choices).toBeHidden();
    await expect.poll(() => overviewRequested).toBe(true);
    await expect(page).toHaveURL(/#\/app$/);

    const application = page.locator(".sidebar .application-switcher > button");
    await application.click();
    const applications = page.getByRole("navigation", {
      name: "Applications",
      exact: true,
    });
    await expect(applications).toBeVisible();
    // The new workspace is already active, but the older Overview transition
    // still has its real code held. Its commit cannot dismiss this newer choice.
    releaseOverview();
    await expect(page.locator("main h1")).toHaveText("Vue d’ensemble");
    await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
    await expect(applications).toBeVisible();
    await expect(application).toHaveAttribute("aria-expanded", "true");
    await applications
      .getByRole("link", { name: "Studio", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/app\/studio\/templates$/);
    await expect(application).toContainText("Studio");
    await expect(workspace).toContainText("Deuxième atelier");
    await expect(page.locator("main")).toBeFocused();

    await identity.click();
    const account = page.locator(".workspace-identity-menu");
    await expect(account).toBeVisible();
    await account.locator(".theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.keyboard.press("Escape");
    await expect(account).toBeHidden();
    await expect(identity).toBeFocused();
    expect(writes).toEqual([
      {
        path: "/api/account/workspace",
        body: { organizationId: "second-workspace" },
      },
    ]);
    expect(unexpected).toEqual([]);
  } finally {
    releaseOverview();
  }
});

test("accepted navigation away and back closes the application choice even when the final address matches", async ({
  page,
}) => {
  const { writes, unexpected } = await installWorkspaceFixture(page);
  await page.goto("/#/app/documents");
  const application = page.locator(".sidebar .application-switcher > button");
  const applications = page.getByRole("navigation", {
    name: "Applications",
    exact: true,
  });
  await application.click();
  await expect(applications).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "/app/dispatches";
    window.location.hash = "/app/documents";
  });
  await expect(applications).toBeHidden();
  await expect(page).toHaveURL(/#\/app\/documents$/);
  await application.click();
  await expect(applications).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "/app/dispatches";
  });
  const dispatches = page.locator('.sidebar nav a[href="#/app/dispatches"]');
  await expect(dispatches).toHaveAttribute("aria-current", "page");
  await expect(applications).toBeHidden();
  await application.click();
  await expect(applications).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/app\/documents$/);
  await expect(applications).toBeHidden();
  await application.click();
  await expect(applications).toBeVisible();
  await page.goForward();
  await expect(dispatches).toHaveAttribute("aria-current", "page");
  await expect(applications).toBeHidden();
  expect(writes).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("a vetoed navigation preserves the current application choice", async ({
  page,
}) => {
  const { writes, unexpected } = await installWorkspaceFixture(page);
  await page.goto("/#/app/documents");
  const application = page.locator(".sidebar .application-switcher > button");
  const applications = page.getByRole("navigation", {
    name: "Applications",
    exact: true,
  });
  await application.click();
  await expect(applications).toBeVisible();
  await page.evaluate(() => {
    // Use the same cancelable guard contract as a dirty form. This fixture
    // exercises a refused visit, rather than discarding work to navigate.
    window.addEventListener(
      "guteneo:before-workspace-navigation",
      (event) => event.preventDefault(),
      { once: true },
    );
    window.location.hash = "/app/dispatches";
  });
  await expect(page).toHaveURL(/#\/app\/documents$/);
  await expect(applications).toBeVisible();
  await expect(application).toHaveAttribute("aria-expanded", "true");
  expect(writes).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("a same-address workspace authority replacement closes the old workspace choice", async ({
  page,
}) => {
  const { writes, unexpected } = await installWorkspaceFixture(page);
  await page.goto("/#/app");
  await expect(page.locator("main h1")).toHaveText("Vue d’ensemble");
  const workspace = page.locator(".sidebar .workspace-switcher > button");
  const choices = page.getByRole("navigation", {
    name: "Espaces de travail",
    exact: true,
  });
  await workspace.click();
  await choices
    .getByRole("button", { name: "Deuxième atelier", exact: true })
    .click();
  await expect(workspace).toContainText("Deuxième atelier");
  await expect(page).toHaveURL(/#\/app$/);
  await expect(choices).toBeHidden();
  await expect(workspace).toHaveAttribute("aria-expanded", "false");
  expect(writes).toEqual([
    {
      path: "/api/account/workspace",
      body: { organizationId: "second-workspace" },
    },
  ]);
  expect(unexpected).toEqual([]);
});
