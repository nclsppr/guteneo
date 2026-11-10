import { expect, test, type Page } from "@playwright/test";
import type { Session } from "../../apps/web/src/api";

type Operation = "workspace" | "logout" | "refresh";
const session = (id: string): Session => ({
  organization: {
    id: `authority-workspace-${id}`,
    name: `Synthetic workspace ${id}`,
  },
  user: {
    id: `authority-user-${id}`,
    name: `Synthetic account ${id}`,
    role: "admin",
    preferredLocale: "fr",
  },
  csrfToken: `synthetic-authority-${id}`,
  simulation: true,
});

// Every API request is intercepted. Gates model an already received response
// that ignores cancellation, independently of the browser's fetch transport.
async function fixture(page: Page, operation: Operation, status: number) {
  let active = "A";
  let holdRefresh = false;
  let workspaceRefused = false;
  let workspaceListReads = 0;
  const writes: string[] = [];
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const gates: Record<string, () => void> = {};
    Object.assign(window, { authorityResponseGates: gates });
    window.fetch = async (input, init) => {
      const response = await original(input, { ...init, signal: undefined });
      const gate = response.headers.get("x-synthetic-authority-gate");
      if (gate)
        await new Promise<void>((resolve) => {
          gates[gate] = resolve;
        });
      return response;
    };
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
    if (request.method() !== "GET") writes.push(`${request.method()} ${path}`);
    let body: unknown = { items: [], nextCursor: null };
    let held = false;
    if (path === "/session") {
      body = session(active);
      held = holdRefresh;
      holdRefresh = false;
    } else if (path === "/account/workspace") {
      body = session("C");
      held = operation === "workspace";
      if (held && status !== 200) workspaceRefused = true;
    } else if (path === "/account/workspaces") {
      workspaceListReads += 1;
      body = {
        items: [
          session("A").organization,
          ...(!workspaceRefused ? [session("C").organization] : []),
        ],
      };
    } else if (path === "/logout") {
      body = { signedOut: true };
      held = operation === "logout";
    } else if (path === "/account" && request.method() === "PATCH") {
      holdRefresh = operation === "refresh";
      body = {};
    } else if (path === "/account/expert-approval") {
      body = { canManage: false, day: "2026-11-10", connections: [] };
    } else if (path === "/account/sessions" || path === "/account/contacts") {
      body = { items: [], hasMore: false };
    } else if (path === "/capabilities") body = {};
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
    return route.fulfill({
      status: held ? status : 200,
      headers: held ? { "x-synthetic-authority-gate": operation } : {},
      json:
        held && status !== 200
          ? {
              error: {
                code:
                  operation === "workspace"
                    ? "MEMBERSHIP_REQUIRED"
                    : "UNAUTHENTICATED",
                message:
                  operation === "workspace"
                    ? "You are not a member of this workspace."
                    : "Obsolete synthetic account response",
              },
            }
          : body,
    });
  });
  await page.goto(
    operation === "refresh" ? "/#/app/account" : "/#/app/documents",
  );
  await expect(
    page.locator(".sidebar .workspace-identity-trigger"),
  ).toContainText("Synthetic account A");
  return {
    writes,
    workspaceReads: () => workspaceListReads,
    replaceIdentity: async () => {
      active = "B";
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(
        page.locator(".sidebar .workspace-identity-trigger"),
      ).toContainText("Synthetic account B");
      await expect(page.locator(".sidebar .workspace-switcher")).toContainText(
        "Synthetic workspace B",
      );
    },
  };
}

