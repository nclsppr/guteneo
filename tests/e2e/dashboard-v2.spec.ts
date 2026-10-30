import { expect, test, type Page } from "./fixtures";
import type { APIResponse, Locator, Route } from "@playwright/test";
import { enterInitialText } from "./initial-input";
import {
  workspacePermissions,
  type WorkspaceRole,
} from "../../packages/contracts/src/roles";

async function login(page: Page) {
  await page.goto("/#/app");
  await page
    .getByRole("button", { name: "Entrer dans l’espace de travail" })
    .click();
  // The sign-in screen already has an h1. Wait for the authenticated shell
  // before a caller can navigate and cancel the pending login request.
  await expect(page.locator(".workspace")).toBeVisible();
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

async function saveProfileLanguage(page: Page) {
  await page.bringToFront();
  await page
    .locator('.account-display-preferences select[name="language"]')
    .selectOption("fr");
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/account" &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Enregistrer les modifications", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  // Response headers can arrive before the account save updates browser state.
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Votre profil a été enregistré." }),
  ).toBeVisible();
}

async function returnToWorkspace(page: Page) {
  await page.bringToFront();
  const reread = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/session",
  );
  // Headless WebKit does not consistently dispatch the native focus event.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await reread).ok()).toBe(true);
}

async function expectClearV2Shell(page: Page) {
  await expect(page.locator(".workspace .brand")).toHaveCount(1);
  await expect(page.locator(".app-footer")).toHaveCount(0);
  await expect(page.locator(".app-topbar")).toHaveCount(0);
  await expect(
    page.locator(".sidebar .application-switcher .space-switcher-trigger"),
  ).toBeVisible();
  await expect(
    page.locator(".sidebar .workspace-switcher .space-switcher-trigger"),
  ).toBeVisible();
  await expect(
    page.locator(".workspace-role, .dashboard-identity"),
  ).toHaveCount(0);
  await expect(
    page.locator('.sidebar .space-switcher-panel a[href="#/app/my-documents"]'),
  ).toHaveCount(1);
  await expect(page.locator(".sidebar > .personal-context-link")).toHaveCount(
    0,
  );
  // One account row; its closed menu holds profile, status and sign-out.
  const account = page.locator(".sidebar-account .workspace-identity-trigger");
  await expect(account).toBeVisible();
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.locator('.sidebar-account a[href="#/app/account"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.sidebar-account a[href="https://status.guteneo.com/"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('a[href="https://status.guteneo.com/"]'),
  ).toHaveCount(1);
  await expect(page.locator(".sidebar-footer, .navigation-logout")).toHaveCount(
    0,
  );
}

async function expectProminentAction(action: Locator, touch: boolean) {
  await expect(action).toBeVisible();
  await expect(action).toHaveClass(/\bprimary\b/);
  const readPresentation = () =>
    action.evaluate((element) => {
      const style = getComputedStyle(element);
      const rgb = (color: string) =>
        color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const luminance = (color: string) => {
        const channels = rgb(color).map((value) => {
          const component = value / 255;
          return component <= 0.04045
            ? component / 12.92
            : ((component + 0.055) / 1.055) ** 2.4;
        });
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
      };
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return {
        contrast:
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05),
        background: style.backgroundColor,
        height: element.getBoundingClientRect().height,
      };
    });
  // Button prominence changes with a 150 ms background transition. Check the
  // rendered primary state without sampling an intermediate animation frame.
  await expect
    .poll(async () => (await readPresentation()).contrast)
    .toBeGreaterThanOrEqual(4.5);
  const presentation = await readPresentation();
  expect(presentation.background).not.toBe("rgba(0, 0, 0, 0)");
  if (touch) expect(presentation.height).toBeGreaterThanOrEqual(44);
}

