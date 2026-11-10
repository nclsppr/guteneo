import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Dispatch, Session } from "../../apps/web/src/api";
import type { DispatchOverview } from "../../packages/contracts/src/dispatch-groups";
import { workspacePermissions } from "../../packages/contracts/src/roles";

type Read =
  "overview" | "dispatches" | "attention" | "connections" | "contacts";

function gate(held = true) {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  if (!held) release();
  return { pending, release };
}

function scope(id: string, active = true) {
  const overview: DispatchOverview = {
    documents: active ? 2 : 0,
    dispatches: {
      total: active ? 1 : 0,
      approval: active ? 1 : 0,
      in_progress: 0,
      attention: 0,
      done: 0,
    },
  };
  const dispatch: Dispatch = {
    id: `synthetic-dispatch-${id}`,
    channel: "email",
    recipient_json: { email: "synthetic@example.invalid" },
    subject: "Synthetic overview fixture",
    status: "prepared",
    mode: "simulation",
    estimated_minor: 10,
    ceiling_minor: 50,
    currency: "EUR",
    fingerprint: `synthetic-fingerprint-${id}`,
    created_at: "2026-11-10T00:00:00.000Z",
    updated_at: "2026-11-10T00:00:00.000Z",
  };
  return {
    id,
    sessionIdentity: id,
    overview,
    dispatches: active ? [dispatch] : [],
    attention: [] as {
      id: string;
      kind: "approval";
      resourceId: string;
      route: string;
    }[],
    contacts: [] as {
      id: string;
      name: string;
      email: null;
      role: "admin";
      permissions: ReturnType<typeof workspacePermissions>;
    }[],
    failed: false,
    failedDispatches: false,
    attentionFailed: false,
    gates: {
      overview: gate(),
      dispatches: gate(),
      attention: gate(),
      connections: gate(),
      contacts: gate(),
    },
    reads: {
      overview: 0,
      dispatches: 0,
      attention: 0,
      connections: 0,
      contacts: 0,
    },
  };
}

type Scope = ReturnType<typeof scope>;

function populateAttention(state: Scope) {
  state.attention = Array.from({ length: 4 }, (_, index) => ({
    id: `synthetic-attention-${state.id}-${index}`,
    kind: "approval",
    resourceId: `Synthetic pending dispatch ${index + 1}`,
    route: `/app/dispatch/synthetic-${state.id}-${index}`,
  }));
}

function populateContacts(state: Scope) {
  state.contacts = Array.from({ length: 3 }, (_, index) => ({
    id: `synthetic-contact-${state.id}-${index}`,
    name: `Synthetic administrator ${index + 1}`,
    email: null,
    role: "admin",
    permissions: workspacePermissions("admin"),
  }));
}

