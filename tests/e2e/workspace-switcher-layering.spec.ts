import { expect, test } from "@playwright/test";
import type { Session } from "../../apps/web/src/api";
import { workspacePermissions } from "../../packages/contracts/src/roles";

test("workspace and application choices remain clickable beside the closed account control", async ({
  page,
}, info) => {
  // Every request, including the workspace switch, is a synthetic response.
  await page.addInitScript(() => localStorage.setItem("guteneo.theme", "light"));
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

  const application = page.locator(".sidebar .application-switcher > button");
  await application.click();
  await page
    .getByRole("navigation", { name: "Applications", exact: true })
    .getByRole("link", { name: "Studio", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/studio\/templates$/);
  await expect(application).toContainText("Studio");
  await expect(workspace).toContainText("Deuxième atelier");

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
});
