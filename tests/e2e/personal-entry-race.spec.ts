import { expect, test, type Page } from "@playwright/test";
import type { PersonalSession } from "../../apps/web/src/personal-api";

function session(id: string): PersonalSession {
  return {
    user: {
      id,
      name: `Synthetic ${id}`,
      email: `${id}@example.invalid`,
      preferredLocale: "en",
    },
    csrfToken: `synthetic-csrf-${id}`,
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

async function fixture(
  page: Page,
  { hidden = false, delayFirst = false } = {},
) {
  let identity = "entry-reader-a";
  const reads: string[] = [];
  const writes: string[] = [];
  let firstSessionRead = true;
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  let firstSettled!: () => void;
  const settled = new Promise<void>((resolve) => {
    firstSettled = resolve;
  });
  await page.addInitScript((initiallyHidden) => {
    let state = initiallyHidden ? "hidden" : "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state,
    });
    Object.defineProperty(window, "setSyntheticVisibility", {
      value: (value: string) => {
        state = value;
        document.dispatchEvent(new Event("visibilitychange"));
      },
    });
  }, hidden);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") reads.push(url.pathname);
    else writes.push(url.pathname);
    if (url.pathname === "/api/personal/session") {
      const captured = session(identity);
      const first = firstSessionRead;
      if (first) {
        firstSessionRead = false;
        firstStarted();
        if (delayFirst) await firstResponse;
      }
      // An invalidated entry request may already have been aborted in the browser.
      await route.fulfill({ json: captured }).catch(() => undefined);
      if (first) firstSettled();
      return;
    }
    if (url.pathname === "/api/personal/documents") {
      return route.fulfill({
        json: {
          items: [
            {
              id: `document-${identity}`,
              title: `Document for ${identity}`,
              sender: "Synthetic sending workspace",
              kind: url.searchParams.get("kind") ?? "shared",
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
    started,
    settled,
    releaseFirst,
    switchIdentity() {
      identity = "entry-reader-b";
    },
    async visible() {
      await page.evaluate(() => {
        Reflect.get(window, "setSyntheticVisibility")("visible");
        window.dispatchEvent(new Event("focus"));
      });
    },
  };
}

function expectPersonalOnly(state: { reads: string[]; writes: string[] }) {
  expect(state.reads).not.toContain("/api/session");
  expect(state.reads.every((path) => path.startsWith("/api/personal/"))).toBe(
    true,
  );
  expect(state.writes).toEqual([]);
}

test("a hidden personal entry reads the current identity only when it becomes visible", async ({
  page,
}) => {
  const state = await fixture(page, { hidden: true });
  await page.goto("/#/app/my-documents");
  await expect(page.locator("#root .loading:visible").first()).toBeVisible();
  // Let the mounted entry run its effects while hidden; the negative assertion
  // guards against moving a session read ahead of personal visibility checks.
  await page.waitForTimeout(250);
  expect(state.reads).toEqual([]);
  state.switchIdentity();
  await state.visible();
  await expect(
    page.getByRole("heading", {
      name: "Document for entry-reader-b",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".workspace-identity-email")).toHaveText(
    "entry-reader-b@example.invalid",
  );
  await expect(page.locator("#root")).not.toContainText("entry-reader-a");
  expectPersonalOnly(state);
});

test("a late entry session cannot restore the account that lost focus before personal content mounted", async ({
  page,
}) => {
  const state = await fixture(page, { delayFirst: true });
  try {
    await page.goto("/#/app/my-documents");
    await state.started;
    await page.evaluate(() =>
      Reflect.get(window, "setSyntheticVisibility")("hidden"),
    );
    state.switchIdentity();
    await state.visible();
    await expect(
      page.getByRole("heading", {
        name: "Document for entry-reader-b",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".workspace-identity-email")).toHaveText(
      "entry-reader-b@example.invalid",
    );
    state.releaseFirst();
    await state.settled;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator("#root")).not.toContainText("entry-reader-a");
    expectPersonalOnly(state);
  } finally {
    state.releaseFirst();
  }
});

test("personal account switching drops private search and invitation parameters and keeps both menus read-only", async ({
  page,
}) => {
  const state = await fixture(page);
  const invitation = "a".repeat(64);
  await page.goto(
    `/#/app/my-documents?kind=personal&q=synthetic-private-search&private=synthetic-private-value&invitation=${invitation}`,
  );
  const trigger = page.locator(
    ".personal-space-header .workspace-identity-trigger",
  );
  const account = page.locator(
    ".personal-space-header .workspace-identity-menu",
  );
  const applicationTrigger = page.locator(
    ".application-switcher .space-switcher-trigger",
  );
  const applications = page.locator(
    ".application-switcher .space-switcher-panel",
  );
  await expect(trigger).toBeVisible();
  const reads = [...state.reads];
  await trigger.click();
  const href = await account
    .getByRole("link", { name: "Switch account", exact: true })
    .getAttribute("href");
  const login = new URL(href!, page.url());
  expect(login.pathname).toBe("/auth/login");
  expect(login.searchParams.get("context")).toBe("personal");
  expect(login.searchParams.get("intent")).toBe("switch-account");
  expect(login.searchParams.get("returnTo")).toBe(
    "/#/app/my-documents?kind=personal",
  );
  expect(login.search).not.toContain("synthetic-private");
  expect(login.search).not.toContain(invitation);
  await page.keyboard.press("Escape");
  await expect(account).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await applicationTrigger.click();
  await expect(account).toBeHidden();
  await expect(applications).toBeVisible();
  await trigger.click();
  await expect(applications).toBeHidden();
  await expect(account).toBeVisible();
  expect(state.reads).toEqual(reads);
  expectPersonalOnly(state);
});

test("a failed personal code request offers explicit recovery without private reads or writes", async ({
  page,
}) => {
  const state = await fixture(page);
  const chunk = "**/assets/personal-area-*.js";
  await page.route(chunk, (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/javascript",
      headers: { "Cache-Control": "no-store" },
      body: "/* Synthetic temporarily unavailable module. */",
    }),
  );
  await page.goto("/#/app/my-documents");
  await expect(page.getByRole("alert")).toContainText(
    "Cette page n’a pas pu être chargée.",
  );
  expect(state.reads).not.toContain("/api/personal/documents");
  expect(state.reads).not.toContain("/api/session");
  expect(state.writes).toEqual([]);
  await page.unroute(chunk);
  await page
    .getByRole("button", { name: "Recharger la page", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Document for entry-reader-a",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes).toEqual([]);
});
