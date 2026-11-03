import { expect, test, type Page } from "@playwright/test";
import type { PersonalSession } from "../../apps/web/src/personal-api";

const session: PersonalSession = {
  user: {
    id: "list-owner",
    name: "Synthetic reader",
    email: "reader@example.invalid",
    preferredLocale: "en",
  },
  csrfToken: "synthetic-list-csrf",
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
const counts = {
  total: 51,
  available: 30,
  pending: 10,
  expiring: 5,
  ended: 11,
};
const summary = {
  shared: counts,
  personal: { total: 0, available: 0, pending: 0, expiring: 0, ended: 0 },
  senders: [{ name: "Synthetic sender", documents: 51 }],
  sendersTotal: 1,
  expiringDays: 14,
};
function item(id: string) {
  return {
    id,
    title: id,
    sender: "Synthetic sender",
    kind: "shared",
    status: "active",
    createdAt: "2026-10-01T12:00:00.000Z",
    expiresAt: "2027-01-01T12:00:00.000Z",
    allowOriginalDownload: false,
    allowVaultDeposit: false,
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture(page: Page) {
  const reads: string[] = [],
    writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (request.method() !== "GET") writes.push(url.pathname);
    else reads.push(url.pathname + url.search);
    if (url.pathname === "/api/personal/session")
      return route.fulfill({ json: session });
    if (url.pathname === "/api/session")
      return route.fulfill({
        status: 401,
        json: { error: { code: "UNAUTHENTICATED", message: "No workspace" } },
      });
    if (url.pathname === "/api/personal/documents/summary")
      return route.fulfill({ json: summary });
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  return { reads, writes };
}

test("changing a filter cannot reuse the previous page cursor while its read is pending", async ({
  page,
}) => {
  const state = await fixture(page),
    held = deferred(),
    requested = deferred();
  const listReads: string[] = [];
  await page.route("**/api/personal/documents?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    listReads.push(query.toString());
    if (query.get("status") === "available" && !query.has("cursor")) {
      requested.resolve();
      await held.promise;
      return route.fulfill({
        json: {
          items: [item("Current filtered document")],
          nextCursor: "current-filter-cursor",
          total: 30,
        },
      });
    }
    if (query.has("cursor"))
      return route.fulfill({
        json: {
          items: [item("Current second page")],
          nextCursor: null,
          total: 30,
        },
      });
    return route.fulfill({
      json: {
        items: [item("Old unfiltered document")],
        nextCursor: "old-filter-cursor",
        total: 51,
      },
    });
  });
  try {
    await page.goto("/#/app/my-documents");
    await expect(
      page.getByRole("heading", {
        name: "Old unfiltered document",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: /^Available 30$/ }).click();
    await requested.promise;
    await expect(
      page.getByRole("heading", {
        name: "Old unfiltered document",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Next documents", exact: true }),
    ).toHaveCount(0);
    expect(listReads.some((read) => read.includes("cursor="))).toBe(false);
    held.resolve();
    await expect(
      page.getByRole("heading", {
        name: "Current filtered document",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Next documents", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Current second page", exact: true }),
    ).toBeVisible();
    const paged = new URLSearchParams(listReads.at(-1));
    expect(paged.get("status")).toBe("available");
    expect(paged.get("cursor")).toBe("current-filter-cursor");
    expect(state.writes).toEqual([]);
  } finally {
    held.resolve();
  }
});

test("a delayed previous page cannot overwrite a newer sort or restore its pagination", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.addInitScript(() => {
    const original = fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (
        url.pathname !== "/api/personal/documents" ||
        !url.searchParams.has("cursor")
      )
        return original(input, init);
      const response = await original(input, { ...init, signal: undefined });
      await new Promise<void>((resolve) =>
        Reflect.set(window, "releaseOldPersonalPage", resolve),
      );
      return response;
    };
  });
  await page.route("**/api/personal/documents?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        items: [
          item(
            query.get("sort") === "title"
              ? "New title-sorted document"
              : query.has("cursor")
                ? "Obsolete old page"
                : "First document",
          ),
        ],
        nextCursor: query.get("sort") === "title" ? null : "old-page",
        total: query.get("sort") === "title" ? 1 : 51,
      },
    });
  });
  await page.goto("/#/app/my-documents");
  await expect(
    page.getByRole("heading", { name: "First document", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next documents", exact: true })
    .click();
  await page.waitForFunction(() =>
    Boolean(Reflect.get(window, "releaseOldPersonalPage")),
  );
  await page.getByLabel("Sort by", { exact: true }).selectOption("title");
  await expect(
    page.getByRole("heading", {
      name: "New title-sorted document",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => Reflect.get(window, "releaseOldPersonalPage")());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole("heading", { name: "Obsolete old page", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Previous documents", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue(
    "title",
  );
  await expect(
    page.getByRole("heading", {
      name: "New title-sorted document",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("an authority refusal clears page metadata and cannot be undone by a delayed summary", async ({
  page,
}) => {
  const state = await fixture(page),
    held = deferred();
  await page.route("**/api/personal/documents/summary", async (route) => {
    await held.promise;
    return route.fulfill({ json: summary });
  });
  await page.route("**/api/personal/documents?**", async (route) => {
    if (new URL(route.request().url()).searchParams.has("cursor"))
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: "DOCUMENT_AUTHENTICATION_REQUIRED",
            message: "Sign in again.",
          },
        },
      });
    return route.fulfill({
      json: {
        items: [item("Previously authorized document")],
        nextCursor: "next",
        total: 51,
      },
    });
  });
  try {
    await page.goto("/#/app/my-documents");
    await expect(
      page.getByRole("heading", {
        name: "Previously authorized document",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Next documents", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Previously authorized document",
        exact: true,
      }),
    ).toHaveCount(0);
    const summaryResponse = page.waitForResponse(
      "**/api/personal/documents/summary",
    );
    held.resolve();
    await summaryResponse;
    await expect(page.locator(".personal-document-count")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Filter by status" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Next documents", exact: true }),
    ).toHaveCount(0);
    expect(state.writes).toEqual([]);
  } finally {
    held.resolve();
  }
});

test("a missing summary leaves the owner list, page controls and search usable", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.route("**/api/personal/documents/summary", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "TEMPORARILY_UNAVAILABLE",
          message: "Summary unavailable.",
        },
      },
    }),
  );
  await page.route("**/api/personal/documents?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        items: [
          item(query.has("q") ? "Matching document" : "List without summary"),
        ],
        nextCursor: null,
        total: 1,
      },
    });
  });
  await page.goto("/#/app/my-documents");
  await expect(
    page.getByRole("heading", { name: "List without summary", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search my documents", { exact: true })
    .fill("matching");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Matching document", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("paging replaces the bounded rows and changing page size restarts at the first page", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.route("**/api/personal/documents?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const size = Number(query.get("limit"));
    const offset = Number(query.get("cursor") ?? 0);
    return route.fulfill({
      json: {
        items: Array.from({ length: Math.min(size, 51 - offset) }, (_, i) =>
          item(`Document ${offset + i + 1}`),
        ),
        nextCursor: offset + size < 51 ? String(offset + size) : null,
        total: 51,
      },
    });
  });
  await page.goto("/#/app/my-documents");
  const rows = page.locator(".personal-document-rows > li");
  await expect(rows).toHaveCount(25);
  await page
    .getByRole("button", { name: "Next documents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Document 26", exact: true }),
  ).toBeVisible();
  await expect(rows).toHaveCount(25);
  await expect(
    page.getByRole("heading", { name: "Document 1", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous documents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Document 1", exact: true }),
  ).toBeVisible();
  await expect(rows).toHaveCount(25);
  await page
    .getByLabel("Documents per page", { exact: true })
    .selectOption("50");
  await expect(rows).toHaveCount(50);
  await expect(
    page.getByRole("heading", { name: "Document 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous documents", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/size=50/);
  expect(state.writes).toEqual([]);
});

for (const status of [401, 403])
  test(`a ${status} summary refusal cannot be overwritten by a delayed authorized list`, async ({
    page,
  }) => {
    const state = await fixture(page),
      held = deferred();
    await page.route("**/api/personal/documents/summary", (route) =>
      route.fulfill({
        status,
        json: {
          error: {
            code: "UNAUTHENTICATED",
            message: "Session no longer authorized.",
          },
        },
      }),
    );
    await page.route("**/api/personal/documents?**", async (route) => {
      await held.promise;
      return route.fulfill({
        json: {
          items: [item("Obsolete authorized document")],
          nextCursor: "obsolete",
          total: 51,
        },
      });
    });
    try {
      await page.goto("/#/app/my-documents");
      await expect(page.getByRole("alert")).toContainText(
        "Session no longer authorized.",
      );
      const listResponse = page.waitForResponse("**/api/personal/documents?**");
      held.resolve();
      await listResponse;
      await expect(
        page.getByRole("heading", {
          name: "Obsolete authorized document",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page.locator(".personal-document-count")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Next documents", exact: true }),
      ).toHaveCount(0);
      expect(state.writes).toEqual([]);
    } finally {
      held.resolve();
    }
  });
