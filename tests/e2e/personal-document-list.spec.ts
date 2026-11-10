import { expect, test, type Page } from "@playwright/test";
import { expectUnreviewedServerError } from "../helpers/browser-error-notice";
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

test("returning from a document restores its page, position and focus without rereading", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const listReads: string[] = [];
  await page.route("**/api/personal/documents?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    listReads.push(query.toString());
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
  await page.route(
    (url) => url.pathname.startsWith("/api/personal/documents/Document"),
    (route) =>
      route.fulfill({
        status: 404,
        json: { error: { code: "NOT_FOUND", message: "Not found." } },
      }),
  );
  await page.goto("/#/app/my-documents");
  await page
    .getByRole("button", { name: "Next documents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Document 26", exact: true }),
  ).toBeVisible();
  const open = page.locator('[data-document-link="Document 40"]');
  await open.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  const reads = listReads.length;
  await open.click();
  const back = page.getByRole("link", {
    name: "Back to my documents",
    exact: true,
  });
  await expect(back).toBeVisible();
  await expect(open).toBeHidden();
  await back.click();
  await expect(open).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Document 26", exact: true }),
  ).toBeVisible();
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - scrollY),
  ).toBeLessThan(2);
  // Browser Back from the document returns to the same row as well.
  await open.click();
  await expect(back).toBeVisible();
  await page.goBack();
  await expect(open).toBeFocused();
  expect(listReads).toHaveLength(reads);
  expect(state.writes).toEqual([]);
});

