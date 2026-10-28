import { expect, test, type Page } from "@playwright/test";
import type { PersonalSession } from "../../apps/web/src/personal-api";

// Read-only browser fixtures: no account, document or audit event is written.
function personalSession(id = "personal-performance-a"): PersonalSession {
  return {
    user: {
      id,
      name: "Synthetic reader",
      email: `${id}@example.invalid`,
      preferredLocale: "en",
    },
    csrfToken: `synthetic-${id}`,
    simulation: true,
    mfa: false,
    strongAuthentication: false,
    documentAccessAllowed: true,
    documentAccessMode: "verified_account",
    authenticationPolicyVersion: "synthetic",
    amr: [],
    acr: null,
    verifiedAccount: true,
    authenticatedAt: Date.now(),
    workspaces: [],
  };
}

async function fixture(page: Page) {
  let session = personalSession();
  let listFailure = false;
  const reads: string[] = [];
  const writes: string[] = [];
  const scripts: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith(".js")) scripts.push(path);
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(path);
    else reads.push(path);
    if (path === "/api/session")
      return route.fulfill({
        status: 401,
        json: { error: { code: "UNAUTHENTICATED", message: "No workspace" } },
      });
    if (path === "/api/personal/session")
      return route.fulfill({ json: session });
    if (path === "/api/personal/documents") {
      if (listFailure)
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "TEMPORARILY_UNAVAILABLE",
              message: "Synthetic document service unavailable",
            },
          },
        });
      return route.fulfill({
        json: {
          items: [
            {
              id: `document-${session.user.id}`,
              title: `Document for ${session.user.id}`,
              sender: "Synthetic workspace",
              kind: "shared",
              status: "active",
              expiresAt: "2026-12-01T00:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      });
    }
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  return {
    reads,
    writes,
    scripts,
    switchAccount() {
      session = personalSession("personal-performance-b");
    },
    failList(value: boolean) {
      listFailure = value;
    },
  };
}

async function refreshSession(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

test("my documents opens independently of workspace authentication and unused editors", async ({
  page,
}) => {
  const state = await fixture(page);
  let releaseWorkspaceRead!: () => void;
  const workspaceRead = new Promise<void>((resolve) => {
    releaseWorkspaceRead = resolve;
  });
  await page.route("**/api/session", async (route) => {
    await workspaceRead;
    await route.fulfill({
      status: 401,
      json: { error: { code: "UNAUTHENTICATED", message: "No workspace" } },
    });
  });
  try {
    await page.goto("/#/app/my-documents");
    await expect(
      page.getByRole("heading", {
        name: "Document for personal-performance-a",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      state.reads.filter((path) => path.startsWith("/api/personal/")),
    ).toEqual(["/api/personal/session", "/api/personal/documents"]);
    expect(
      state.scripts.filter((path) =>
        /pdf-viewer|pdf\.worker|template-designer|document-studio|swagger-ui/.test(
          path,
        ),
      ),
    ).toEqual([]);
    expect(state.writes).toEqual([]);
  } finally {
    releaseWorkspaceRead();
  }
});

test("the personal header follows the system and switches with one icon without reloading documents", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Reflect.set(window, "personalThemeChanges", 0);
    window.addEventListener("guteneo-theme-change", () => {
      Reflect.set(
        window,
        "personalThemeChanges",
        Number(Reflect.get(window, "personalThemeChanges")) + 1,
      );
    });
  });
  await page.goto("/#/app/my-documents");
  await expect(
    page.getByRole("heading", {
      name: "Document for personal-performance-a",
      exact: true,
    }),
  ).toBeVisible();
  const root = page.locator("html");
  const header = page.locator(".personal-space-header");
  const button = header.locator("button[data-theme-toggle]");
  await expect(button).toHaveCount(1);
  await expect(button).toBeVisible();
  await expect(header.locator("select")).toHaveCount(0);
  await expect(root).toHaveAttribute("data-theme-preference", "system");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(button).toHaveAccessibleName("Switch to light mode");
  const size = await button.boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(44);
  expect(size?.height).toBeGreaterThanOrEqual(44);
  const readsBeforeAppearance = [...state.reads];
  const changesBefore = await page.evaluate(() =>
    Number(Reflect.get(window, "personalThemeChanges")),
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("data-theme-preference", "system");
  await button.click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveAttribute("data-theme-preference", "dark");
  await expect(button).toHaveAccessibleName("Switch to light mode");
  await button.press("Enter");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(button).toHaveAccessibleName("Switch to dark mode");
  expect(
    await page.evaluate(() =>
      Number(Reflect.get(window, "personalThemeChanges")),
    ),
  ).toBe(changesBefore + 3);
  expect(state.reads).toEqual(readsBeforeAppearance);
  expect(state.writes).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Document for personal-performance-a",
      exact: true,
    }),
  ).toBeVisible();
  await expect(root).toHaveAttribute("data-theme-preference", "light");
  await expect(root).toHaveAttribute("data-theme", "light");
  expect(state.writes).toEqual([]);
});

test("a failed personal list can be retried without reloading the account", async ({
  page,
}) => {
  const state = await fixture(page);
  state.failList(true);
  await page.goto("/#/app/my-documents");
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic document service unavailable",
  );
  state.failList(false);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Document for personal-performance-a",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    state.reads.filter((path) => path === "/api/personal/session"),
  ).toHaveLength(1);
  expect(state.writes).toEqual([]);
});

