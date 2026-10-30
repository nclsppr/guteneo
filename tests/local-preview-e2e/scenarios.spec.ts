import { expect, test, type Page } from "@playwright/test";

function observeBackend(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^\/(api|auth|oauth|mcp)(\/|$)/.test(new URL(request.url()).pathname))
      requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return requests;
}
async function applyScenario(
  page: Page,
  account: string,
  volume: string,
  seed: string,
) {
  const controls = page.locator(".local-preview-controls");
  if (!(await controls.getAttribute("open"))) {
    if (
      !(await controls.evaluate((element: HTMLDetailsElement) => element.open))
    )
      await controls.locator("summary").click();
  }
  await controls
    .getByRole("combobox", { name: "Demo account", exact: true })
    .selectOption(account);
  await controls
    .getByRole("combobox", { name: "Data volume", exact: true })
    .selectOption(volume);
  await controls.getByRole("textbox", { name: "Seed", exact: true }).fill(seed);
  await controls
    .getByRole("button", { name: "Apply scenario", exact: true })
    .click();
  await expect(
    controls.getByRole("form", { name: "Local simulation", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  return controls;
}
async function counts(page: Page): Promise<Record<string, number>> {
  return page
    .locator(".local-preview-controls dd[data-collection]")
    .evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => [
          element.getAttribute("data-collection"),
          Number(element.textContent?.replace(/\D/g, "")),
        ]),
      ),
    );
}
async function openApplication(page: Page, name: string) {
  await page.getByRole("button", { name: /^Application:/ }).click();
  await page
    .getByRole("navigation", { name: "Applications", exact: true })
    .getByRole("link", { name, exact: true })
    .click();
}