test("an ordinary workspace membership refusal stays visible and invalidates its offered memberships", async ({
  page,
}) => {
  const state = await fixture(page, "workspace", 403);
  await startOperation(page, "workspace");
  expect(state.workspaceReads()).toBe(1);
  await page.evaluate(() =>
    Reflect.get(window, "authorityResponseGates").workspace(),
  );
  await expect(page.getByRole("alert")).toContainText("MEMBERSHIP_REQUIRED");
  await expect(page).toHaveURL(/#\/app\/documents$/);
  await expect(page.locator(".sidebar .workspace-switcher")).toContainText(
    "Synthetic workspace A",
  );
  const panel = page.getByRole("navigation", {
    name: "Espaces de travail",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Synthetic workspace C", exact: true }),
  ).toHaveCount(0);
  expect(state.workspaceReads()).toBe(1);
  const trigger = page.locator(
    ".sidebar .workspace-switcher .space-switcher-trigger",
  );
  await trigger.click();
  await trigger.click();
  await expect.poll(state.workspaceReads).toBe(2);
  await expect(
    panel.getByRole("button", { name: "Synthetic workspace C", exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toEqual(["POST /account/workspace"]);
});

async function startOperation(page: Page, operation: Operation) {
  if (operation === "workspace") {
    await page
      .locator(".sidebar .workspace-switcher .space-switcher-trigger")
      .click();
    await page
      .getByRole("navigation", { name: "Espaces de travail", exact: true })
      .getByRole("button", { name: "Synthetic workspace C", exact: true })
      .click();
  } else if (operation === "logout") {
    await page.locator(".sidebar .workspace-identity-trigger").click();
    await page.locator(".workspace-identity-menu .workspace-sign-out").click();
  } else {
    await page.locator("#account-name").fill("Synthetic edited profile A");
    await page
      .locator("form")
      .filter({ has: page.locator("#account-name") })
      .getByRole("button", {
        name: "Enregistrer les modifications",
        exact: true,
      })
      .click();
  }
  await page.waitForFunction(
    (key) => Boolean(Reflect.get(window, "authorityResponseGates")?.[key]),
    operation,
  );
}

for (const operation of ["workspace", "logout", "refresh"] as const) {
  for (const status of [200, 403]) {
    test(`a late ${operation} ${status} cannot change or redirect a replacement account`, async ({
      page,
    }) => {
      const state = await fixture(page, operation, status);
      await startOperation(page, operation);
      await state.replaceIdentity();
      await page.evaluate(
        (key) => Reflect.get(window, "authorityResponseGates")[key](),
        operation,
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page).toHaveURL(/#\/app$/);
      await expect(
        page.locator(".sidebar .workspace-identity-trigger"),
      ).toContainText("Synthetic account B");
      await expect(page.locator(".sidebar .workspace-switcher")).toContainText(
        "Synthetic workspace B",
      );
      await expect(page.locator(".workspace")).not.toContainText(
        "Synthetic account A",
      );
      await expect(page.locator(".workspace")).not.toContainText(
        "Synthetic workspace C",
      );
      await expect(page.locator(".session-expired")).toHaveCount(0);
      await expect(
        page.getByText("Obsolete synthetic account response", { exact: true }),
      ).toHaveCount(0);
      expect(state.writes).toEqual([
        operation === "workspace"
          ? "POST /account/workspace"
          : operation === "logout"
            ? "POST /logout"
            : "PATCH /account",
      ]);
    });
  }
}

for (const scenario of [
  { operation: "workspace", status: 200, navigation: "current" },
  { operation: "workspace", status: 200, navigation: "return" },
  { operation: "logout", status: 200, navigation: "current" },
  { operation: "logout", status: 200, navigation: "leave" },
  { operation: "logout", status: 403, navigation: "return" },
] as const) {
  test(`same-authority ${scenario.operation} ${scenario.status} respects the ${scenario.navigation} visit`, async ({
    page,
  }) => {
    const { operation, status, navigation } = scenario;
    const state = await fixture(page, operation, status);
    await startOperation(page, operation);
    const originalHash = new URL(page.url()).hash;
    if (navigation !== "current") {
      await page.evaluate(() => {
        window.location.hash = "/app/account";
      });
      await expect(page.locator("#account-name")).toBeVisible();
      if (navigation === "return") {
        await page.evaluate((hash) => {
          window.location.hash = hash;
        }, originalHash);
        await expect(page).toHaveURL(/#\/app\/documents$/);
        await expect(page.locator("#account-name")).toHaveCount(0);
      }
    }
    await page.evaluate(
      (key) => Reflect.get(window, "authorityResponseGates")[key](),
      operation,
    );
    // Current-visit logout deliberately replaces the document. Its URL assertion
    // below owns that wait; evaluating animation frames in the old document races
    // the successful navigation and destroys that evaluation context.
    if (!(operation === "logout" && status === 200 && navigation === "current"))
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    if (operation === "workspace") {
      await expect(page).toHaveURL(
        navigation === "current" ? /#\/app$/ : /#\/app\/documents$/,
      );
      await expect(page.locator(".sidebar .workspace-switcher")).toContainText(
        "Synthetic workspace C",
      );
    } else if (status === 200 && navigation === "current") {
      await expect(page).toHaveURL("http://localhost:8787/");
    } else if (status === 200) {
      await expect(page).toHaveURL(/#\/app\/account$/);
      await expect(page.locator(".workspace")).toHaveCount(0);
      await expect(page.locator(".session-expired")).toBeVisible();
      await expect(page.locator(".session-expired button")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        "Synthetic account A",
      );
    } else {
      await expect(page).toHaveURL(/#\/app\/documents$/);
      await expect(
        page.locator(".sidebar .workspace-identity-trigger"),
      ).toContainText("Synthetic account A");
      await expect(
        page.getByText("Obsolete synthetic account response", { exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".session-expired")).toHaveCount(0);
    }
    expect(state.writes).toEqual([
      operation === "workspace" ? "POST /account/workspace" : "POST /logout",
    ]);
  });
}