test("V2 gives each creation page one prominent action and keeps account utilities outside mobile navigation", async ({
  page,
  isMobile,
}) => {
  // An empty history must not duplicate the heading's primary new-send action.
  await page.route("**/api/dispatches", (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await login(page);
  const writes = observeWrites(page);
  const main = page.locator("#main-content");
  for (const destination of [
    {
      path: "documents",
      title: "La matière première.",
      action: "Importer un PDF",
    },
    {
      path: "studio/templates",
      title: "Modèles",
      action: "Créer un document",
    },
    {
      path: "studio/datasets",
      title: "Données",
      action: "Importer et reconnaître les données",
    },
    {
      path: "studio/generations",
      title: "Générations",
      action: "Créer un document",
    },
    { path: "dispatches", title: "Le fil des envois.", action: "Nouvel envoi" },
  ]) {
    await page.goto(`/#/app/${destination.path}`);
    await expect(
      main.getByRole("heading", {
        level: 1,
        name: destination.title,
        exact: true,
      }),
    ).toBeVisible();
    await expectClearV2Shell(page);
    const primary = main.locator(".button.primary");
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(destination.action);
    // The global shortcut stays in place on every workshop page without the
    // filled style; the Studio creates documents and sends nothing.
    const shortcut = page.locator(".workspace-create");
    if (destination.path.startsWith("studio/")) {
      await expect(shortcut).toHaveCount(0);
      await expect(primary).toHaveAccessibleName(destination.action);
      await expectProminentAction(primary, isMobile);
      continue;
    }
    await expect(shortcut).toHaveCount(1);
    await expect(shortcut).not.toHaveClass(/\bprimary\b/);
    if (isMobile) await expect(shortcut).toBeHidden();
    if (destination.path === "dispatches" && !isMobile) {
      // The heading repeats the shortcut only where navigation is collapsed.
      await expect(primary).toBeHidden();
      await expect(shortcut).toBeVisible();
      continue;
    }
    await expect(primary).toHaveAccessibleName(destination.action);
    await expectProminentAction(primary, isMobile);
    if (!isMobile)
      await expect(shortcut).not.toHaveCSS(
        "background-color",
        await primary.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      );
  }

  await page.goto("/#/app/studio/templates");
  const create = main.getByRole("button", {
    name: "Créer un document",
    exact: true,
  });
  await create.click();
  await expect(create).toHaveAttribute("aria-expanded", "true");
  await expect(create).not.toHaveClass(/\bprimary\b/);
  await expect(main.locator(".button.primary")).toHaveCount(1);
  await expectProminentAction(
    main.getByRole("button", { name: "Créer le modèle", exact: true }),
    isMobile,
  );
  await create.click();
  await expect(create).toHaveAttribute("aria-expanded", "false");
  await expectProminentAction(create, isMobile);

  await page.goto("/#/app/documents");
  const importPdf = main.getByRole("button", {
    name: "Importer un PDF",
    exact: true,
  });
  await importPdf.click();
  await expect(importPdf).not.toHaveClass(/\bprimary\b/);
  await expect(main.locator(".button.primary")).toHaveCount(1);
  await expectProminentAction(
    main.getByRole("button", { name: "Importer et contrôler", exact: true }),
    isMobile,
  );
  await main
    .locator(".form-panel")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await expectProminentAction(importPdf, isMobile);

  // The account menu remains reachable when the compact navigation is closed.
  await page.locator(".sidebar-account .workspace-identity-trigger").click();
  await page.locator('.sidebar-account a[href="#/app/account"]').click();
  await expect(page.locator(".account-display-preferences")).toBeVisible();
  await expectClearV2Shell(page);
  if (isMobile) {
    await expect(page.locator(".workspace-navigation")).not.toHaveAttribute(
      "open",
      "",
    );
    await page.locator(".workspace-navigation summary").click();
  }
  const globalAction = page.locator(".workspace-create");
  await expect(globalAction).toBeVisible();
  const place = await globalAction.boundingBox();
  await globalAction.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/app\/prepare$/);
  await expect(main.locator("form.prepare-layout")).toBeVisible();
  await expect(globalAction).toHaveCount(1);
  if (!isMobile) expect(await globalAction.boundingBox()).toEqual(place);
  expect(writes).toEqual([]);
});

test("V2 keeps every destination in view and in place on common desktop screens", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Desktop sidebar geometry; phones use the collapsed navigation.",
  );
  await login(page);
  const navigation = page.locator(".workspace-navigation");
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
  ]) {
    await page.setViewportSize(size);
    let places: number[] | undefined;
    for (const route of [
      "",
      "/documents",
      "/prepare",
      "/dispatches",
      "/admin",
    ]) {
      await page.goto(`/#/app${route}`);
      await expect(page.locator("#main-content h1")).toBeVisible();
      const layout = await navigation.evaluate((element) => ({
        scrolls: element.scrollHeight > element.clientHeight,
        bottom: element.getBoundingClientRect().bottom,
        links: [...element.querySelectorAll("nav a")].map((link) =>
          link.getBoundingClientRect(),
        ),
      }));
      expect(layout.scrolls, `${route || "/app"} at ${size.height}px`).toBe(
        false,
      );
      for (const link of layout.links)
        expect(link.bottom).toBeLessThanOrEqual(layout.bottom);
      const tops = layout.links.map((link) => Math.round(link.top));
      if (places) expect(tops, route || "/app").toEqual(places);
      else places = tops;
    }
  }
  // A shorter screen still scrolls the list and fades the cut-off entry.
  expect(
    await navigation
      .locator("nav")
      .evaluate((element) => getComputedStyle(element, "::after").position),
  ).toBe("sticky");
});

