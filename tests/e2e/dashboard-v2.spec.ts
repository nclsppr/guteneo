import { expect, test, type Page } from "./fixtures";
import {
  workspacePermissions,
  type WorkspaceRole,
} from "../../packages/contracts/src/roles";

async function login(page: Page, appearance?: "v2") {
  await page.goto(appearance ? "/?atelier=v2#/app" : "/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(page.locator("#main-content h1")).toBeVisible();
}

function observeWrites(page: Page) {
  const writes: { path: string; body: unknown; key: string | undefined }[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/") && request.method() !== "GET")
      writes.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()["idempotency-key"],
      });
  });
  return writes;
}

async function saveProfileAppearance(page: Page, appearance: "classic" | "v2") {
  await page.bringToFront();
  await page.locator("#dashboard-appearance").selectOption(appearance);
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/account" &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Enregistrer les modifications", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    appearance,
  );
}

async function returnToWorkspace(page: Page, appearance: "classic" | "v2") {
  await page.bringToFront();
  // Headless WebKit does not consistently dispatch the native focus event.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    appearance,
  );
}

test("account language and appearance save together, survive a fresh browser, and retain another tab's draft", async ({
  page,
  browser,
  context,
  baseURL,
}) => {
  await login(page);
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "classic",
  );
  await page.goto("/?lang=fr#/app/account");
  const preferences = page.locator(".account-display-preferences");
  await expect(preferences.locator('select[name="language"]')).toBeVisible();
  await expect(preferences.locator("#dashboard-appearance")).toBeVisible();
  await expect(page.locator(".sidebar #dashboard-appearance")).toHaveCount(0);
  const writes = observeWrites(page);
  await preferences.locator('select[name="language"]').selectOption("fr");
  await preferences.locator("#dashboard-appearance").selectOption("v2");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "classic",
  );
  expect(writes).toEqual([]);
  await saveProfileAppearance(page, "v2");
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("/api/account");
  expect(writes[0].body).toEqual(
    expect.objectContaining({
      preferredLocale: "fr",
      preferredDashboardAppearance: "v2",
    }),
  );
  expect(new URL(page.url()).searchParams.has("atelier")).toBe(false);
  await page.reload();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "v2",
  );

  const fresh = await browser.newContext({
    baseURL,
    storageState: { cookies: await context.cookies(), origins: [] },
  });
  try {
    const freshPage = await fresh.newPage();
    await freshPage.goto("/#/app/account");
    await expect(freshPage.locator(".workspace")).toHaveAttribute(
      "data-appearance",
      "v2",
    );
    await expect(freshPage.locator("#dashboard-appearance")).toHaveValue("v2");
  } finally {
    await fresh.close();
  }

  await page.goto("/?lang=fr#/app/prepare?channel=email");
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("draft@example.invalid");
  await page.getByLabel("Objet", { exact: true }).fill("Brouillon conservé");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Sans préparation ni envoi.");
  const settings = await context.newPage();
  await settings.goto("/#/app/account");
  const settingsWrites = observeWrites(settings);
  for (const appearance of ["classic", "v2"] as const) {
    await saveProfileAppearance(settings, appearance);
    await returnToWorkspace(page, appearance);
    await expect(page.getByLabel("Objet", { exact: true })).toHaveValue(
      "Brouillon conservé",
    );
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
      "Sans préparation ni envoi.",
    );
    expect(new URL(page.url()).hash).toBe("#/app/prepare?channel=email");
    expect(new URL(page.url()).searchParams.get("lang")).toBe("fr");
  }
  expect(writes.map((write) => write.path)).toEqual(["/api/account"]);
  expect(settingsWrites.map((write) => write.path)).toEqual([
    "/api/account",
    "/api/account",
  ]);
  await settings.close();
  await page.goto("/#/app/documents");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  await page.reload();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  expect(writes).toHaveLength(1);
});

