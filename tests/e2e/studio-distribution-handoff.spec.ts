import { expect, test, type Page } from "@playwright/test";
import { documentAnalysis } from "../../packages/contracts/src/document-analysis";

const debugStates = new WeakMap<Page, () => unknown>();
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const state = debugStates.get(page)?.();
    await info.attach("fixture-state", {
      body: JSON.stringify(state),
      contentType: "application/json",
    });
  }
});

const jobId = "handoff-generation";
const recordId = (ordinal: number) =>
  `record-${String(ordinal).padStart(3, "0")}`;
const sourceUrl = (selection: number[] = []) =>
  `/#/app/studio/generation/${jobId}${selection.length ? "?" + selection.map((value) => "selected=" + recordId(value)).join("&") : ""}`;
const preparationUrl = (selection: number[] = [1, 2]) =>
  `/#/app/distribution/new?generation=${jobId}&${selection.map((value) => "selected=" + recordId(value)).join("&")}`;

// The static built application receives every API response from these fixtures.
// No D1 reset, provider, approval, confirmation or real communication is involved.
async function fixture(
  page: Page,
  options: {
    role?: "admin" | "viewer";
    unavailable?: number;
    holdPost?: boolean;
    postal?: boolean;
    specialId?: string;
  } = {},
) {
  const state = {
    workspace: "first",
    reads: [] as URL[],
    writes: [] as { path: string; body: unknown }[],
    unexpected: [] as string[],
    errors: [] as string[],
    assets: [] as string[],
  };
  debugStates.set(page, () => ({
    workspace: state.workspace,
    readPaths: state.reads.map((url) => url.pathname),
    writePaths: state.writes.map((write) => write.path),
    unexpected: state.unexpected,
    errors: state.errors,
    assets: state.assets,
  }));
  let releasePost!: () => void;
  const heldPost = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  page.on("pageerror", (error) => state.errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/assets/")) state.assets.push(path);
  });
  const result = (ordinal: number) => ({
    recordId:
      ordinal === 1 && options.specialId
        ? options.specialId
        : recordId(ordinal),
    state: "generated",
    attempts: 1,
    inputHash: "a".repeat(64),
    documentId: `document-${ordinal}`,
    documentHash: "b".repeat(64),
    documentStatus: options.unavailable === ordinal ? "quarantined" : "ready",
    documentAnalysis: documentAnalysis(
      options.unavailable === ordinal ? "quarantined" : "ready",
    ),
    documentUrl: null,
    errorCode: null,
  });
  const job = {
    id: jobId,
    templateId: "handoff-template",
    templateVersion: 2,
    datasetId: null,
    mappingId: null,
    mappingVersion: null,
    mode: "generate_only",
    state: "completed",
    total: 500,
    generated: 500,
    failed: 0,
    pending: 0,
    cancelled: 0,
    createdAt: "2026-10-29T10:00:00Z",
    updatedAt: "2026-10-29T10:00:00Z",
  };
  const plan = {
    id: "handoff-plan",
    jobId,
    manifestHash: "c".repeat(64),
    createdAt: job.createdAt,
    pendingCount: 0,
    errorCount: 0,
    entries: [
      {
        entryId: "record-0-destination-0",
        recordId: recordId(1),
        documentId: "document-1",
        documentHash: "b".repeat(64),
        channel: options.postal ? "postal" : "fax",
        recipient: options.postal
          ? { address: "Synthetic address" }
          : { phone: "+33123456789" },
        templateVersion: 2,
        dispatchId: options.postal ? null : "handoff-dispatch",
        errorCode: null,
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(4);
    if (request.method() !== "GET") {
      state.writes.push({ path, body: request.postDataJSON() });
      if (
        path ===
          "/distribution-plans/handoff-plan/entries/record-0-destination-0/postal-preflight" &&
        request.method() === "POST" &&
        options.postal
      ) {
        if (options.holdPost) await heldPost;
        return route.fulfill({
          json: {
            ...plan,
            entries: plan.entries.map((entry) => ({
              ...entry,
              postalReviewId: "held-postal-review",
            })),
          },
        });
      }
      if (path === "/distribution-plans" && request.method() === "POST") {
        if (options.holdPost) await heldPost;
        return route.fulfill({ status: 201, json: plan });
      }
      state.unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({
        status: 403,
        json: { error: { code: "FORBIDDEN" } },
      });
    }
    state.reads.push(url);
    let body: unknown;
    if (path === "/session")
      body = {
        organization: {
          id: state.workspace,
          name:
            state.workspace === "first" ? "First workspace" : "Other workspace",
        },
        user: {
          id: "handoff-owner",
          name: "Camille Example",
          role: options.role ?? "admin",
          preferredLocale: "fr",
        },
        simulation: true,
        csrfToken: `csrf-${state.workspace}`,
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
    else if (
      [
        "/templates",
        "/documents",
        "/dispatches",
        "/contacts",
        "/connections",
        "/senders",
      ].includes(path)
    )
      body = { items: [], nextCursor: null };
    else if (path === "/dataset-ai-policy")
      body = {
        enabled: false,
        transferApproved: false,
        configured: false,
        dailyLimit: 0,
        usedToday: 0,
      };
    else if (path.startsWith("/generation-jobs/")) {
      if (
        state.workspace !== "first" ||
        !path.startsWith(`/generation-jobs/${jobId}`)
      )
        return route.fulfill({
          status: 404,
          json: {
            error: {
              code: "GENERATION_NOT_FOUND",
              message: "Private batch not found.",
            },
          },
        });
      if (path === `/generation-jobs/${jobId}`) body = job;
      else if (path.endsWith("/results") || path.endsWith("/record-context")) {
        const after = Number(
          url.searchParams.get("cursor")?.split("-").at(-1) ?? 0,
        );
        const limit = Math.min(
          50,
          Number(
            url.searchParams.get("limit") ??
              (path.endsWith("/results") ? 30 : 50),
          ),
        );
        const ordinals = Array.from(
          { length: Math.min(limit, 500 - after) },
          (_, index) => after + index + 1,
        );
        body = {
          items: path.endsWith("/results")
            ? ordinals.map(result)
            : ordinals.map((ordinal) => ({
                recordId:
                  ordinal === 1 && options.specialId
                    ? options.specialId
                    : recordId(ordinal),
                name: `Person ${ordinal}`,
                subject: `Subject ${ordinal}`,
                reference: `REF-${ordinal}`,
              })),
          nextCursor: after + limit < 500 ? recordId(after + limit) : null,
        };
      }
    } else if (path === "/distribution-plans/handoff-plan") body = plan;
    if (body === undefined) {
      state.unexpected.push(`GET ${path}`);
      return route.fulfill({
        status: 404,
        json: { error: { code: "UNEXPECTED_FIXTURE_REQUEST" } },
      });
    }
    return route.fulfill({ json: body });
  });
  return { state, releasePost };
}
const destination = (page: Page, ordinal: number) =>
  page.getByRole("group", {
    name: `Documents concernés par la destination ${ordinal}`,
    exact: true,
  });
const application = (page: Page) =>
  page.locator(".sidebar .application-switcher > button");

test("Studio hands the selected IDs to Correspondence and native Back/Forward retains them without a write", async ({
  page,
}) => {
  const { state } = await fixture(page);
  await page.goto(sourceUrl());
  for (const value of [1, 2])
    await page
      .getByRole("checkbox", {
        name: new RegExp(`^Sélectionner ${recordId(value)}(?: ·|$)`),
      })
      .check();
  await page
    .getByRole("button", { name: "Préparer une distribution (2)", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      "#/app/distribution/new\\?generation=handoff-generation&selected=record-001&selected=record-002$",
    ),
  );
  await expect(application(page)).toContainText("Correspondance");
  await expect(
    destination(page, 1).getByRole("checkbox").first(),
  ).not.toBeChecked();
  expect(state.writes).toEqual([]);
  await page.goBack();
  await expect(application(page)).toContainText("Studio");
  for (const value of [1, 2])
    await expect(
      page.getByRole("checkbox", {
        name: new RegExp(`^Sélectionner ${recordId(value)}(?: ·|$)`),
      }),
    ).toBeChecked();
  await page.goForward();
  await expect(application(page)).toContainText("Correspondance");
  await expect(
    destination(page, 1).getByRole("checkbox").first(),
  ).not.toBeChecked();
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("a direct selected record beyond row 300 is revalidated in bounded 50-record pages and survives reload", async ({
  page,
}, info) => {
  const { state } = await fixture(page);
  await page.goto(preparationUrl([1, 350]));
  await expect(
    destination(page, 1).getByRole("checkbox", { name: /Person 350/ }),
  ).toBeVisible();
  const resultReads = state.reads.filter((url) =>
    url.pathname.endsWith("/results"),
  );
  expect(resultReads).toHaveLength(7);
  expect(
    resultReads.every((url) => url.searchParams.get("limit") === "50"),
  ).toBe(true);
  expect(
    state.reads
      .filter((url) => url.pathname.endsWith("/record-context"))
      .every((url) => url.searchParams.get("limit") === "50"),
  ).toBe(true);
  expect(
    state.assets.some((path) =>
      /document-studio|template-designer|pdf-viewer|pdf\.worker|belvedere-globe/.test(
        path,
      ),
    ),
  ).toBe(false);
  await page.reload();
  await expect(
    destination(page, 1).getByRole("checkbox", { name: /Person 350/ }),
  ).not.toBeChecked();
  expect(state.writes).toEqual([]);
  const metrics = await page.evaluate(() => ({
    firstUsefulObservedMs: performance.now(),
    resources: performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        path: new URL(resource.name).pathname,
        transferSize: resource.transferSize,
        decodedBodySize: resource.decodedBodySize,
      };
    }),
  }));
  await page.screenshot({
    path: info.outputPath("correspondence-preparation.png"),
    fullPage: true,
  });
  await info.attach("correspondence-preparation-loading", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("even a single PDF starts unchecked for every newly added destination", async ({
  page,
}) => {
  const { state } = await fixture(page);
  await page.goto(preparationUrl([1]));
  const first = destination(page, 1).getByRole("checkbox");
  await expect(first).not.toBeChecked();
  await first.check();
  await page
    .getByRole("button", {
      name: "Ajouter une destination ou un canal",
      exact: true,
    })
    .click();
  await expect(destination(page, 2).getByRole("checkbox")).not.toBeChecked();
  await expect(first).toBeChecked();
  expect(state.writes).toEqual([]);
});

test("an unsaved preparation can veto departure and confirmed close restores its Studio selection", async ({
  page,
}) => {
  const { state } = await fixture(page);
  await page.goto(preparationUrl([1]));
  await destination(page, 1).getByRole("checkbox").check();
  await page
    .getByLabel("Numéro international", { exact: true })
    .fill("+33123456789");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/distribution\/new\?/);
  await expect(
    page.getByLabel("Numéro international", { exact: true }),
  ).toHaveValue("+33123456789");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page).toHaveURL(
    /#\/app\/studio\/generation\/handoff-generation\?selected=record-001$/,
  );
  await expect(
    page.getByRole("checkbox", { name: /^Sélectionner record-001(?: ·|$)/ }),
  ).toBeChecked();
  expect(state.writes).toEqual([]);
});

for (const denied of ["foreign", "unavailable", "viewer"] as const) {
  test(`a ${denied} selection cannot expose a preparation form or create a plan`, async ({
    page,
  }) => {
    const { state } = await fixture(page, {
      ...(denied === "viewer" ? { role: "viewer" as const } : {}),
      ...(denied === "unavailable" ? { unavailable: 1 } : {}),
    });
    await page.goto(
      denied === "foreign"
        ? preparationUrl([1]).replace(jobId, "foreign-generation")
        : preparationUrl([1]),
    );
    await expect(
      page.getByRole("button", {
        name: "Préparer les associations et les devis",
        exact: true,
      }),
    ).toHaveCount(0);
    if (denied === "viewer")
      await expect(
        page.getByRole("note").filter({ hasText: "Votre rôle" }),
      ).toBeVisible();
    else if (denied === "unavailable")
      await expect(page.getByRole("alert")).toContainText(
        "Les PDF sélectionnés",
      );
    else
      await expect(page.getByRole("alert")).toContainText(
        "Private batch not found.",
      );
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
    expect(state.errors).toEqual([]);
  });
}

test("a late preparation response cannot navigate after an accepted departure while the next module is held", async ({
  page,
}) => {
  const { state, releasePost } = await fixture(page, { holdPost: true });
  let releaseStudio!: () => void;
  const studioHeld = new Promise<void>((resolve) => {
    releaseStudio = resolve;
  });
  await page.route(/\/assets\/document-studio-[^/]+\.js$/, async (route) => {
    await studioHeld;
    try {
      await route.continue();
    } catch {
      /* The visit may have ended while code was pending. */
    }
  });
  try {
    await page.goto(preparationUrl([1]));
    await destination(page, 1).getByRole("checkbox").check();
    await page
      .getByLabel("Numéro international", { exact: true })
      .fill("+33123456789");
    const post = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/distribution-plans",
    );
    await page
      .getByRole("button", {
        name: "Préparer les associations et les devis",
        exact: true,
      })
      .click();
    await post;
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(page).toHaveURL(/#\/app\/studio\/generation\//);
    const response = page.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        result.url().endsWith("/api/distribution-plans"),
    );
    releasePost();
    await response;
    releaseStudio();
    await expect(application(page)).toContainText("Studio");
    await expect(page).toHaveURL(/#\/app\/studio\/generation\//);
    expect(state.writes).toHaveLength(1);
    expect(state.errors).toEqual([]);
  } finally {
    releasePost();
    releaseStudio();
  }
});

test("a frozen legacy plan loads in Correspondence without fetching Studio implementation or styles", async ({
  page,
}) => {
  const { state } = await fixture(page);
  await page.goto("/#/app/distribution/handoff-plan");
  await expect(
    page.getByRole("heading", { name: "Distribution préparée", exact: true }),
  ).toBeVisible();
  await expect(application(page)).toContainText("Correspondance");
  await expect(
    page.getByRole("link", {
      name: "Vérifier le devis et approuver",
      exact: true,
    }),
  ).toHaveAttribute("href", "#/app/dispatch/handoff-dispatch");
  expect(
    state.assets.some((path) =>
      /document-studio|template-designer|pdf-viewer|pdf\.worker/.test(path),
    ),
  ).toBe(false);
  expect(
    state.reads.some((url) => url.pathname.startsWith("/api/generation-jobs")),
  ).toBe(false);
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test("an old response stays obsolete after leaving and returning to the same preparation, while a new explicit action works", async ({
  page,
}) => {
  const { state, releasePost } = await fixture(page, { holdPost: true });
  let releaseStudio!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseStudio = resolve;
  });
  await page.route(/\/assets\/document-studio-[^/]+\.js$/, async (route) => {
    await held;
    await route.continue().catch(() => undefined);
  });
  try {
    await page.goto(preparationUrl([1]));
    await destination(page, 1).getByRole("checkbox").check();
    await page
      .getByLabel("Numéro international", { exact: true })
      .fill("+33123456789");
    const submit = page.getByRole("button", {
      name: "Préparer les associations et les devis",
      exact: true,
    });
    await submit.click();
    await expect.poll(() => state.writes.length).toBe(1);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(page).toHaveURL(/#\/app\/studio\/generation\//);
    page.once("dialog", (dialog) => dialog.accept());
    await page.evaluate(
      (url) => {
        window.location.hash = url.split("#")[1];
      },
      preparationUrl([1]),
    );
    await expect(page).toHaveURL(/#\/app\/distribution\/new\?/);
    releasePost();
    await expect(submit).toBeEnabled();
    await expect(page).toHaveURL(/#\/app\/distribution\/new\?/);
    await submit.click();
    await expect(page).toHaveURL(/#\/app\/distribution\/handoff-plan$/);
    expect(state.writes).toHaveLength(2);
    expect(state.unexpected).toEqual([]);
  } finally {
    releasePost();
    releaseStudio();
  }
});

test("a preparation reply cannot revive a departed workspace", async ({
  page,
}) => {
  const { state, releasePost } = await fixture(page, { holdPost: true });
  try {
    await page.goto(preparationUrl([1]));
    await destination(page, 1).getByRole("checkbox").check();
    await page
      .getByLabel("Numéro international", { exact: true })
      .fill("+33123456789");
    await page
      .getByRole("button", {
        name: "Préparer les associations et les devis",
        exact: true,
      })
      .click();
    await expect.poll(() => state.writes.length).toBe(1);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(application(page)).toContainText("Studio");
    state.workspace = "other";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".sidebar")).toContainText("Other workspace");
    await expect(page).toHaveURL(/#\/app\/studio\/templates$/);
    const response = page.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        result.url().endsWith("/api/distribution-plans"),
    );
    releasePost();
    await response;
    await expect(page).toHaveURL(/#\/app\/studio\/templates$/);
    await expect(page.locator(".sidebar")).toContainText("Other workspace");
    expect(state.writes).toHaveLength(1);
  } finally {
    releasePost();
  }
});

test("a late postal check cannot navigate after leaving the frozen plan", async ({
  page,
}) => {
  const { state, releasePost } = await fixture(page, {
    postal: true,
    holdPost: true,
  });
  try {
    await page.goto("/#/app/distribution/handoff-plan");
    await page
      .getByRole("button", { name: "Contrôler cette lettre", exact: true })
      .click();
    await expect.poll(() => state.writes.length).toBe(1);
    await page
      .getByRole("link", { name: "Revenir aux PDF", exact: true })
      .click();
    await expect(application(page)).toContainText("Studio");
    const response = page.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        result.url().includes("/postal-preflight"),
    );
    releasePost();
    await response;
    await expect(page).toHaveURL(/#\/app\/studio\/generation\//);
    expect(state.writes).toHaveLength(1);
    expect(state.errors).toEqual([]);
    expect(state.unexpected).toEqual([]);
  } finally {
    releasePost();
  }
});

test("a valid prototype-named business record retains its label and can be selected", async ({
  page,
}) => {
  const { state } = await fixture(page, { specialId: "__proto__" });
  await page.goto(
    `/#/app/distribution/new?generation=${jobId}&selected=__proto__`,
  );
  const selected = destination(page, 1).getByRole("checkbox", {
    name: /Person 1/,
  });
  await expect(selected).not.toBeChecked();
  await selected.check();
  await expect(selected).toBeChecked();
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test("coalesced A to B to A hash events never revive the earlier preparation reply", async ({
  page,
}) => {
  const { state, releasePost } = await fixture(page, { holdPost: true });
  let releaseStudio!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseStudio = resolve;
  });
  await page.route(/\/assets\/document-studio-[^/]+\.js$/, async (route) => {
    await held;
    await route.continue().catch(() => undefined);
  });
  try {
    await page.goto(preparationUrl([1]));
    await destination(page, 1).getByRole("checkbox").check();
    await page
      .getByLabel("Numéro international", { exact: true })
      .fill("+33123456789");
    const submit = page.getByRole("button", {
      name: "Préparer les associations et les devis",
      exact: true,
    });
    await submit.click();
    await expect.poll(() => state.writes.length).toBe(1);
    page.on("dialog", (dialog) => dialog.accept());
    await page.evaluate(async () => {
      const original = window.location.hash;
      await new Promise<void>((resolve) => {
        let events = 0;
        const observed = () => {
          if (++events === 2) {
            window.removeEventListener("hashchange", observed);
            resolve();
          }
        };
        window.addEventListener("hashchange", observed);
        window.location.hash = "/app/studio/templates";
        window.location.hash = original;
      });
    });
    releasePost();
    await expect(submit).toBeEnabled();
    await expect(page).toHaveURL(/#\/app\/distribution\/new\?/);
    expect(state.writes).toHaveLength(1);
    expect(state.errors).toEqual([]);
  } finally {
    releasePost();
    releaseStudio();
  }
});