for (const initialTotal of [26, 51])
  test(`deleting the final copy returns from page ${Math.ceil(initialTotal / 25)} to the remaining page`, async ({
    page,
  }) => {
    await fixture(page);
    let total = initialTotal;
    let deletions = 0;
    const cursors: number[] = [];
    const copy = (id: string) => ({ ...item(id), kind: "personal" });
    await page.route("**/api/personal/documents?**", (route) => {
      const query = new URL(route.request().url()).searchParams;
      const offset = Number(query.get("cursor") ?? 0);
      const size = Number(query.get("limit"));
      cursors.push(offset);
      return route.fulfill({
        json: {
          items: Array.from(
            { length: Math.max(0, Math.min(size, total - offset)) },
            (_, index) => copy(`Copy-${offset + index + 1}`),
          ),
          nextCursor: offset + size < total ? String(offset + size) : null,
          total,
        },
      });
    });
    await page.route(
      `**/api/personal/documents/Copy-${initialTotal}`,
      (route) =>
        route.fulfill({
          json: {
            ...copy(`Copy-${initialTotal}`),
            pages: [],
            audit: [],
            auditNextCursor: null,
          },
        }),
    );
    await page.route(
      `**/api/personal/documents/Copy-${initialTotal}/delete`,
      (route) => {
        expect(route.request().method()).toBe("POST");
        deletions += 1;
        // The 51-copy case also removes page 2 concurrently with this delete.
        total = 25;
        return route.fulfill({ json: { deleted: true } });
      },
    );
    await page.goto("/#/app/my-documents?kind=personal");
    for (let offset = 25; offset < initialTotal; offset += 25) {
      await page
        .getByRole("button", { name: "Next documents", exact: true })
        .click();
      await expect(
        page.locator(`[data-document-link="Copy-${offset + 1}"]`),
      ).toBeVisible();
    }
    await page.locator(`[data-document-link="Copy-${initialTotal}"]`).click();
    await page
      .getByRole("button", { name: "Delete my copy", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Copy-1", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#personal-document-results")).toHaveText(
      "Documents 1–25 of 25",
    );
    await expect(
      page.getByText("No saved copies", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Document pages", exact: true }),
    ).toHaveCount(0);
    expect(cursors).toEqual(
      initialTotal === 26 ? [0, 25, 25, 0] : [0, 25, 50, 50, 25, 0],
    );
    expect(deletions).toBe(1);
  });

test("an authority refusal while recovering an emptied page clears cached rows", async ({
  page,
}) => {
  const state = await fixture(page);
  let reads = 0;
  await page.route("**/api/personal/documents?**", (route) => {
    reads += 1;
    if (reads === 3)
      return route.fulfill({
        status: 403,
        json: { error: { code: "FORBIDDEN", message: "Copy access refused." } },
      });
    return route.fulfill({
      json:
        reads === 1
          ? {
              items: [item("Previously authorized copy")],
              nextCursor: "25",
              total: 26,
            }
          : { items: [], nextCursor: null, total: 25 },
    });
  });
  await page.goto("/#/app/my-documents");
  await page
    .getByRole("button", { name: "Next documents", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("FORBIDDEN");
  await expect(
    page.getByRole("heading", {
      name: "Previously authorized copy",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Document pages", exact: true }),
  ).toHaveCount(0);
  expect(reads).toBe(3);
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
      await expectUnreviewedServerError(
        page.getByRole("alert"),
        "UNAUTHENTICATED",
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

test("document search runs after typing settles and retains keyboard focus", async ({
  page,
}) => {
  const state = await fixture(page);
  const searches: string[] = [];
  await page.route("**/api/personal/documents?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has("q")) searches.push(query.get("q")!);
    return route.fulfill({
      json: {
        items: [
          item(query.has("q") ? "Matching document" : "Unfiltered document"),
        ],
        nextCursor: null,
        total: 1,
      },
    });
  });
  await page.goto("/#/app/my-documents");
  const search = page.getByLabel("Search my documents", { exact: true });
  await expect(
    page.getByRole("heading", { name: "Unfiltered document", exact: true }),
  ).toBeVisible();
  await search.fill("match");
  await search.fill("matching");
  await expect(
    page.getByRole("heading", { name: "Matching document", exact: true }),
  ).toBeVisible();
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(/q=matching/);
  expect(searches).toEqual(["matching"]);
  expect(state.writes).toEqual([]);
});

test("leaving the list cancels an unsubmitted search", async ({ page }) => {
  const state = await fixture(page);
  const searches: string[] = [];
  await page.route("**/api/personal/documents?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has("q")) searches.push(query.get("q")!);
    return route.fulfill({
      json: { items: [item("Current document")], nextCursor: null, total: 1 },
    });
  });
  await page.route("**/api/personal/documents/Current%20document", (route) =>
    route.fulfill({
      json: {
        ...item("Current document"),
        pages: [],
        audit: [],
        auditNextCursor: null,
      },
    }),
  );
  await page.goto("/#/app/my-documents");
  const search = page.getByLabel("Search my documents", { exact: true });
  await expect(
    page.getByRole("heading", { name: "Current document", exact: true }),
  ).toBeVisible();
  await search.fill("abandoned search");
  await page.locator('[data-document-link="Current document"]').click();
  await expect(
    page.getByRole("link", { name: "Back to my documents", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/my-documents\/Current%20document$/);
  expect(searches).toEqual([]);
  expect(state.writes).toEqual([]);
});

test("the whole document row opens its native link and only near expiry is highlighted", async ({
  page,
}) => {
  const state = await fixture(page);
  const near = {
    ...item("Ending document"),
    expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  };
  const later = {
    ...item("Later document"),
    expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
  };
  await page.route("**/api/personal/documents?**", (route) =>
    route.fulfill({
      json: { items: [near, later], nextCursor: null, total: 2 },
    }),
  );
  await page.route("**/api/personal/documents/Ending%20document", (route) =>
    route.fulfill({
      json: { ...near, pages: [], audit: [], auditNextCursor: null },
    }),
  );
  await page.goto("/#/app/my-documents");
  const row = page.locator(".personal-document-rows > li").filter({
    has: page.getByRole("heading", { name: near.title, exact: true }),
  });
  await expect(row.locator(".personal-document-expiring")).toHaveCount(1);
  await expect(page.locator(".personal-document-expiring")).toHaveCount(1);
  await expect(
    row.getByRole("link", { name: near.title, exact: true }),
  ).toBeVisible();
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  await row.click({ position: { x: 4, y: box!.height - 4 } });
  await expect(
    page.getByRole("link", { name: "Back to my documents", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/my-documents\/Ending%20document$/);
  const history = page.locator(".personal-document-history > details");
  await expect(history).not.toHaveAttribute("open");
  await expect(
    page.getByText("No events available.", { exact: true }),
  ).toBeHidden();
  await history.locator("summary").click();
  await expect(
    page.getByText("No events available.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".personal-document-reader > .secure-document-reader-toolbar"),
  ).toHaveCSS("position", "sticky");
  expect(state.writes).toEqual([]);
});