test("V2 prepares through the existing API and requires explicit consent before simulated acceptance", async ({
  page,
}) => {
  await login(page);
  const settings = await page.context().newPage();
  await settings.goto("/#/app/account");
  await saveProfileAppearance(settings, "v2");
  await returnToWorkspace(page, "v2");
  await page.goto("/#/app/prepare?channel=email");
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("v2-consent@example.invalid");
  await page.getByLabel("Objet", { exact: true }).fill("Revue V2");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Correspondance de simulation V2.");
  const writes = observeWrites(page);
  const preparedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dispatches" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  const response = await preparedResponse;
  expect(response.status()).toBe(201);
  const prepared = (await response.json()) as {
    id: string;
    fingerprint: string;
  };
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  await expect(
    page
      .frameLocator(".email-preview")
      .getByText("Correspondance de simulation V2.", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("/api/dispatches");
  expect(writes[0].body).toEqual(
    expect.objectContaining({
      channel: "email",
      recipient: { email: "v2-consent@example.invalid" },
      subject: "Revue V2",
      text: "Correspondance de simulation V2.",
      ceilingMinor: 500,
    }),
  );
  expect(writes[0].body).not.toHaveProperty("appearance");
  expect(writes[0].body).not.toHaveProperty("atelier");

  const consent = page.locator(".approval-panel input[type=checkbox]").first();
  const approve = page.getByRole("button", {
    name: "Approuver et simuler l’envoi",
    exact: true,
  });
  await expect(consent).not.toBeChecked();
  await expect(approve).toBeDisabled();
  for (const appearance of ["classic", "v2"] as const) {
    await saveProfileAppearance(settings, appearance);
    await returnToWorkspace(page, appearance);
    expect(
      await page.locator(".content-preview").evaluate((content) => {
        const approval = document.querySelector(".approval-panel");
        return !!(
          approval &&
          content.compareDocumentPosition(approval) &
            Node.DOCUMENT_POSITION_FOLLOWING
        );
      }),
    ).toBe(true);
    await expect(consent).not.toBeChecked();
    await expect(approve).toBeDisabled();
  }
  expect(writes).toHaveLength(1);
  await consent.focus();
  await page.keyboard.press("Space");
  await saveProfileAppearance(settings, "classic");
  await returnToWorkspace(page, "classic");
  await expect(consent).toBeChecked();
  await saveProfileAppearance(settings, "v2");
  await returnToWorkspace(page, "v2");
  await expect(consent).toBeChecked();
  expect(writes).toHaveLength(1);
  await settings.close();

  const confirmed = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname ===
        `/api/dispatches/${prepared.id}/confirm` &&
      result.request().method() === "POST",
  );
  await approve.click();
  expect((await confirmed).ok()).toBe(true);
  expect(writes.map((write) => write.path)).toEqual([
    "/api/dispatches",
    `/api/dispatches/${prepared.id}/approve`,
    `/api/dispatches/${prepared.id}/confirm`,
  ]);
  expect(writes[1].body).toEqual({ fingerprint: prepared.fingerprint });
  expect(writes[2].body).toEqual({});
  expect(writes[2].key).toBe(`web-confirm:${prepared.id}`);
  await expect(page.locator(".simulation-banner")).toBeVisible();

  await page.goto("/#/app");
  const history = page.locator("#main-content table").first();
  await expect(
    history.locator(`a[href="#/app/dispatch/${prepared.id}"]`).first(),
  ).toBeVisible();
  await expect(page.locator(".dashboard-daily-shortcuts")).toBeVisible();
  await expect(page.locator(".assistant-welcome")).toHaveCount(0);
  expect(
    await history.evaluate((table) => {
      const support = document.querySelector(".dashboard-daily-shortcuts");
      return !!(
        support &&
        table.compareDocumentPosition(support) &
          Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBe(true);
  expect(writes).toHaveLength(3);
});

test("V2 does not add reporting, preparation or approval rights to restricted roles", async ({
  page,
}) => {
  // UI projections only; the two preceding cases use the real local simulator.
  // Server-side authorization remains covered by the role integration suite.
  let role: WorkspaceRole = "viewer";
  let approval = false;
  let reporting = false;
  let simulation = true;
  const reads: string[] = [];
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes.push(path);
    else reads.push(path);
    let body: unknown = { items: [], nextCursor: null };
    if (path === "/api/session")
      body = {
        organization: { id: "v2-roles", name: "Atelier fictif des rôles" },
        user: {
          id: "current",
          name: "Camille Exemple",
          role,
          supervisorCanApprove: approval,
          supervisorCanReport: reporting,
        },
        permissions: workspacePermissions(role, {
          canApprove: approval,
          canReport: reporting,
        }),
        csrfToken: "fixture-only",
        simulation,
      };
    else if (path === "/api/capabilities")
      body = { scanner: "disabled_in_local_simulation" };
    else if (path === "/api/account/contacts")
      body = { items: [], hasMore: false };
    else if (path === "/api/overview")
      body = {
        documents: 0,
        dispatches: { total: 1, approval: 1, attention: 0 },
      };
    else if (path === "/api/dispatches/v2-review")
      body = {
        dispatch: {
          id: "v2-review",
          channel: "email",
          recipient_json: { email: "recipient@example.invalid" },
          subject: "Revue fictive",
          html: "<p>Exemple</p>",
          text: "Exemple",
          status: "prepared",
          mode: "simulation",
          estimated_minor: 10,
          ceiling_minor: 100,
          currency: "EUR",
          fingerprint: "v2-role-fixture",
          created_at: "2026-10-11T10:00:00Z",
          updated_at: "2026-10-11T10:00:00Z",
        },
        events: [],
        attempts: [],
        approval: null,
      };
    await route.fulfill({ json: body });
  });

  for (const scenario of [
    {
      role: "viewer" as const,
      approval: false,
      reporting: false,
      preparation: false,
    },
    {
      role: "member" as const,
      approval: false,
      reporting: false,
      preparation: true,
    },
    {
      role: "supervisor" as const,
      approval: false,
      reporting: true,
      preparation: true,
    },
    {
      role: "supervisor" as const,
      approval: true,
      reporting: false,
      preparation: true,
    },
  ]) {
    ({ role, approval, reporting } = scenario);
    reads.length = 0;
    // The session is read when the application mounts. A hash-only navigation
    // intentionally retains its current actor, so each fixture needs a new page.
    await page.goto(
      `/?atelier=v2&role-fixture=${role}-${approval}-${reporting}#/app`,
    );
    await expect(page.locator("#main-content h1")).toBeVisible();
    await expect(page.locator(".workspace")).toHaveAttribute(
      "data-appearance",
      "v2",
    );
    await expect(page.locator(".overview-stats")).toHaveCount(
      reporting ? 1 : 0,
    );
    expect(reads.includes("/api/overview")).toBe(reporting);
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (!scenario.preparation)
      await expect(page.locator('a[href="#/app/prepare"]')).toHaveCount(0);
    await page.goto("/?atelier=v2#/app/dispatch/v2-review");
    await expect(
      page.getByRole("heading", { name: "Le bon à envoyer." }),
    ).toBeVisible();
    await expect(page.locator(".approval-panel")).toHaveCount(approval ? 1 : 0);
    if (approval)
      await expect(page.locator(".approval-panel button")).toBeDisabled();
    if (!scenario.preparation) {
      await page.goto("/?atelier=v2#/app/prepare");
      await expect(
        page.getByText("Votre rôle ne permet pas cette action.", {
          exact: false,
        }),
      ).toBeVisible();
    }
  }
  // This session is a fully intercepted projection of the live UI. It performs
  // no business request and must not carry the simulation or former trial badge.
  simulation = false;
  await page.goto("/?atelier=v2&role-fixture=real-projection#/app");
  await expect(page.locator("#main-content h1")).toBeVisible();
  await expect(page.locator(".simulation-banner")).toHaveCount(0);
  await expect(page.locator(".dashboard-v2-notice")).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("saving a name from a temporary V2 link leaves the account appearance unchanged", async ({
  page,
}) => {
  await login(page);
  await page.goto("/?atelier=v2&lang=fr#/app/account");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  await expect(page.locator("#dashboard-appearance")).toHaveValue("classic");
  const originalName = await page.locator("#account-name").inputValue();
  const writes = observeWrites(page);
  await page.locator("#account-name").fill(`${originalName} V2`);
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/account" &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Enregistrer les modifications", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  expect(writes).toHaveLength(1);
  expect(writes[0].body).not.toHaveProperty("preferredDashboardAppearance");
  expect(
    (await (await page.request.get("/api/session")).json()).user
      .preferredDashboardAppearance,
  ).toBe("classic");
  expect(new URL(page.url()).searchParams.get("atelier")).toBe("v2");
  await page.reload();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  await expect(page.locator("#dashboard-appearance")).toHaveValue("classic");
  await page.locator("#account-name").fill(originalName);
  await saveProfileAppearance(page, "v2");
  expect(writes).toHaveLength(2);
  expect(writes[1].body).toEqual(
    expect.objectContaining({ preferredDashboardAppearance: "v2" }),
  );
  expect(new URL(page.url()).searchParams.has("atelier")).toBe(false);
  expect(new URL(page.url()).searchParams.get("lang")).toBe("fr");
  expect(
    (await (await page.request.get("/api/session")).json()).user
      .preferredDashboardAppearance,
  ).toBe("v2");
});

test("V2 keeps the account reachable below scrollable navigation and both appearances support every workspace at 320 pixels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, "v2");
  const writes = observeWrites(page);
  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1025) {
    const account = page.locator(".sidebar-account");
    await expect(account).toBeVisible();
    const accountBox = await account.boundingBox();
    const navBox = await page.locator(".workspace-navigation").boundingBox();
    expect(accountBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(accountBox!.y).toBeGreaterThan(viewport.height / 2);
    expect(accountBox!.y + accountBox!.height).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(accountBox!.y + 1);
    expect(
      await page
        .locator(".workspace-navigation")
        .evaluate((nav) => nav.scrollHeight > nav.clientHeight),
    ).toBe(true);
    await expect(
      page.locator('.workspace-navigation a[href="#/app/account"]'),
    ).toHaveCount(0);
    await expect(
      account.locator('a[href="#/app/account"]').first(),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 812 });
  for (const appearance of ["classic", "v2"]) {
    for (const route of [
      "",
      "/documents",
      "/templates",
      "/datasets",
      "/generations",
      "/dispatches",
      "/campaigns",
      "/connection",
      "/senders",
      "/usage",
      "/plan",
      "/billing",
      "/account",
      "/admin",
      "/prepare",
    ]) {
      await page.goto(`/?atelier=${appearance}#/app${route}`);
      await expect(page.locator("#main-content h1")).toBeVisible();
      await expect(page.locator(".workspace")).toHaveAttribute(
        "data-appearance",
        appearance,
      );
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: `${appearance} horizontal overflow at ${route || "/app"}`,
        })
        .toBeLessThanOrEqual(320);
    }
  }
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});
