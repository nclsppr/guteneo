import {
  expect,
  localApi,
  resetRecipientWorkspaceFixture,
  test,
} from "./fixtures";

test.beforeEach(async () => {
  await resetRecipientWorkspaceFixture();
});

test("an expired invitation handoff cannot survive a same-tab reload", async ({ app, screen, browser }) => {
  await app.open("/#/app/my-documents");
  await screen.getByRole("button", "Ouvrir le compte destinataire fictif").tap();
  await expect(screen.getByRole("link", "Utiliser Guteneo")).toBeVisible();
  await expect(screen.getByRole("heading", "Mes documents")).toBeVisible();
  const handoff = await browser.evaluate(async () => {
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((value) => value.toString(16).padStart(2, "0")).join("");
    location.hash = `/app/my-documents?invitation=${token}`;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && location.hash.includes("invitation="))
      await new Promise((resolve) => setTimeout(resolve, 20));
    const pending = JSON.parse(sessionStorage.getItem("guteneo.pending-document-invitation.v1") ?? "null") as { token?: string; expiresAt?: number } | null;
    return { clean: location.hash === "#/app/my-documents", stored: pending?.token === token,
      bounded: Boolean(pending?.expiresAt && pending.expiresAt > Date.now() && pending.expiresAt <= Date.now() + 600000) };
  });
  expect(handoff).toEqual({ clean: true, stored: true, bounded: true });
  await expect(screen.getByRole("button", "Demander l’accès au document")).toBeVisible();
  await browser.evaluate(() => {
    const key = "guteneo.pending-document-invitation.v1";
    const pending = JSON.parse(sessionStorage.getItem(key)!);
    pending.expiresAt = Date.now() - 1;
    sessionStorage.setItem(key, JSON.stringify(pending));
    return true;
  });
  await browser.reload();
  await expect(screen.getByRole("heading", "Mes documents")).toBeVisible();
  await expect(screen.getByRole("button", "Demander l’accès au document")).toHaveCount(0);
  expect(await browser.evaluate(() => sessionStorage.getItem("guteneo.pending-document-invitation.v1") === null)).toBe(true);
});

test("a recipient has one account, no automatic workshop, and voluntary access to services", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/#/app/my-documents");
  await screen
    .getByRole("button", "Ouvrir le compte destinataire fictif")
    .tap();
  await expect(screen.getByRole("link", "Utiliser Guteneo")).toBeVisible();
  await expect(screen.getByRole("heading", "Mes documents")).toBeVisible();
  const before = await localApi<{
    user: { id: string };
    workspaces: { id: string }[];
    simulation: boolean;
  }>(browser, "/api/personal/session");
  expect(before.status).toBe(200);
  expect(before.body.simulation).toBe(true);
  expect(before.body.workspaces).toEqual([]);
  const received = await localApi<{ items: { id: string }[] }>(
    browser,
    "/api/personal/documents?kind=shared",
  );
  expect(received.status).toBe(200);
  await screen.getByRole("link", "Utiliser Guteneo").tap();
  await expect(screen.getByRole("heading", "Utiliser Guteneo")).toBeVisible();
  await expect(screen.getByLabel("Nom de votre atelier")).toBeVisible();
  await expect(
    screen.getByText(
      "Vos documents reçus restent accessibles sans achat de service.",
    ),
  ).toBeVisible();
  await app.screenshot("personal-services");
  const after = await localApi<{
    user: { id: string };
    workspaces: { id: string }[];
  }>(browser, "/api/personal/session");
  expect(after.body.user.id).toBe(before.body.user.id);
  expect(after.body.workspaces).toEqual([]);
  await screen.getByRole("link", "Mes documents").tap();
  await expect(screen.getByRole("heading", "Mes documents")).toBeVisible();
  expect(
    await browser.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  // A voluntary sign-out must leave the private route. Returning to it would
  // automatically restart hosted authentication in the production browser.
  let authenticationRedirects = 0;
  await browser.route(/\/auth\/(?:login|signup)(?:\?|$)/u, async (route) => {
    authenticationRedirects += 1;
    await route.abort();
  });
  const [signedOut] = await Promise.all([
    browser.waitForResponse("**/api/personal/logout"),
    screen.getByRole("button", "Se déconnecter").tap(),
  ]);
  expect(signedOut.status).toBe(200);
  await expect(browser).toHaveURL("http://localhost:8787/");
  await expect(browser.locator("main")).toBeVisible();
  const publicAfterLogout = await browser.evaluate(async () => {
    const status = (await fetch("/api/personal/session")).status;
    await new Promise((resolve) => setTimeout(resolve, 750));
    return { status, publicHome: location.pathname === "/" && location.hash === "",
      privateShell: document.querySelector(".personal-space") !== null };
  });
  expect(publicAfterLogout).toEqual({ status: 401, publicHome: true, privateShell: false });
  expect(authenticationRedirects).toBe(0);

  // Only this explicit action re-enters the private area; it creates no session.
  await app.open("/#/app/my-documents");
  await expect(screen.getByRole("button", "Ouvrir le compte destinataire fictif")).toBeVisible();
  expect(await browser.evaluate(async () => (await fetch("/api/personal/session")).status)).toBe(401);
  expect(authenticationRedirects).toBe(0);
});

