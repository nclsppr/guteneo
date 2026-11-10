import { test, expect, type Page } from "./fixtures";
import { PDFDocument } from "pdf-lib";
import { enterInitialText } from "./initial-input";

const origin = "http://localhost:8787";

async function login(page: Page) {
  await page.goto("/#/app");
  await page
    .getByRole("button", { name: "Entrer dans l’espace de travail" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vue d’ensemble", exact: true }),
  ).toBeVisible();
}

async function csrf(page: Page) {
  const session = (await (await page.request.get("/api/session")).json()) as {
    csrfToken: string;
  };
  return session.csrfToken;
}

async function prepareEmail(page: Page, label: string) {
  const response = await page.request.post("/api/dispatches", {
    headers: {
      Origin: origin,
      "X-CSRF-Token": await csrf(page),
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      channel: "email",
      recipient: { email: `${label}@example.invalid` },
      subject: "Tableau de bord",
      html: "<p>Simulation.</p>",
      text: "Simulation.",
      ceilingMinor: 500,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

async function importPdf(page: Page, name: string) {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).drawText("Dashboard preview", { x: 50, y: 750 });
  await page.goto("/#/app/documents");
  await page
    .getByRole("button", { name: "Importer un PDF", exact: true })
    .click();
  await page.getByLabel("Fichier PDF").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  const uploaded = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/documents") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Importer et contrôler" }).click();
  const response = await uploaded;
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

test("the exact-PDF preview renders without recent Map built-ins", async ({
  page,
}) => {
  // Browsers a few releases old lack these methods; the modern PDF.js build
  // called them directly and showed "L’aperçu ne peut pas être affiché".
  await page.addInitScript(() => {
    for (const target of [Map.prototype, WeakMap.prototype])
      for (const name of ["getOrInsert", "getOrInsertComputed"])
        Reflect.deleteProperty(target, name);
  });
  await login(page);
  expect(
    await page.evaluate(() => "getOrInsertComputed" in Map.prototype),
  ).toBe(false);
  await importPdf(page, "legacy-browser.pdf");
  const viewer = page.locator(".pdf-canvas-wrap").first();
  await expect(viewer).toHaveAttribute("aria-busy", "false");
  await expect(viewer.locator("canvas")).toBeVisible();
  await expect(viewer.getByRole("alert")).toHaveCount(0);
});

test("overview counters cover the whole organization and open filtered lists", async ({
  page,
}) => {
  await login(page);
  // Guarantee more rows than one API page so the old page-bounded counts fail.
  const before = (await (await page.request.get("/api/overview")).json()) as {
    dispatches: { total: number };
  };
  for (let index = before.dispatches.total; index < 32; index++)
    await prepareEmail(page, `overview-${index}`);
  const overview = (await (await page.request.get("/api/overview")).json()) as {
    documents: number;
    dispatches: { total: number; approval: number; attention: number };
  };
  expect(overview.dispatches.total).toBeGreaterThan(30);
  const firstPage = (await (
    await page.request.get("/api/dispatches")
  ).json()) as {
    items: unknown[];
  };
  expect(firstPage.items).toHaveLength(30);

  // Counters were read at login; reload to show the rows created through the API.
  await page.reload();
  const stats = page.getByRole("list", {
    name: "Synthèse de l’espace de travail",
  });
  await expect(stats.getByRole("link", { name: /^Envois/ })).toContainText(
    String(overview.dispatches.total),
  );
  await expect(stats.getByRole("link", { name: /^À approuver/ })).toContainText(
    String(overview.dispatches.approval),
  );
  await expect(stats.getByRole("link", { name: /^Documents/ })).toContainText(
    String(overview.documents),
  );

  await stats.getByRole("link", { name: /^À approuver/ }).click();
  await expect(page).toHaveURL(/#\/app\/dispatches\?group=approval$/);
  const filter = page.getByRole("navigation", { name: "Afficher" });
  await expect(
    filter.getByRole("link", { name: "À approuver" }),
  ).toHaveAttribute("aria-current", "page");
  const statuses = page.locator("tbody .status");
  await expect(statuses.first()).toBeVisible();
  for (const status of await statuses.allTextContents())
    expect(status).toBe("À approuver");

  await filter.getByRole("link", { name: "Clôturés" }).click();
  await expect(page).toHaveURL(/#\/app\/dispatches\?group=done$/);
  await expect(filter.getByRole("link", { name: "Clôturés" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const invalid = await page.request.get("/api/dispatches?group=everything");
  expect(invalid.status()).toBe(400);
  expect(
    ((await invalid.json()) as { error: { code: string } }).error.code,
  ).toBe("INVALID_GROUP");
});

test("uncertain or failed sends are surfaced on the overview", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/overview", (route) =>
    route.fulfill({
      json: {
        documents: 3,
        dispatches: {
          total: 41,
          approval: 2,
          in_progress: 1,
          attention: 4,
          done: 34,
        },
      },
    }),
  );
  await page.route("**/api/attention*", (route) =>
    route.fulfill({
      json: {
        items: Array.from({ length: 4 }, (_, index) => ({
          id: `submission_unknown_dashboard_${index}`,
          kind: "submission_unknown",
          resourceId: `synthetic_dashboard_${index}`,
          route: `/app/dispatch/synthetic_dashboard_${index}`,
          channel: "email",
        })),
        nextCursor: null,
        observedAt: new Date().toISOString(),
      },
    }),
  );
  await page.goto("/#/app/documents");
  await expect(
    page.getByRole("button", { name: "Importer un PDF", exact: true }),
  ).toBeVisible();
  await page.goto("/#/app");
  const queue = page.getByRole("region", { name: "À traiter" });
  await expect(queue).toBeVisible();
  await expect(
    queue.getByRole("link", { name: /^Résultat à rapprocher/ }),
  ).toHaveCount(4);
  const attention = page
    .getByRole("list", { name: "Synthèse de l’espace de travail" })
    .getByRole("link", { name: /^À vérifier/ });
  await expect(attention).toContainText("4");
  await attention.click();
  await expect(page).toHaveURL(/#\/app\/dispatches\?group=attention$/);
});

test("an expired session offers a reconnection back to the same page", async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto("/#/app/dispatches?group=approval");
  await expect(
    page.getByRole("navigation", { name: "Afficher" }),
  ).toBeVisible();
  await context.clearCookies();
  // The first loaded page revalidates on return; the explicit refresh appears
  // after additional pages have been loaded.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const expired = page
    .getByRole("alert")
    .filter({ hasText: "Votre session a expiré." });
  await expect(expired).toBeVisible();
  await expired.getByRole("button", { name: "Se reconnecter" }).click();
  await page
    .getByRole("button", { name: "Entrer dans l’espace de travail" })
    .click();
  await expect(page).toHaveURL(/#\/app\/dispatches\?group=approval$/);
  await expect(
    page.getByRole("navigation", { name: "Afficher" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Votre session a expiré." }),
  ).toHaveCount(0);
});

test("a reconnection to another workshop in another tab starts from its overview", async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto("/#/app/dispatches?group=approval");
  await expect(
    page.getByRole("navigation", { name: "Afficher" }),
  ).toBeVisible();
  await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("alert").filter({ hasText: "Votre session a expiré." }),
  ).toBeVisible();
  // Another tab of this browser signs in to the other fictional workshop.
  const other = await page.request.post("/api/dev/login", {
    headers: { Origin: origin },
    data: { organization: "studio" },
  });
  expect(other.status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/#\/app$/);
  await expect(page.locator(".sidebar")).toContainText("Studio Papier");
  await expect(
    page.getByRole("alert").filter({ hasText: "Votre session a expiré." }),
  ).toHaveCount(0);
});

test("cancelling a prepared send asks for confirmation first", async ({
  page,
}) => {
  await login(page);
  const prepared = await prepareEmail(page, "cancel-confirmation");
  await page.goto(`/#/app/dispatch/${prepared.id}`);
  const trigger = page.getByRole("button", { name: "Demander l’annulation" });
  await trigger.click();
  const confirm = page.getByRole("button", {
    name: "Oui, demander l’annulation",
  });
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  const unchanged = (await (
    await page.request.get(`/api/dispatches/${prepared.id}`)
  ).json()) as { dispatch: { status: string } };
  expect(unchanged.dispatch.status).toBe("prepared");
  await trigger.click();
  await confirm.click();
  await expect(page.locator(".dispatch-reference .status")).toHaveText(
    "Annulé",
  );
  await expect(trigger).toHaveCount(0);
});

test("the send ceiling is typed in euros and fax separators are removed", async ({
  page,
  hasTouch,
}) => {
  await login(page);
  const document = await importPdf(page, "ceiling-euros.pdf");
  await page.goto(`/#/app/prepare?document=${document.id}`);
  // "(0)" is the optional trunk prefix: accepted while typing, then dropped.
  const phone = page.getByLabel("Numéro de fax international");
  const expectedPhone = "+33 (0)1 00 00 00 00";
  await enterInitialText(phone, expectedPhone, hasTouch, "Fax recipient");
  const ceiling = page.getByLabel("Plafond de cet envoi, en euros", {
    exact: true,
  });
  await expect(ceiling).toHaveValue("5");
  // A French decimal comma typed key by key: a number field would drop it
  // and turn 1,5 € into 15 €.
  await ceiling.fill("");
  await ceiling.pressSequentially("1,5");
  await expect(ceiling).toHaveValue("1,5");
  expect(
    await phone.evaluate(
      (input: HTMLInputElement, expected) => input.value === expected,
      expectedPhone,
    ),
    "The original fax recipient must remain exact before submission",
  ).toBe(true);
  const request = page.waitForRequest(
    (candidate) =>
      candidate.url().endsWith("/api/dispatches") &&
      candidate.method() === "POST",
  );
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  const body = (await request).postDataJSON() as {
    recipient: { phone: string };
    ceilingMinor: number;
  };
  expect(
    body.recipient.phone === "+33100000000",
    "The preparation payload must retain the exact normalized fax recipient",
  ).toBe(true);
  expect(body.ceilingMinor).toBe(150);
});

function readGate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

for (const order of ["focus-first", "pagination-first"] as const)
  test(`coming back to the tab keeps loaded pages when reads overlap (${order})`, async ({
    page,
  }) => {
    await login(page);
    const before = (await (await page.request.get("/api/overview")).json()) as {
      dispatches: { total: number };
    };
    for (let index = before.dispatches.total; index < 32; index++)
      await prepareEmail(page, `focus-${index}`);
    const { dispatches } = (await (
      await page.request.get("/api/overview")
    ).json()) as { dispatches: { total: number } };
    await page.goto("/#/app/dispatches");
    await expect(
      page.getByRole("heading", { name: "Envois", exact: true }),
    ).toBeVisible();
    // The outgoing overview has the same selector while navigation is pending.
    const main = page.locator("#main-content");
    await expect(main).not.toHaveAttribute("inert", "");
    await expect(main).not.toHaveAttribute("aria-busy", "true");
    const rows = page.locator("tbody tr");
    const pageSize = main.getByRole("combobox", {
      name: "Lignes par page",
      exact: true,
    });
    await pageSize.selectOption("50");
    await expect(pageSize).toHaveValue("50");
    await expect(rows).toHaveCount(30);
    const firstPageReads: string[] = [];
    let cursorReads = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname !== "/api/dispatches") return;
      if (url.searchParams.has("cursor")) cursorReads++;
      else firstPageReads.push(url.search);
    });
    const firstReadStarted = readGate();
    const releaseFirstRead = readGate();
    const firstReadSettled = readGate();
    const cursorReadStarted = readGate();
    const releaseCursorRead = readGate();
    let holdFirstRead = true;
    let holdCursorRead = order === "pagination-first";
    await page.route("**/api/dispatches*", async (route) => {
      const url = new URL(route.request().url());
      const cursor = url.searchParams.has("cursor");
      if (
        url.pathname !== "/api/dispatches" ||
        (cursor ? !holdCursorRead : !holdFirstRead)
      )
        return route.continue();
      if (cursor) holdCursorRead = false;
      else holdFirstRead = false;
      const snapshot = await route.fetch();
      expect(snapshot.status()).toBe(200);
      (cursor ? cursorReadStarted : firstReadStarted).release();
      await (cursor ? releaseCursorRead : releaseFirstRead).promise;
      await route.fulfill({ response: snapshot });
      if (!cursor) firstReadSettled.release();
    });
    // Returning to a tab fires both events; one read covers them.
    const comeBack = () =>
      page.evaluate(() => {
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
    const loaded = Math.min(dispatches.total, 60);
    const loadedRows = async () => {
      await expect(rows).toHaveCount(Math.min(loaded, 50));
      const content = await rows.allTextContents();
      if (loaded > 50) {
        await page
          .getByRole("button", { name: "Page suivante", exact: true })
          .click();
        await expect(rows).toHaveCount(loaded - 50);
        content.push(...(await rows.allTextContents()));
        await page
          .getByRole("button", { name: "Page précédente", exact: true })
          .click();
        await expect(rows).toHaveCount(50);
      }
      expect(content).toHaveLength(loaded);
      return content;
    };
    try {
      const loadMore = page.getByRole("button", { name: "Afficher la suite" });
      if (order === "pagination-first") {
        await loadMore.click();
        await cursorReadStarted.promise;
      }
      await comeBack();
      await firstReadStarted.promise;
      await expect.poll(() => firstPageReads.length).toBe(1);
      if (order === "focus-first") await loadMore.click();
      else releaseCursorRead.release();
      const beforeBackgroundRead = await loadedRows();
      expect(cursorReads).toBe(1);
      // Release the older snapshot only after all appended rows are visible.
      releaseFirstRead.release();
      await firstReadSettled.promise;
      expect(await loadedRows()).toEqual(beforeBackgroundRead);
      await expect(main.getByRole("alert")).toHaveCount(0);
      await page.waitForTimeout(1100);
      await comeBack();
      // Absence check: the extra rows must survive another tab wake.
      await page.waitForTimeout(500);
      expect(firstPageReads).toHaveLength(1);
      expect(cursorReads).toBe(1);
      expect(await loadedRows()).toEqual(beforeBackgroundRead);

      await page
        .getByRole("button", { name: "Actualiser", exact: true })
        .click();
      await expect(rows).toHaveCount(30);
      expect(firstPageReads).toHaveLength(2);
      expect(cursorReads).toBe(1);
    } finally {
      releaseFirstRead.release();
      releaseCursorRead.release();
    }
  });

test("assistants read filtered lists but not the workspace summary", async ({
  page,
}) => {
  await login(page);
  const minted = await page.request.post("/api/dev/mcp-token", {
    headers: { Origin: origin, "X-CSRF-Token": await csrf(page) },
    data: {},
  });
  expect(minted.status()).toBe(200);
  const { token } = (await minted.json()) as { token: string };
  const bearer = { Authorization: `Bearer ${token}` };
  const summary = await page.request.get("/api/overview", { headers: bearer });
  expect(summary.status()).toBe(403);
  expect(
    ((await summary.json()) as { error: { code: string } }).error.code,
  ).toBe("BROWSER_REQUIRED");
  const filtered = await page.request.get("/api/dispatches?group=approval", {
    headers: bearer,
  });
  expect(filtered.status()).toBe(200);
  for (const item of (
    (await filtered.json()) as {
      items: { status: string }[];
    }
  ).items)
    expect(["prepared", "draft"]).toContain(item.status);
});

test("sign-out returns to the public site from the account menu", async ({
  page,
}) => {
  await login(page);
  // The account menu sits outside the navigation, including on phones.
  const account = page.locator(".sidebar-account");
  await account.locator(".workspace-identity-trigger").click();
  await account
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.locator(".landing")).toBeVisible();
  await expect(page.locator('.site-header a[href="/app"]')).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Entrer dans l’espace de travail" }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/session")).status()).toBe(401);
});

test("dashboard filters, confirmations and expiry copy follow the saved account language", async ({
  page,
}) => {
  await login(page);
  const prepared = await prepareEmail(page, "dashboard-language");
  const copies = [
    {
      locale: "en",
      summary: "Workspace summary",
      approval: "Awaiting approval",
      filter: "Show",
      refresh: "Refresh",
      cancel: "Request cancellation",
      confirm: "Yes, request cancellation",
      dismiss: "Keep unchanged",
      expiry: "Your session has expired.",
    },
    {
      locale: "de",
      summary: "Übersicht des Arbeitsbereichs",
      approval: "Zur Freigabe",
      filter: "Anzeigen",
      refresh: "Aktualisieren",
      cancel: "Stornierung anfordern",
      confirm: "Ja, Stornierung anfordern",
      dismiss: "Nichts ändern",
      expiry: "Ihre Sitzung ist abgelaufen.",
    },
    {
      locale: "lb",
      summary: "Iwwersiicht vum Aarbechtsberäich",
      approval: "Fir ze approuvéieren",
      filter: "Uweisen",
      refresh: "Aktualiséieren",
      cancel: "Annulatioun ufroen",
      confirm: "Jo, Annulatioun ufroen",
      dismiss: "Näischt änneren",
      expiry: "Är Sessioun ass ofgelaf.",
    },
  ];
  for (const copy of copies) {
    await page.goto("/#/app/account");
    await page.locator(".language-preference select").selectOption(copy.locale);
    await page.locator('form.form-panel button[type="submit"]').click();
    await expect(page.locator("html")).toHaveAttribute("lang", copy.locale);
    await page.goto("/#/app");
    await expect(page.locator('select[name="language"]')).toHaveCount(0);
    const stats = page.getByRole("list", { name: copy.summary });
    await expect(stats).toBeVisible();
    await stats.locator('a[href="#/app/dispatches?group=approval"]').click();
    const filters = page.getByRole("navigation", {
      name: copy.filter,
      exact: true,
    });
    await expect(
      filters.getByRole("link", { name: copy.approval, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.goto(`/#/app/dispatch/${prepared.id}`);
    await page.getByRole("button", { name: copy.cancel, exact: true }).click();
    await expect(
      page.getByRole("button", { name: copy.confirm, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: copy.dismiss, exact: true }).click();
    await page.goto("/#/app/dispatches?group=approval");
    await expect(
      page.getByRole("navigation", { name: copy.filter, exact: true }),
    ).toBeVisible();
    // A genuinely expired session refuses both the collection and the session
    // recheck. A concurrent healthy session response would correctly recover it.
    await page.route("**/api/dispatches?group=approval", (route) =>
      route.fulfill({
        status: 401,
        json: {
          error: { code: "UNAUTHENTICATED", message: "Session expired" },
        },
      }),
    );
    await page.route("**/api/session", (route) =>
      route.fulfill({
        status: 401,
        json: {
          error: { code: "UNAUTHENTICATED", message: "Session expired" },
        },
      }),
    );
    let listRejected = false;
    let sessionRejected = false;
    const listRead = page
      .waitForResponse(
        (response) =>
          response.url().endsWith("/api/dispatches?group=approval") &&
          response.request().method() === "GET" &&
          response.status() === 401,
      )
      .then((response) => {
        listRejected = true;
        return response;
      });
    const sessionRead = page
      .waitForResponse(
        (response) =>
          response.url().endsWith("/api/session") &&
          response.request().method() === "GET" &&
          response.status() === 401,
      )
      .then((response) => {
        sessionRejected = true;
        return response;
      });
    // Register observers before activation: iPhone WebKit can start its native
    // focus read while bringToFront is still completing.
    await page.bringToFront();
    await expect
      .poll(() => page.evaluate(() => document.visibilityState))
      .toBe("visible");
    // The first page revalidates on focus even while the collection cache is
    // warm. Repeated wakes may coalesce for one second; observe the actual reads.
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      expect(listRejected).toBe(true);
      expect(sessionRejected).toBe(true);
    }).toPass();
    expect((await listRead).status()).toBe(401);
    expect((await sessionRead).status()).toBe(401);
    await expect(page.locator(".session-expired")).toContainText(copy.expiry);
    await page.unroute("**/api/dispatches?group=approval");
    await page.unroute("**/api/session");
    const recovered = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/session") &&
        response.request().method() === "GET" &&
        response.status() === 200,
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect((await recovered).status()).toBe(200);
    await expect(page.locator(".session-expired")).toHaveCount(0);
  }
});