test("local personal clients render a fictional page without backend requests and fence old actors", async ({
  page,
}) => {
  const backendRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (/^\/(api|auth|oauth|mcp)(\/|$)/.test(new URL(request.url()).pathname))
      backendRequests.push(
        `${request.method()} ${new URL(request.url()).pathname}`,
      );
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?lang=en#/app");
  await expect(page.locator("main h1")).toBeVisible();
  const result = await page.evaluate(async () => {
    // This case specifically qualifies the DEV adapters. The following cases
    // exercise the visible profile controls and normal application navigation.
    const previewModule = "/src/preview.ts";
    const personalModule = "/src/personal-api.ts";
    const { publicPreview } = await import(previewModule);
    if (!publicPreview.advancedLocal)
      throw new Error(
        "This suite requires the loopback DEV browser-only preview.",
      );
    const counts = {
      documents: 1000,
      dispatches: 1000,
      templates: 1000,
      datasets: 1000,
      generations: 1000,
    };
    await publicPreview.configure({
      account: "viewer",
      seed: "personal-browser-proof",
      counts,
    });
    const { personalApi, personalBlob } = await import(personalModule);
    const session = await personalApi("/personal/session");
    const list = await personalApi("/personal/documents", session);
    const active = list.items.find(
      (item: { status: string }) => item.status === "active",
    );
    if (!active) throw new Error("The fictional page fixture is missing.");
    const detail = await personalApi(
      `/personal/documents/${active.id}`,
      session,
    );
    const text = await personalApi(
      `/personal/documents/${active.id}/pages/1/text`,
      session,
    );
    const blob = await personalBlob(
      `/personal/documents/${active.id}/pages/1`,
      session,
      { expectedType: "image" },
    );
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.src = url;
    await image.decode();
    const dimensions = {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    URL.revokeObjectURL(url);
    await publicPreview.configure({
      account: "member",
      seed: "personal-browser-proof",
      counts,
    });
    let staleCode: string | undefined;
    try {
      await personalApi("/personal/documents", session);
    } catch (error) {
      staleCode = (error as { code?: string }).code;
    }
    return {
      simulation: session.simulation,
      verified: session.verifiedAccount,
      count: list.items.length,
      nextCursor: !!list.nextCursor,
      title: active.title,
      download: detail.allowOriginalDownload,
      deposit: detail.allowVaultDeposit,
      audit: detail.audit.length,
      text: text.text,
      type: blob.type,
      dimensions,
      staleCode,
    };
  });
  expect(result).toMatchObject({
    simulation: true,
    verified: false,
    count: 50,
    nextCursor: true,
    download: false,
    deposit: false,
    audit: 0,
    type: "image/png",
    staleCode: "PREVIEW_SCENARIO_CHANGED",
  });
  expect(result.title).toContain("Fictional received preview");
  expect(result.text).toContain(
    "No document has been delivered, received or deposited",
  );
  expect(result.dimensions).toEqual({ width: 1190, height: 1684 });
  expect(backendRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("visible scenario controls reproduce huge data without materializing the whole collection", async ({
  page,
}, info) => {
  const backend = observeBackend(page);
  await page.goto("/?lang=en#/app");
  const started = Date.now();
  await applyScenario(page, "admin", "extreme", "repeatable-extreme");
  await expect(page.locator(".overview-stats")).toBeVisible();
  const first = await counts(page);
  expect(Object.keys(first)).toHaveLength(5);
  for (const count of Object.values(first)) {
    expect(count).toBeGreaterThanOrEqual(1_000_000);
    expect(count).toBeLessThanOrEqual(1_000_000_000);
  }
  await expect(
    page.locator('.overview-stats a[href="#/app/documents"] strong'),
  ).toHaveText(String(first.documents));
  const usefulContentMs = Date.now() - started;
  await page.evaluate(() => {
    window.location.hash = "/app/documents";
  });
  await expect(page.locator(".data-table__count")).toContainText(
    "50 loaded rows",
  );
  await expect(page.locator(".data-table__grid tbody tr")).toHaveCount(10);
  const ids = await page
    .locator(".data-table__grid tbody .reference")
    .allTextContents();
  await applyScenario(page, "admin", "extreme", "repeatable-extreme");
  await expect(page.locator(".data-table__grid tbody tr")).toHaveCount(10);
  await expect
    .poll(() =>
      page.locator(".data-table__grid tbody .reference").allTextContents(),
    )
    .toEqual(ids);
  expect(await counts(page)).toEqual(first);
  await page
    .locator(".local-preview-controls")
    .getByRole("button", { name: "New random data", exact: true })
    .click();
  await expect(
    page
      .locator(".local-preview-controls")
      .getByRole("textbox", { name: "Seed", exact: true }),
  ).not.toHaveValue("repeatable-extreme");
  await expect.poll(() => counts(page)).not.toEqual(first);
  await expect(page.locator(".data-table__grid tbody tr")).toHaveCount(10);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(backend).toEqual([]);
  await page.screenshot({
    path: info.outputPath("local-scenario-controls.png"),
    fullPage: false,
  });
  await info.attach("fictional-extreme-scenario-measurement", {
    body: JSON.stringify({
      usefulContentMs,
      initialCounts: first,
      renderedRows: 10,
      loadedPageRows: 50,
      backendRequests: backend.length,
      environment: "Loopback DEV browser-only fixtures",
    }),
    contentType: "application/json",
  });
});

test("the five demo accounts retain the four real membership roles and expose Belvedere separately", async ({
  page,
}) => {
  const backend = observeBackend(page);
  await page.goto("/?lang=en#/app");
  await expect(
    page
      .locator(".local-preview-controls")
      .getByRole("combobox", { name: "Demo account", exact: true })
      .locator("option"),
  ).toHaveCount(5);
  for (const account of [
    "admin",
    "supervisor",
    "member",
    "viewer",
    "belvedere",
  ]) {
    await applyScenario(page, account, "small", "role-browser-proof");
    await expect(
      page.locator(".sidebar-account .workspace-identity-name"),
    ).toHaveText(
      account === "admin"
        ? "Camille · Demonstration"
        : `${account} · Fictional account`,
    );
    await expect(page.locator('.sidebar a[href="#/app/admin"]')).toHaveCount(
      account === "admin" ? 1 : 0,
    );
    await expect(page.locator('.sidebar a[href="#/app/usage"]')).toHaveCount(
      ["admin", "supervisor"].includes(account) ? 1 : 0,
    );
    await expect(page.locator('.sidebar a[href="#/app/prepare"]')).toHaveCount(
      ["admin", "supervisor", "member"].includes(account) ? 1 : 0,
    );
    await page.getByRole("button", { name: /^Application:/ }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Applications", exact: true })
        .getByRole("link", { name: "Belvédère", exact: true }),
    ).toHaveCount(account === "belvedere" ? 1 : 0);
    await page.getByRole("button", { name: /^Application:/ }).press("Escape");
  }
  expect(backend).toEqual([]);
});

test("Studio and My documents read the selected synthetic collections through normal application navigation", async ({
  page,
}) => {
  const backend = observeBackend(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?lang=en#/app");
  await applyScenario(page, "viewer", "large", "four-app-browser-proof");
  await expect(
    page.locator(".sidebar-account .workspace-identity-name"),
  ).toHaveText("viewer · Fictional account");
  await openApplication(page, "Studio");
  await expect(page.locator("main h1")).toHaveText("Templates");
  await expect(page.locator(".studio-list > article")).toHaveCount(50);
  await expect(page.locator(".studio-list > article h3").first()).toContainText(
    "Fictional",
  );
  await page.evaluate(() => {
    window.location.hash = "/app/studio/datasets";
  });
  await expect(page.locator("main h1")).toHaveText("Data");
  await expect(page.locator(".studio-list-row")).toHaveCount(50);
  await page.evaluate(() => {
    window.location.hash = "/app/studio/generations";
  });
  await expect(page.locator("main h1")).toHaveText("Generations");
  await expect(page.locator(".studio-list-row")).toHaveCount(50);
  await openApplication(page, "My documents");
  await expect(page.locator("main h1")).toHaveText("My documents");
  await expect(page.locator(".secure-document-list > li")).toHaveCount(50);
  await expect(page.getByRole("note")).toContainText(
    "accounts and documents are fictional",
  );
  const ordinal = Math.min(50_000, (await counts(page)).documents);
  expect(ordinal).toBeGreaterThan(50);
  const search = page.getByRole("searchbox", {
    name: "Search my documents",
    exact: true,
  });
  await search.fill(String(ordinal));
  await search.press("Enter");
  await expect(page.locator(".secure-document-list > li")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Show more documents", exact: true }),
  ).toHaveCount(0);
  await openApplication(page, "My documents");
  await expect(page.locator(".secure-document-list > li")).toHaveCount(50);
  const ready = page
    .locator(".secure-document-list > li")
    .filter({ has: page.getByText("Access available", { exact: true }) })
    .first();
  await ready
    .getByRole("link", { name: "Open the document", exact: true })
    .click();
  await expect(page.locator("main h1")).toContainText(
    "Fictional received preview",
  );
  await page.locator(".secure-document-page").scrollIntoViewIfNeeded();
  await expect(page.locator(".secure-document-page img")).toBeVisible();
  await page
    .getByRole("button", { name: "Show accessible text", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Accessible document text", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("region", { name: "Accessible document text", exact: true }),
  ).toContainText("No document has been delivered, received or deposited");
  expect(backend).toEqual([]);
  expect(errors).toEqual([]);
});

test("the Belvedere demo account opens seven read-only loopback views with the selected seed", async ({
  page,
}) => {
  const backend = observeBackend(page);
  await page.goto("/?lang=en#/app");
  await applyScenario(page, "belvedere", "extreme", "platform-browser-proof");
  await expect(
    page.locator(".sidebar-account .workspace-identity-name"),
  ).toHaveText("belvedere · Fictional account");
  await page.getByRole("button", { name: /^Application:/ }).click();
  const link = page
    .getByRole("navigation", { name: "Applications", exact: true })
    .getByRole("link", { name: "Belvédère", exact: true });
  const href = await link.getAttribute("href");
  const destination = new URL(href!, page.url());
  expect(["127.0.0.1", "localhost"]).toContain(destination.hostname);
  expect(destination.port).toBe("8794");
  const selected = await counts(page);
  if (destination.pathname === "/scenario") {
    expect(destination.searchParams.get("seed")).toBe("platform-browser-proof");
    expect(JSON.parse(destination.searchParams.get("counts")!)).toEqual(
      selected,
    );
  } else {
    const encoded = destination.pathname.split("/scenario/")[1];
    expect(encoded).toBeTruthy();
    expect(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    ).toMatchObject({ seed: "platform-browser-proof", counts: selected });
  }
  const popup =
    (await link.getAttribute("target")) === "_blank"
      ? page.waitForEvent("popup")
      : Promise.resolve(page);
  await link.click();
  const portal = await popup;
  const mutations: string[] = [];
  portal.on("request", (request) => {
    if (request.method() !== "GET") mutations.push(request.method());
  });
  await expect(portal.locator(".bv-demo")).toBeVisible();
  await expect(portal.locator("#belvedere-navigation a")).toHaveCount(7);
  for (const view of [
    "overview",
    "workshops",
    "jobs",
    "members",
    "connections",
    "finance",
    "infrastructure",
  ]) {
    const toggle = portal.locator(".bv-mobile-toggle");
    if (
      (await toggle.isVisible()) &&
      (await toggle.getAttribute("aria-expanded")) !== "true"
    )
      await toggle.click();
    const navigation = portal.locator(
      `#belvedere-navigation a[href="#${view}"]`,
    );
    await navigation.click();
    await expect(navigation).toHaveAttribute("aria-current", "page");
    await expect(portal.locator("main h1")).toHaveText(/\S/);
    await expect(portal.locator(".bv-loading")).toHaveCount(0);
    await expect(portal.getByRole("alert")).toHaveCount(0);
  }
  expect(mutations).toEqual([]);
  expect(backend).toEqual([]);
  if (portal !== page) await portal.close();
});