test("personal navigation retains the verified session and shell without another authentication waterfall", async ({
  page,
}, info) => {
  const state = await fixture(page);
  await page.goto("/#/app/my-documents");
  await expect(
    page.getByRole("heading", {
      name: "Document for personal-performance-a",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(".personal-space").evaluate((element) => {
    element.setAttribute("data-navigation-proof", "retained");
  });
  let repeatedSessionReads = 0;
  let releaseRead!: () => void;
  const heldRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  await page.route("**/api/personal/session", async (route) => {
    repeatedSessionReads += 1;
    await heldRead;
    await route.fulfill({ json: personalSession() });
  });
  const measurements: { path: string; usefulContentMs: number }[] = [];
  try {
    for (const [path, heading] of [
      ["/app/services", "Create or join a workspace"],
      ["/app/personal-account", "Account and security"],
      ["/app/my-documents", "Document for personal-performance-a"],
    ]) {
      const start = await page.evaluate(() => performance.now());
      await page
        .locator(`.personal-space-header nav a[href="#${path}"]`)
        .click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      measurements.push({
        path,
        usefulContentMs: (await page.evaluate(() => performance.now())) - start,
      });
      await expect(page.locator(".personal-space")).toHaveAttribute(
        "data-navigation-proof",
        "retained",
      );
    }
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Account and security", exact: true }),
    ).toBeVisible();
    await page.goForward();
    await expect(
      page.getByRole("heading", {
        name: "Document for personal-performance-a",
        exact: true,
      }),
    ).toBeVisible();
    expect(repeatedSessionReads).toBe(0);
    expect(
      state.reads.filter((path) => path === "/api/personal/session"),
    ).toHaveLength(1);
    expect(state.writes).toEqual([]);
    await info.attach("personal-navigation", {
      contentType: "application/json",
      body: JSON.stringify(measurements),
    });
  } finally {
    releaseRead();
  }
});

test("an invitation arriving during personal navigation is captured before its new screen without restarting the session", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/my-documents");
  await expect(
    page.getByRole("heading", {
      name: "Document for personal-performance-a",
      exact: true,
    }),
  ).toBeVisible();
  const token = "ab".repeat(32);
  await page.evaluate((invitation) => {
    location.hash = `/app/my-documents?invitation=${invitation}`;
  }, token);
  await expect(
    page.getByRole("heading", {
      name: "A document has been sent to you",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/app\/my-documents$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("guteneo.pending-document-invitation.v1"),
    ),
  ).toContain(token);
  expect(
    state.reads.filter((path) => path === "/api/personal/session"),
  ).toHaveLength(1);
  expect(state.writes).toEqual([]);
});

test("focus revalidation replaces the personal account without reusing its documents", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/my-documents");
  await expect(
    page.getByRole("heading", {
      name: "Document for personal-performance-a",
      exact: true,
    }),
  ).toBeVisible();
  state.switchAccount();
  // The browser focus handler intentionally coalesces events within one second.
  await expect(async () => {
    await refreshSession(page);
    await expect(
      page.getByRole("heading", {
        name: "Document for personal-performance-b",
        exact: true,
      }),
    ).toBeVisible({ timeout: 250 });
  }).toPass();
  await expect(
    page.getByText("Document for personal-performance-a", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("personal-performance-a@example.invalid", { exact: false }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("discarded workspace reads cannot overwrite personal state and returning rechecks workspace authority", async ({
  page,
}) => {
  const state = await fixture(page);
  let workspaceReads = 0;
  await page.addInitScript(() => {
    const original = fetch.bind(window);
    let firstWorkspaceRead = true;
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path !== "/api/session" || !firstWorkspaceRead)
        return original(input, init);
      firstWorkspaceRead = false;
      // A transport may finish after navigation, even after its caller aborts.
      const response = await original(input, { ...init, signal: undefined });
      await new Promise<void>((resolve) => {
        Reflect.set(window, "releaseObsoleteWorkspaceRead", resolve);
      });
      return response;
    };
  });
  await page.route("**/api/session", async (route) => {
    workspaceReads += 1;
    await route.fulfill({
      json: {
        organization: {
          id: "synthetic-workspace",
          name: "Current synthetic workspace",
        },
        user: {
          id: `workspace-reader-${workspaceReads}`,
          name: "Synthetic workspace reader",
          role: "admin",
          preferredLocale: workspaceReads === 1 ? "fr" : "en",
        },
        csrfToken: `synthetic-workspace-${workspaceReads}`,
        simulation: true,
      },
    });
  });
  await page.goto("/#/app/documents");
  await page.waitForFunction(() =>
    Boolean(Reflect.get(window, "releaseObsoleteWorkspaceRead")),
  );
  await page.evaluate(() => {
    location.hash = "/app/my-documents";
  });
  await expect(
    page.getByRole("heading", {
      name: "Document for personal-performance-a",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    Reflect.get(window, "releaseObsoleteWorkspaceRead")();
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "My documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Current synthetic workspace", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = "/app/documents";
  });
  await expect(
    page.getByRole("heading", { name: "The raw material.", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".organization")
      .getByText("Current synthetic workspace", { exact: true }),
  ).toBeVisible();
  expect(workspaceReads).toBe(2);
  expect(state.writes).toEqual([]);
});