// Pure browser transport fixtures: no application fixture hooks, database,
// authentication exchange or business writes are used by these scenarios.
async function fixture(page: Page, initial: Scope) {
  let current = initial;
  const scopes = [initial];
  const unexpected: string[] = [];
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(4);
    const state = current;
    let status = 200;
    let body: unknown;
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${path}`);
      status = 403;
      body = {
        error: { code: "GET_ONLY_FIXTURE", message: "No writes allowed." },
      };
    } else if (path === "/session") {
      body = {
        organization: {
          id: `synthetic-workspace-${state.sessionIdentity}`,
          name: `Synthetic workspace ${state.id}`,
        },
        user: {
          id: `synthetic-user-${state.sessionIdentity}`,
          name: `Synthetic account ${state.id}`,
          role: "admin",
          preferredLocale: "en",
        },
        csrfToken: `synthetic-overview-fixture-${state.id}`,
        simulation: true,
      } satisfies Session;
    } else if (path === "/capabilities") body = { simulation: true };
    else {
      const read: Read | undefined =
        path === "/overview"
          ? "overview"
          : path === "/dispatches" && url.searchParams.get("limit") === "6"
            ? "dispatches"
            : path === "/attention"
              ? "attention"
              : path === "/connections"
                ? "connections"
                : path === "/account/contacts"
                  ? "contacts"
                  : undefined;
      if (read) {
        state.reads[read] += 1;
        await state.gates[read].pending;
        if (read === "attention" && state.attentionFailed) {
          status = 503;
          body = {
            error: {
              code: "SYNTHETIC_ATTENTION_FAILED",
              message: "Synthetic attention read unavailable.",
            },
          };
        } else if (read === "dispatches" && state.failedDispatches) {
          status = 503;
          body = {
            error: {
              code: "SYNTHETIC_DISPATCHES_FAILED",
              message: "Synthetic dispatch read unavailable.",
            },
          };
        } else if (read === "overview" && state.failed) {
          status = 503;
          body = {
            error: {
              code: "SYNTHETIC_READ_FAILED",
              message: "Synthetic overview read unavailable.",
            },
          };
        } else if (read === "overview") body = state.overview;
        else if (read === "dispatches")
          body = { items: state.dispatches, nextCursor: null };
        else if (read === "attention")
          body = {
            items: state.attention,
            nextCursor: null,
            observedAt: "2026-11-10T00:00:00.000Z",
          };
        else if (read === "connections") body = { items: [], nextCursor: null };
        else body = { items: state.contacts, hasMore: false };
      } else if (
        path === "/dispatches" &&
        url.searchParams.get("group") === "approval"
      ) {
        body = { items: state.dispatches, nextCursor: null };
      } else {
        unexpected.push(`${request.method()} ${url.pathname}${url.search}`);
        status = 503;
        body = {
          error: {
            code: "FIXTURE_MISSING",
            message: "Unexpected fixture read.",
          },
        };
      }
    }
    await route.fulfill({ status, json: body });
  });
  return {
    async open() {
      await page.goto("/#/app", { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect
        .poll(() => initial.reads)
        .toEqual({
          overview: 1,
          dispatches: 1,
          attention: 1,
          connections: 1,
          contacts: 1,
        });
    },
    async replace(next: Scope) {
      scopes.push(next);
      current = next;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(
        page.locator(".sidebar .workspace-identity-trigger"),
      ).toContainText(`Synthetic account ${next.id}`);
      await expect.poll(() => next.reads.overview).toBeGreaterThan(0);
      await expect.poll(() => next.reads.dispatches).toBeGreaterThan(0);
    },
    clean() {
      expect(writes).toEqual([]);
      expect(unexpected).toEqual([]);
    },
    releaseAll() {
      for (const state of scopes)
        for (const read of Object.values(state.gates)) read.release();
    },
  };
}

const statsSelector = ".overview-stats";
const approvalSelector = `${statsSelector} a[href="#/app/dispatches?group=approval"]`;

async function captureTarget(page: Page, touch: boolean) {
  const anchor = page.locator(approvalSelector);
  await expect(anchor).toBeVisible();
  await anchor.scrollIntoViewIfNeeded();
  if (!touch) await anchor.focus();
  const node = await anchor.elementHandle();
  expect(node).not.toBeNull();
  const box = await anchor.boundingBox();
  expect(box).not.toBeNull();
  const scrollY = await page.evaluate(() => window.scrollY);
  return { anchor, node: node!, box: box!, scrollY };
}

async function activateUnmovedTarget(
  page: Page,
  target: Awaited<ReturnType<typeof captureTarget>>,
  touch: boolean,
) {
  expect(
    await target.node.evaluate(
      (node, selector) =>
        node.isConnected && document.querySelector(selector) === node,
      approvalSelector,
    ),
  ).toBe(true);
  expect(await target.anchor.boundingBox()).toEqual(target.box);
  expect(await page.evaluate(() => window.scrollY)).toBe(target.scrollY);
  if (touch)
    await page.touchscreen.tap(
      target.box.x + target.box.width / 2,
      target.box.y + target.box.height / 2,
    );
  else {
    await expect(target.anchor).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page).toHaveURL(/#\/app\/dispatches\?group=approval$/);
  await expect(
    page
      .getByRole("navigation", { name: "Show", exact: true })
      .getByRole("link", { name: "Awaiting approval", exact: true }),
  ).toHaveAttribute("aria-current", "page");
}

async function expectBefore(first: Locator, second: Locator) {
  const secondNode = await second.elementHandle();
  expect(secondNode).not.toBeNull();
  expect(
    await first.evaluate(
      (node, other) =>
        Boolean(
          node.compareDocumentPosition(other!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      secondNode,
    ),
  ).toBe(true);
}

test("parallel overview reads reveal stable daily navigation before late attention rows", async ({
  page,
  isMobile,
}) => {
  const state = scope("daily");
  const app = await fixture(page, state);
  try {
    await app.open();
    await expect(page.locator(statsSelector)).toBeHidden();
    state.gates.overview.release();
    await expect(page.locator(`${statsSelector} strong`).first()).toHaveText(
      "2",
    );
    await expect(page.locator(statsSelector)).toBeHidden();
    state.gates.dispatches.release();
    const target = await captureTarget(page, isMobile);
    await expect(page.locator(".assistant-welcome")).toBeHidden();
    const recent = page
      .locator(`a[href="#/app/dispatch/synthetic-dispatch-${state.id}"]`)
      .first();
    await expect(recent).toBeHidden();
    populateAttention(state);
    state.gates.attention.release();
    await expect(page.locator(".lifecycle-attention-list > li")).toHaveCount(4);
    await expect(recent).toBeVisible();
    await activateUnmovedTarget(page, target, isMobile);
    app.clean();
  } finally {
    app.releaseAll();
  }
});

test("attention refresh keeps the same daily summary anchor and saved tap coordinates", async ({
  page,
  isMobile,
}) => {
  const state = scope("refresh");
  const app = await fixture(page, state);
  try {
    await app.open();
    app.releaseAll();
    await expect(page.locator(".lifecycle-attention")).toContainText(
      "Nothing needs attention.",
    );
    await expect(page.locator(statsSelector)).toBeVisible();
    state.gates.attention = gate();
    await page
      .locator(".lifecycle-attention")
      .getByRole("button", { name: "Refresh", exact: true })
      .click();
    await expect.poll(() => state.reads.attention).toBe(2);
    const target = await captureTarget(page, isMobile);
    populateAttention(state);
    state.gates.attention.release();
    await expect(page.locator(".lifecycle-attention-list > li")).toHaveCount(4);
    await activateUnmovedTarget(page, target, isMobile);
    app.clean();
  } finally {
    app.releaseAll();
  }
});

test("an empty workspace resolves its assistant introduction before stable summary navigation", async ({
  page,
  isMobile,
}) => {
  const state = scope("empty", false);
  const app = await fixture(page, state);
  try {
    await app.open();
    const mainReads = Promise.all([
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/overview",
      ),
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/dispatches",
      ),
    ]);
    state.gates.overview.release();
    state.gates.dispatches.release();
    await mainReads;
    await expect(page.locator(`${statsSelector} strong`).first()).toHaveText(
      "0",
    );
    await expect(page.locator(statsSelector)).toBeHidden();
    state.gates.connections.release();
    const welcome = page.locator(".assistant-welcome");
    await expect(welcome).toBeVisible();
    await expectBefore(welcome, page.locator(statsSelector));
    const target = await captureTarget(page, isMobile);
    populateContacts(state);
    populateAttention(state);
    state.gates.contacts.release();
    state.gates.attention.release();
    await expect(page.locator(".workspace-contact-list > li")).toHaveCount(3);
    await expect(page.locator(".lifecycle-attention-list > li")).toHaveCount(4);
    await activateUnmovedTarget(page, target, isMobile);
    app.clean();
  } finally {
    app.releaseAll();
  }
});

test("retrying an initial attention failure retains mounted recent controls and stable summary navigation", async ({
  page,
  isMobile,
}) => {
  const state = scope("attention-recovery");
  state.attentionFailed = true;
  const app = await fixture(page, state);
  try {
    await app.open();
    app.releaseAll();
    const failure = page.locator(".lifecycle-attention").getByRole("alert");
    await expect(failure).toContainText(
      "Synthetic attention read unavailable.",
    );
    const recent = page
      .locator(`a[href="#/app/dispatch/synthetic-dispatch-${state.id}"]`)
      .first();
    await expect(recent).toBeVisible();
    const recentNode = await recent.elementHandle();
    expect(recentNode).not.toBeNull();
    state.attentionFailed = false;
    state.gates.attention = gate();
    await failure
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    await expect.poll(() => state.reads.attention).toBe(2);
    await expect(recent).toBeVisible();
    expect(await recentNode!.evaluate((node) => node.isConnected)).toBe(true);
    const target = await captureTarget(page, isMobile);
    populateAttention(state);
    state.gates.attention.release();
    await expect(page.locator(".lifecycle-attention-list > li")).toHaveCount(4);
    await expect(failure).toHaveCount(0);
    expect(await recentNode!.evaluate((node) => node.isConnected)).toBe(true);
    await activateUnmovedTarget(page, target, isMobile);
    app.clean();
  } finally {
    app.releaseAll();
  }
});

test("a failed initial read exposes recovery without inventing an empty workspace", async ({
  page,
  isMobile,
}) => {
  const state = scope("recovery", false);
  state.failed = true;
  state.failedDispatches = true;
  const app = await fixture(page, state);
  try {
    await app.open();
    app.releaseAll();
    const failure = page
      .getByRole("alert")
      .filter({ hasText: "Synthetic overview read unavailable." });
    await expect(failure).toBeVisible();
    await expect(page.locator(".assistant-welcome")).toBeHidden();
    const emptyDispatches = page.getByRole("heading", {
      name: "Your first dispatch starts here.",
      exact: true,
    });
    await expect(emptyDispatches).toHaveCount(0);
    state.failed = false;
    state.failedDispatches = false;
    state.gates.overview = gate();
    state.gates.dispatches = gate();
    await failure
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    await expect(failure).toHaveCount(0);
    await expect.poll(() => state.reads.overview).toBe(2);
    await expect.poll(() => state.reads.dispatches).toBe(2);
    await expect(emptyDispatches).toHaveCount(0);
    state.gates.overview.release();
    state.gates.dispatches.release();
    await expect(emptyDispatches).toBeVisible();
    state.gates.attention = gate();
    await page
      .locator(".lifecycle-attention")
      .getByRole("button", { name: "Refresh", exact: true })
      .click();
    await expect.poll(() => state.reads.attention).toBe(2);
    const currentTarget = await captureTarget(page, isMobile);
    populateAttention(state);
    state.gates.attention.release();
    await expect(page.locator(".lifecycle-attention-list > li")).toHaveCount(4);
    await activateUnmovedTarget(page, currentTarget, isMobile);
    app.clean();
  } finally {
    app.releaseAll();
  }
});

test("a replacement authority resolves its own layout instead of inheriting the prior daily order", async ({
  page,
}) => {
  const first = scope("A");
  const app = await fixture(page, first);
  try {
    await app.open();
    app.releaseAll();
    await expect(page.locator(statsSelector)).toBeVisible();
    await expect(page.locator(".assistant-welcome")).toBeHidden();
    const next = scope("B", false);
    // Rotate credentials without changing the user/workspace component key.
    next.sessionIdentity = first.sessionIdentity;
    await app.replace(next);
    await expect(page.locator(statsSelector)).toBeHidden();
    next.gates.overview.release();
    next.gates.dispatches.release();
    await expect(page.locator(`${statsSelector} strong`).first()).toHaveText(
      "0",
    );
    await expect(page.locator(statsSelector)).toBeHidden();
    next.gates.connections.release();
    const welcome = page.locator(".assistant-welcome");
    await expect(welcome).toBeVisible();
    await expect(page.locator(statsSelector)).toBeVisible();
    await expectBefore(welcome, page.locator(statsSelector));
    app.clean();
  } finally {
    app.releaseAll();
  }
});