test("creating a sending workshop keeps the recipient's Guteneo identity", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/#/app/my-documents");
  await screen
    .getByRole("button", "Ouvrir le compte destinataire fictif")
    .tap();
  await expect(screen.getByRole("link", "Utiliser Guteneo")).toBeVisible();
  await expect(screen.getByRole("heading", "Mes documents")).toBeVisible();
  const before = await localApi<{
    user: { id: string };
    workspaces: { id: string }[];
  }>(browser, "/api/personal/session");
  expect(before.status).toBe(200);
  expect(before.body.workspaces).toEqual([]);
  await screen.getByRole("link", "Utiliser Guteneo").tap();
  await screen
    .getByLabel("Nom de votre atelier")
    .fill("Atelier personnel de test");
  await app.screenshot("personal-workspace-onboarding");
  await screen.getByRole("button", "Créer mon atelier").tap();
  await expect(browser).toHaveURL(/#\/app\/prepare/);
  const after = await localApi<{
    user: { id: string };
    workspaces: { id: string }[];
  }>(browser, "/api/personal/session");
  expect(after.status).toBe(200);
  expect(after.body.user.id).toBe(before.body.user.id);
  expect(after.body.workspaces).toHaveLength(1);
  await app.open("/#/app/my-documents");
  await expect(screen.getByRole("heading", "Mes documents")).toBeVisible();
});

test("personal account authority never grants access to the sending workshop", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/#/app/my-documents");
  await screen
    .getByRole("button", "Ouvrir le compte destinataire fictif")
    .tap();
  await expect(screen.getByRole("link", "Utiliser Guteneo")).toBeVisible();
  await expect(screen.getByRole("heading", "Mes documents")).toBeVisible();
  const forbidden = await localApi<{ error: { code: string } }>(
    browser,
    "/api/personal/workspace/select",
    "POST",
    { organizationId: "org_atelier" },
  );
  expect(forbidden.status).toBe(403);
  const guards = await browser.evaluate(async () => {
    const csrf = await fetch("/api/personal/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Forbidden fixture" }),
    });
    const bearer = await fetch("/api/personal/session", {
      headers: { Authorization: "Bearer fictional-invalid-token" },
    });
    const csrfBody = (await csrf.json()) as { error?: { code?: string } };
    const bearerBody = (await bearer.json()) as { error?: { code?: string } };
    return {
      csrf: { status: csrf.status, code: csrfBody.error?.code ?? "" },
      bearer: { status: bearer.status, code: bearerBody.error?.code ?? "" },
    };
  });
  expect(guards.csrf.status).toBe(403);
  expect(guards.csrf.code).toBe("CSRF_REJECTED");
  expect(guards.bearer.status).toBe(403);
  expect(guards.bearer.code).toBe("BROWSER_REQUIRED");
});

test("an unavailable document session offers recovery without an automatic sign-in loop", async ({
  app,
  screen,
  browser,
}) => {
  let documentReads = 0;
  let failureStatus: 401 | 403 = 401;
  let authenticationRedirects = 0;
  const privateTitle = "Document confidentiel du parcours de récupération";
  const privateSender = "Atelier confidentiel du parcours de récupération";
  await browser.route(/\/auth\/(?:login|signup)(?:\?|$)/u, async (route) => {
    authenticationRedirects++;
    await route.abort();
  });
  // List-only fault injection. Authentication and every other API remain real.
  // A loaded synthetic row and cursor must disappear if the next page loses
  // authorization; starting with an empty failed list would miss that defect.
  await browser.route(
    /\/api\/personal\/documents(?:\?.*)?$/u,
    async (route) => {
      documentReads++;
      if (documentReads === 1) {
        await route.fulfill({
          json: {
            items: [{
              id: `sd_${"a".repeat(32)}`,
              kind: "shared",
              title: privateTitle,
              sender: privateSender,
              status: "active",
              expiresAt: "2030-01-01T00:00:00.000Z",
              createdAt: "2026-01-01T00:00:00.000Z",
              allowOriginalDownload: false,
              allowVaultDeposit: false,
            }],
            nextCursor: "fictional-recovery-next-page",
          },
        });
      } else {
        await route.fulfill({
          status: failureStatus,
          json: {
            error: {
              code: failureStatus === 401
                ? "SESSION_EXPIRED"
                : "STRONG_AUTHENTICATION_REQUIRED",
              message: "Reconnectez-vous pour accéder à vos documents.",
            },
          },
        });
      }
    },
  );
  await app.open("/#/app/my-documents");
  await screen
    .getByRole("button", "Ouvrir le compte destinataire fictif")
    .tap();
  for (const status of [401, 403] as const) {
    if (status === 403) {
      failureStatus = status;
      documentReads = 0;
      await browser.reload();
    }
    await expect(screen.getByRole("heading", privateTitle)).toBeVisible();
    await expect(screen.getByText(privateSender, { exact: false })).toBeVisible();
    await screen.getByRole("button", "Afficher les documents suivants").tap();
    if (status === 401) {
      await expect(
        screen.getByRole("button", "Se connecter à mon compte"),
      ).toBeVisible();
    } else {
      await expect(
        screen.getByRole("heading", "Connexion renforcée nécessaire"),
      ).toBeVisible();
      await expect(screen.getByRole("link", "Vérifier mon accès")).toBeVisible();
    }
    await expect(screen.getByRole("heading", privateTitle)).toHaveCount(0);
    await expect(screen.getByText(privateSender, { exact: false })).toHaveCount(0);
    await expect(
      screen.getByRole("button", "Afficher les documents suivants"),
    ).toHaveCount(0);
    await expect(screen.getByRole("link", "Utiliser Guteneo")).toBeVisible();
    await app.screenshot(`personal-document-session-recovery-${status}`);
    // Observe a quiet period after the explicit recovery control appears. No
    // hidden retry or automatic authentication may disclose the row again.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(documentReads).toBe(2);
    expect(authenticationRedirects).toBe(0);
    const session = await localApi<{ user: { id: string } }>(
      browser,
      "/api/personal/session",
    );
    expect(session.status).toBe(200);
    expect(session.body.user.id).toBe("user_recipient");
  }
});