test("account language saves alone, survives a fresh browser, and retains another tab's draft", async ({
  page,
  browser,
  context,
  baseURL,
}) => {
  await login(page);
  await page.goto("/?lang=fr#/app/account");
  const preferences = page.locator(".account-display-preferences");
  await expect(preferences.locator('select[name="language"]')).toBeVisible();
  await expect(page.locator("#dashboard-appearance")).toHaveCount(0);
  const writes = observeWrites(page);
  await saveProfileLanguage(page);
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("/api/account");
  expect(writes[0].body).toEqual(
    expect.objectContaining({ preferredLocale: "fr" }),
  );
  expect(writes[0].body).not.toHaveProperty("preferredDashboardAppearance");

  const fresh = await browser.newContext({
    baseURL,
    storageState: { cookies: await context.cookies(), origins: [] },
  });
  try {
    const freshPage = await fresh.newPage();
    await freshPage.goto("/#/app/account");
    await expect(
      freshPage.locator('.account-display-preferences select[name="language"]'),
    ).toHaveValue("fr");
    await expect(freshPage.locator(".workspace")).toHaveClass(/workspace-v2/);
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
  await saveProfileLanguage(settings);
  await returnToWorkspace(page);
  await expect(page.getByLabel("Objet", { exact: true })).toHaveValue(
    "Brouillon conservé",
  );
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Sans préparation ni envoi.",
  );
  expect(new URL(page.url()).hash).toBe("#/app/prepare?channel=email");
  expect(new URL(page.url()).searchParams.get("lang")).toBe("fr");
  expect(writes.map((write) => write.path)).toEqual(["/api/account"]);
  expect(settingsWrites.map((write) => write.path)).toEqual(["/api/account"]);
  await settings.close();
});

