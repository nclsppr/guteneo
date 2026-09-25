import { test, expect, type Page } from "./fixtures";
import { PDFDocument } from "pdf-lib";

const origin = "http://localhost:8787";

async function login(page: Page) {
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
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
  const stats = page.getByRole("list", { name: "Synthèse de l’atelier" });
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
  await page.goto("/#/app/documents");
  await page.goto("/#/app");
  const notice = page.getByRole("status").filter({
    hasText: "Des envois demandent votre attention.",
  });
  await expect(notice).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Synthèse de l’atelier" })
      .getByRole("link", { name: /^À vérifier/ }),
  ).toContainText("4");
  await notice
    .getByRole("link", { name: "Voir les envois à vérifier" })
    .click();
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
  await page.getByRole("button", { name: "Actualiser" }).click();
  const expired = page
    .getByRole("alert")
    .filter({ hasText: "Votre session a expiré." });
  await expect(expired).toBeVisible();
  await expired.getByRole("button", { name: "Se reconnecter" }).click();
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
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
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
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
}) => {
  await login(page);
  const document = await importPdf(page, "ceiling-euros.pdf");
  await page.goto(`/#/app/prepare?document=${document.id}`);
  // "(0)" is the optional trunk prefix: accepted while typing, then dropped.
  await page
    .getByLabel("Numéro de fax international")
    .fill("+33 (0)1 00 00 00 00");
  const ceiling = page.getByLabel("Plafond de cet envoi, en euros", {
    exact: true,
  });
  await expect(ceiling).toHaveValue("5");
  // A French decimal comma typed key by key: a number field would drop it
  // and turn 1,5 € into 15 €.
  await ceiling.fill("");
  await ceiling.pressSequentially("1,5");
  await expect(ceiling).toHaveValue("1,5");
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
  expect(body.recipient.phone).toBe("+33100000000");
  expect(body.ceilingMinor).toBe(150);
});

test("coming back to the tab re-reads the list once and keeps loaded pages", async ({
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
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(30);
  const firstPageReads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/dispatches" && !url.searchParams.has("cursor"))
      firstPageReads.push(url.search);
  });
  // Returning to a tab fires both events; one read covers them.
  const comeBack = () =>
    page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
  await comeBack();
  await expect.poll(() => firstPageReads.length).toBe(1);

  await page.getByRole("button", { name: "Afficher la suite" }).click();
  const loaded = Math.min(dispatches.total, 60);
  await expect(rows).toHaveCount(loaded);
  await page.waitForTimeout(1100);
  await comeBack();
  // Absence check: the extra rows must survive a background re-read.
  await page.waitForTimeout(500);
  expect(firstPageReads).toHaveLength(1);
  await expect(rows).toHaveCount(loaded);

  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(rows).toHaveCount(30);
  expect(firstPageReads).toHaveLength(2);
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

test("sign-out lives in the navigation menu on small screens", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium",
    "The desktop sidebar keeps its footer sign-out.",
  );
  await login(page);
  const topbar = page.locator(".app-topbar");
  await expect(
    topbar.getByRole("button", { name: "Se déconnecter" }),
  ).toHaveCount(0);
  await page.getByText("Navigation de l’atelier").click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(
    page.getByRole("button", { name: "Entrer dans l’Atelier" }),
  ).toBeVisible();
});