test("V2 prepares through the existing API and requires explicit consent before simulated acceptance", async ({
  page,
  hasTouch,
}) => {
  await login(page);
  const settings = await page.context().newPage();
  await settings.goto("/#/app/account");
  const expectedEmail = "v2-consent@example.invalid";
  const initialPaths = new Set(["/api/documents", "/api/senders"]);
  const seen = new Set<string>();
  const responses = new Map<string, APIResponse>();
  const pendingRoutes = new Set<Promise<void>>();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fetched!: () => void;
  const bothFetched = new Promise<void>((resolve) => {
    fetched = resolve;
  });
  let delivered!: () => void;
  const bothDelivered = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  let deliveryCount = 0;
  const initialData = (url: URL) => initialPaths.has(url.pathname);
  const holdInitialData = (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET" || seen.has(path))
      return route.continue();
    seen.add(path);
    const task = (async () => {
      const response = await route.fetch({ maxRetries: 0 });
      responses.set(path, response);
      if (responses.size === 2) fetched();
      await gate;
      await route.fulfill({ response });
      if (++deliveryCount === 2) delivered();
    })();
    pendingRoutes.add(task);
    void task.finally(() => pendingRoutes.delete(task)).catch(() => {});
    return task;
  };
  await page.route(initialData, holdInitialData);
  const recipient = page.getByLabel("Adresse e-mail", { exact: true });
  try {
    await page.goto("/#/app/prepare?channel=email");
    // Exercise one user gesture while both real initial replies remain pending.
    await enterInitialText(recipient, expectedEmail, hasTouch, "V2 recipient");
    // Do not wait for initial data before typing. Publish its unchanged replies
    // only after the original entry, then check that loading preserves it.
    await bothFetched;
    expect(responses.size).toBe(2);
    for (const response of responses.values())
      expect(response.status()).toBe(200);
    release();
    await bothDelivered;
    expect(
      await recipient.evaluate(
        (input: HTMLInputElement, expected) => input.value === expected,
        expectedEmail,
      ),
      "Initial data replies must preserve the exact recipient",
    ).toBe(true);
    await page.getByLabel("Objet", { exact: true }).fill("Revue V2");
    await page
      .getByLabel("Message", { exact: true })
      .fill("Correspondance de simulation V2.");
  } finally {
    release();
    await page.unroute(initialData, holdInitialData);
    await Promise.allSettled([...pendingRoutes]);
    await Promise.allSettled(
      [...responses.values()].map((response) => response.dispose()),
    );
  }
  expect(
    await recipient.evaluate(
      (input: HTMLInputElement, expected) => input.value === expected,
      expectedEmail,
    ),
    "The exact recipient must remain intact before submission",
  ).toBe(true);
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
  const backToHistory = page.locator('.back-link[href="#/app/dispatches"]');
  await expect(backToHistory).toBeVisible();
  await expect(page.locator(".app-topbar")).toHaveCount(0);
  await backToHistory.click();
  await expect(page).toHaveURL(/#\/app\/dispatches$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Le fil des envois." }),
  ).toBeVisible();
  await page.goto(`/#/app/dispatch/${prepared.id}`);
  await expect(backToHistory).toBeVisible();
  const reviewFacts = page.locator(".dispatch-review-facts");
  await expect(reviewFacts.getByText("Créé le", { exact: true })).toBeVisible();
  const timezone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  await expect(reviewFacts.locator(".timestamp-context")).toHaveText(
    `Heures affichées : ${timezone}`,
  );
  await expect(reviewFacts.locator(".timestamp-context")).toBeVisible();
  await expect(
    page
      .frameLocator(".email-preview")
      .getByText("Correspondance de simulation V2.", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("/api/dispatches");
  const payload = writes[0].body as Record<string, unknown>;
  const target = payload.recipient as Record<string, unknown> | null;
  expect(
    !!target &&
      typeof target === "object" &&
      !Array.isArray(target) &&
      Object.keys(target).length === 1 &&
      target.email === expectedEmail,
    "The preparation payload must contain only the exact original recipient",
  ).toBe(true);
  expect(
    payload.channel === "email" &&
      payload.subject === "Revue V2" &&
      payload.text === "Correspondance de simulation V2." &&
      payload.ceilingMinor === 500,
    "Preparation must retain the original channel, content and ceiling",
  ).toBe(true);
  expect("appearance" in payload).toBe(false);
  expect("atelier" in payload).toBe(false);

  const consent = page.locator(".approval-panel input[type=checkbox]").first();
  const approve = page.getByRole("button", {
    name: "Approuver et simuler l’envoi",
    exact: true,
  });
  await expect(consent).not.toBeChecked();
  await expect(approve).toBeDisabled();
  await saveProfileLanguage(settings);
  await returnToWorkspace(page);
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
  expect(writes).toHaveLength(1);
  await consent.focus();
  await page.keyboard.press("Space");
  await saveProfileLanguage(settings);
  await returnToWorkspace(page);
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
    await page.goto(`/?role-fixture=${role}-${approval}-${reporting}#/app`);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await expect(page.locator(".overview-stats")).toHaveCount(
      reporting ? 1 : 0,
    );
    expect(reads.includes("/api/overview")).toBe(reporting);
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (!scenario.preparation)
      await expect(page.locator('a[href="#/app/prepare"]')).toHaveCount(0);
    await page.goto("/#/app/studio/generations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Générations" }),
    ).toBeVisible();
    await expect(page.locator("#main-content .button.primary")).toHaveCount(
      scenario.preparation ? 1 : 0,
    );
    // New dispatch belongs to Correspondence; Studio pages never show it.
    await expect(page.locator(".workspace-create")).toHaveCount(0);
    await page.goto("/#/app/dispatch/v2-review");
    await expect(
      page.getByRole("heading", { name: "Le bon à envoyer." }),
    ).toBeVisible();
    await expect(page.locator(".approval-panel")).toHaveCount(approval ? 1 : 0);
    if (approval)
      await expect(page.locator(".approval-panel button")).toBeDisabled();
    if (!scenario.preparation) {
      await page.goto("/#/app/prepare");
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
  await page.goto("/?role-fixture=real-projection#/app");
  await expect(page.locator("#main-content h1")).toBeVisible();
  await expect(page.locator(".simulation-banner")).toHaveCount(0);
  await expect(page.locator(".dashboard-v2-notice")).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("a stored Classic preference and old appearance links still open the only workspace layout", async ({
  page,
}) => {
  // The shared fixture stores `classic` on the demonstration accounts.
  await login(page);
  await expectClearV2Shell(page);
  const writes = observeWrites(page);
  for (const link of [
    "/?appearance=classic#/app/account",
    "/?atelier=classic#/app/account",
  ]) {
    await page.goto(link);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await expect(page.locator(".workspace")).toHaveClass(/workspace-v2/);
    await expectClearV2Shell(page);
    await expect(page.locator("#dashboard-appearance")).toHaveCount(0);
  }
  // The stored value stays readable for older clients; nothing rewrites it.
  expect(
    (await (await page.request.get("/api/session")).json()).user
      .preferredDashboardAppearance,
  ).toBe("classic");
  expect(writes).toEqual([]);
});

test("V2 keeps the account reachable below the navigation and supports every workspace at the native viewport and 320 pixels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
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
    await expect(
      page.locator('.workspace-navigation a[href="#/app/account"]'),
    ).toHaveCount(0);
    await expect(account.locator(".workspace-identity-trigger")).toBeVisible();
  }
  for (const dimensions of [viewport!, { width: 320, height: 812 }]) {
    await page.setViewportSize(dimensions);
    for (const route of [
      "",
      "/documents",
      "/studio/templates",
      "/studio/datasets",
      "/studio/generations",
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
      await page.goto(`/#/app${route}`);
      await expect(page.locator("#main-content h1")).toBeVisible();
      await expectClearV2Shell(page);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: `Horizontal overflow at ${route || "/app"} (${dimensions.width}px)`,
        })
        .toBeLessThanOrEqual(dimensions.width);
    }
  }
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});
