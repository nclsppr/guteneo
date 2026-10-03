import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import type { HorizonPlan } from "../../apps/web/src/horizon-plan";
import type { PdfValidationReport } from "../../packages/contracts/src/pdf-validation";

const profileFixtures = {
  ua1: { rules: 106, specification: "ISO 14289-1:2014" },
  ua2: { rules: 1727, specification: "ISO 14289-2:2024" },
  "1b": { rules: 129, specification: "ISO 19005-1:2005" },
  "2b": { rules: 144, specification: "ISO 19005-2:2011" },
  "3b": { rules: 146, specification: "ISO 19005-3:2012" },
  "4": { rules: 109, specification: "ISO 19005-4:2020" },
};

const initialPlan: HorizonPlan = {
  plan: {
    id: "horizon",
    name: "guteneo Horizon",
    priceMinor: 3000,
    currency: "EUR",
    interval: "month",
  },
  termsVersion: "horizon-2026-10-02-v1",
  enabled: true,
  status: "inactive",
  entitled: false,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  billingManagementAllowed: false,
  paymentSource: "account_credits",
  evidence: "simulation",
  creditAvailableMinor: 5000,
};
async function fixture(
  page: Page,
  { role = "admin", enabled = true, entitled = false } = {},
) {
  const writes: { path: string; body: unknown; key?: string }[] = [];
  const reads: string[] = [];
  const unexpected: string[] = [];
  const plan: HorizonPlan = {
    ...initialPlan,
    enabled,
    entitled,
    status: entitled ? "active" : "inactive",
    billingManagementAllowed: role === "admin" && entitled,
    creditAvailableMinor: role === "admin" ? 5000 : null,
  };
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  const bytes = await pdf.save();
  const document = {
    id: "horizon_document",
    name: "Document de contrôle.pdf",
    sha256: "a".repeat(64),
    status: "ready",
    size: bytes.byteLength,
    pages: 1,
    source: "import",
    created_at: "2026-10-02T10:00:00Z",
  };
  const reports: PdfValidationReport[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown;
    if (request.method() === "GET") reads.push(path);
    else
      writes.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()["idempotency-key"],
      });
    if (path === "/api/session")
      body = {
        organization: { id: "org_horizon", name: "Atelier Horizon" },
        user: { id: `user_${role}`, name: "Camille", role },
        csrfToken: "fixture-only",
        simulation: true,
      };
    else if (path === "/api/capabilities")
      body = { mode: "production", horizon: { available: enabled } };
    else if (path === "/api/plan") body = plan;
    else if (path === "/api/plan/subscribe") {
      if (!plan.entitled) {
        plan.currentPeriodStart = "2026-10-02T10:00:00Z";
        plan.currentPeriodEnd = "2026-11-02T10:00:00Z";
        plan.creditAvailableMinor = (plan.creditAvailableMinor ?? 0) - 3000;
      }
      plan.status = "active";
      plan.entitled = true;
      plan.cancelAtPeriodEnd = false;
      plan.billingManagementAllowed = true;
      body = plan;
    } else if (path === "/api/plan/cancel") {
      plan.status = "cancelled";
      plan.cancelAtPeriodEnd = true;
      body = plan;
    } else if (path === "/api/documents")
      body = { items: [document], nextCursor: null };
    else if (path === `/api/documents/${document.id}`) body = document;
    else if (path === `/api/documents/${document.id}/content`) {
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: Buffer.from(bytes),
      });
      return;
    } else if (path === `/api/documents/${document.id}/validation`) {
      if (request.method() === "GET") body = { items: reports };
      else {
        const profile = request.postDataJSON()
          .profile as PdfValidationReport["profile"];
        const report: PdfValidationReport = {
          id: "report_horizon",
          documentId: document.id,
          sha256: document.sha256,
          profile,
          createdAt: "2026-10-02T10:00:00Z",
          evidence: "simulation",
          engine: { name: "veraPDF", version: "1.30.2" },
          compliant: false,
          passedRules: profileFixtures[profile].rules - 1,
          failedRules: 1,
          failedChecks: 2,
          truncated: false,
          findings: [
            {
              specification: profileFixtures[profile].specification,
              clause: "7.1",
              testNumber: 1,
              failedChecks: 2,
            },
          ],
          manualReviewRequired: true,
          manualChecks: [
            { id: "reading_order", title: "Ordre de lecture" },
            { id: "alternative_text", title: "Textes alternatifs" },
          ],
          status: "failed",
          certification: false,
        };
        reports.push(report);
        body = report;
      }
    } else if (path === "/api/billing")
      body = {
        status: "configuration_required",
        mode: "unconfigured",
        customerLinked: false,
        portalAvailable: false,
        welcomeCredit: {
          kind: "simulation",
          currency: "EUR",
          grantedMinor: 5000,
          reservedMinor: 0,
          spentMinor: 0,
          availableMinor: 5000,
          status: "simulation",
          renewal: "none",
          topUpAvailable: false,
        },
        topUpAvailable: false,
        subscriptions: [],
        usageLedger: { kind: "simulation", period: "2026-10", channels: [] },
      };
    else if (path.startsWith("/api/billing/"))
      body = { items: [], nextCursor: null };
    else {
      unexpected.push(path);
      body = {};
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return { plan, document, reports, writes, reads, unexpected };
}

test("an inactive admin sees the offer before any billing read and explicitly accepts monthly credits", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/billing");
  await expect(
    page.getByRole("heading", { name: "Forfait Horizon", exact: true }),
  ).toBeVisible();
  expect(state.reads.filter((path) => path.startsWith("/api/billing"))).toEqual(
    [],
  );
  const subscribe = page.getByRole("button", {
    name: "Souscrire Horizon",
    exact: true,
  });
  await expect(subscribe).toBeDisabled();
  const consent = page.getByRole("checkbox", {
    name: /J’accepte le forfait Horizon à 30,00/,
  });
  await consent.check();
  await subscribe.click();
  await expect(page.getByText("Forfait actif", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({
    path: "/api/plan/subscribe",
    body: { consent: true, termsVersion: "horizon-2026-10-02-v1" },
  });
  expect(state.writes[0].key).toBeTruthy();
  await expect(
    page.getByText("Aucune facture enregistrée pour cet espace."),
  ).toBeVisible();
  expect(state.reads).toContain("/api/billing/invoices");
  expect(state.unexpected).toEqual([]);
});

test("only an admin can cancel and cancellation needs separate explicit consent", async ({
  page,
}) => {
  const state = await fixture(page, { entitled: true });
  await page.goto("/#/app/plan");
  await page.getByText("Résilier le forfait", { exact: true }).click();
  const cancel = page.getByRole("button", { name: "Confirmer la résiliation" });
  await expect(cancel).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Je confirme l’arrêt du renouvellement mensuel.",
    })
    .check();
  await cancel.click();
  await expect(
    page.getByText("Résiliation programmée", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ path: "/api/plan/cancel", body: {} });
  expect(state.writes[0].key).toBeTruthy();
});

for (const status of ["active", "past_due"] as const) {
  test(`an admin can stop ${status} renewal when PDF validation is disabled`, async ({
    page,
  }) => {
    const state = await fixture(page, { enabled: false });
    state.plan.status = status;
    state.plan.currentPeriodStart = "2026-10-02T10:00:00Z";
    state.plan.currentPeriodEnd = "2026-11-02T10:00:00Z";
    await page.goto("/#/app/plan");
    await expect(
      page.getByText("Le service Horizon est indisponible", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Souscrire Horizon" }),
    ).toHaveCount(0);
    await page.getByText("Résilier le forfait", { exact: true }).click();
    const cancel = page.getByRole("button", {
      name: "Confirmer la résiliation",
    });
    await expect(cancel).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: "Je confirme l’arrêt du renouvellement mensuel.",
      })
      .check();
    await cancel.click();
    await expect(
      page.getByText("Résiliation programmée", { exact: true }),
    ).toBeVisible();
    expect(state.plan.entitled).toBe(false);
    expect(state.writes).toMatchObject([
      { path: "/api/plan/cancel", body: {} },
    ]);
    expect(state.writes[0].key).toBeTruthy();
    expect(state.reads.some((path) => path.startsWith("/api/billing"))).toBe(
      false,
    );
  });
}

test("an admin explicitly restores renewal in the paid period without another charge", async ({
  page,
}) => {
  const state = await fixture(page, { entitled: true });
  Object.assign(state.plan, {
    status: "cancelled",
    cancelAtPeriodEnd: true,
    currentPeriodStart: "2026-10-02T10:00:00Z",
    currentPeriodEnd: "2026-11-02T10:00:00Z",
    creditAvailableMinor: 0,
  });
  await page.goto("/#/app/plan");
  const restore = page.getByRole("button", {
    name: "Rétablir le renouvellement",
  });
  await expect(restore).toBeDisabled();
  await expect(page.getByText(/sans nouveau débit/)).toBeVisible();
  await page
    .getByRole("checkbox", { name: /J’accepte le forfait Horizon/ })
    .check();
  await restore.click();
  await expect(page.getByText("Forfait actif", { exact: true })).toBeVisible();
  expect(state.writes).toMatchObject([
    {
      path: "/api/plan/subscribe",
      body: { consent: true, termsVersion: "horizon-2026-10-02-v1" },
    },
  ]);
  expect(state.plan.creditAvailableMinor).toBe(0);
  expect(state.plan.currentPeriodEnd).toBe("2026-11-02T10:00:00Z");
});

test("members see their entitlement without billing information or subscription controls", async ({
  page,
}) => {
  const state = await fixture(page, { role: "observer", entitled: true });
  await page.goto("/#/app/plan");
  await expect(page.getByText("Forfait actif", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Gérer la facturation" }),
  ).toHaveCount(0);
  await page.goto("/#/app/billing");
  await expect(
    page.getByText("Un accès administrateur est nécessaire"),
  ).toBeVisible();
  expect(state.reads.filter((path) => path.startsWith("/api/billing"))).toEqual(
    [],
  );
  expect(state.writes).toEqual([]);
});

test("the disabled service shows preparation copy with no activation control", async ({
  page,
}) => {
  const state = await fixture(page, { enabled: false });
  await page.goto("/#/app/plan");
  await expect(
    page.getByText("Bientôt disponible", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Souscrire Horizon" }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("PDF validation preserves source evidence, exports JSON and keeps human checks unasserted at 320px", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const state = await fixture(page, { entitled: true });
  await page.goto(`/#/app/documents?document=${state.document.id}`);
  const panel = page.locator(".pdf-validation");
  await expect(panel.getByLabel("Profil de validation")).toBeVisible();
  await expect(panel.locator("select option")).toHaveCount(6);
  await panel.getByLabel("Profil de validation").selectOption("ua2");
  await panel.getByRole("button", { name: "Contrôler ce PDF" }).click();
  await expect(panel.getByText("Écarts techniques détectés")).toBeVisible();
  await expect(
    panel.getByText(
      "Rapport de simulation : il ne prouve pas la conformité du PDF.",
    ),
  ).toBeVisible();
  await expect(panel.getByText("ISO 14289-2:2024")).toBeVisible();
  await panel.getByText("Revue humaine à compléter", { exact: true }).click();
  await expect(
    panel.getByText("Vérifier l’ordre de lecture avec un lecteur d’écran"),
  ).toBeVisible();
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Exporter le rapport JSON" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("guteneo-ua2-report_horizon.json");
  expect(state.writes).toMatchObject([
    {
      path: `/api/documents/${state.document.id}/validation`,
      body: { profile: "ua2" },
    },
  ]);
  expect(state.writes[0].key).toBeTruthy();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  expect(state.unexpected).toEqual([]);
  await panel.screenshot({
    path: `/tmp/guteneo-horizon-pdf-${info.project.name}.png`,
  });
});

test("the public offer keeps closed availability, scope and allowance visible", async ({
  page,
}, info) => {
  await fixture(page, { enabled: false });
  await page.goto("/#horizon");
  const offer = page.locator(".horizon-public");
  await expect(
    offer.getByRole("heading", { name: "guteneo Horizon" }),
  ).toBeVisible();
  await expect(
    offer.getByText("Souscription indisponible", { exact: true }),
  ).toBeVisible();
  await expect(offer).toContainText(
    "100 tentatives de contrôle par mois civil",
  );
  await expect(offer).toContainText("10 Mio et 100 pages maximum");
  await expect(offer).toContainText(
    "Repérez les obstacles dans vos PDF avant de les partager.",
  );
  await page
    .getByText("La loi européenne impose-t-elle des PDF accessibles ?", {
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Il n’impose pas une obligation universelle à tous les PDF/),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await offer.screenshot({
    path: `/tmp/guteneo-horizon-public-${info.project.name}.png`,
  });
});

for (const [locale, status, credit, renewal, topUp] of [
  [
    "fr",
    "Disponible dans votre atelier",
    "crédits promotionnels",
    "sans dette ni solde négatif",
    "La recharge de crédits n’est pas encore disponible",
  ],
  [
    "en",
    "Available in your workspace",
    "promotional credits",
    "without debt or a negative balance",
    "Credit top-ups are not available yet",
  ],
  [
    "de",
    "In Ihrem Arbeitsbereich verfügbar",
    "Aktionsguthaben",
    "ohne Schulden oder einen negativen Saldo",
    "Guthabenaufladungen sind noch nicht verfügbar",
  ],
  [
    "lb",
    "An Ärem Atelier disponibel",
    "Promotiounskredit",
    "ouni Schold oder negative Solde",
    "Kredit oplueden ass nach net méiglech",
  ],
]) {
  test(`public Horizon opens from the production signal with credit terms in ${locale}`, async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto(`/?lang=${locale}#horizon`);
    const offer = page.locator(".horizon-public");
    await expect(offer.getByText(status, { exact: true })).toBeVisible();
    await expect(offer).toContainText(credit);
    await expect(offer).toContainText(renewal);
    await expect(offer).toContainText(topUp);
    await expect(offer.getByRole("link")).toHaveAttribute("href", "/app/plan");
    await expect(offer.getByRole("checkbox")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    expect(state.writes).toEqual([]);
    expect(
      state.reads.filter((path) => path === "/api/capabilities"),
    ).toHaveLength(1);
    expect(state.unexpected).toEqual([]);
  });
}

test("one homepage capability read keeps the offer and FAQ aligned through loading, closure and failure", async ({
  page,
}) => {
  const state = await fixture(page);
  let available: boolean | null = true;
  let requests = 0;
  let releaseFirst: () => void = () => {};
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.route("**/api/capabilities", async (route) => {
    requests += 1;
    if (requests === 1) await firstResponse;
    if (available === null) await route.abort("failed");
    else
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "production", horizon: { available } }),
      });
  });

  const offer = page.locator(".horizon-public");
  const faqWarning = page.getByText(
    "Consultez l’offre dans votre atelier pour vérifier la disponibilité du service avant de souscrire.",
    { exact: true },
  );
  const openFaq = () =>
    page
      .getByText("Que comprennent les contrôles PDF du forfait Horizon ?", {
        exact: true,
      })
      .click();
  await page.goto("/#horizon");
  await expect(offer).toHaveAttribute("aria-busy", "true");
  await expect(
    offer.getByText("Consultez votre atelier", { exact: true }),
  ).toBeVisible();
  await openFaq();
  await expect(faqWarning).toBeVisible();
  releaseFirst();
  await expect(offer).toHaveAttribute("aria-busy", "false");
  await expect(
    offer.getByText("Disponible dans votre atelier", { exact: true }),
  ).toBeVisible();
  await expect(faqWarning).toHaveCount(0);
  expect(requests).toBe(1);

  available = false;
  await page.reload();
  await expect(offer).toHaveAttribute("aria-busy", "false");
  await expect(
    offer.getByText("Souscription indisponible", { exact: true }),
  ).toBeVisible();
  await openFaq();
  await expect(faqWarning).toBeVisible();
  expect(requests).toBe(2);

  available = null;
  await page.reload();
  await expect(offer).toHaveAttribute("aria-busy", "false");
  await expect(
    offer.getByText("Consultez votre atelier", { exact: true }),
  ).toBeVisible();
  await openFaq();
  await expect(faqWarning).toBeVisible();
  expect(requests).toBe(3);

  // Returning through the SPA reads once for the private workspace and once
  // for the new homepage entry, rather than retaining the failed public read.
  available = true;
  await page.evaluate(() => {
    window.location.hash = "/app/plan";
  });
  await expect(
    page.getByRole("heading", { name: "Forfait Horizon", level: 1 }),
  ).toBeVisible();
  await expect.poll(() => requests).toBe(4);
  await page.evaluate(() => {
    window.location.hash = "horizon";
  });
  await expect(offer).toHaveAttribute("aria-busy", "false");
  await expect(
    offer.getByText("Disponible dans votre atelier", { exact: true }),
  ).toBeVisible();
  await expect(faqWarning).toHaveCount(0);
  expect(requests).toBe(5);
  expect(state.writes).toEqual([]);
});

test("the public offer never announces availability from missing, simulated or failed capabilities", async ({
  page,
}) => {
  const state = await fixture(page);
  for (const response of [
    { horizon: { available: true } },
    { mode: "simulation", horizon: { available: true } },
    null,
  ]) {
    await page.route("**/api/capabilities", async (route) => {
      if (response === null) await route.abort("failed");
      else
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(response),
        });
    });
    await page.goto("/#horizon");
    const offer = page.locator(".horizon-public");
    await expect(offer).toHaveAttribute("aria-busy", "false");
    await expect(
      offer.getByText("Consultez votre atelier", { exact: true }),
    ).toBeVisible();
    await expect(offer).toContainText(
      "La disponibilité du forfait est confirmée dans votre atelier",
    );
    await expect(
      offer.getByText("Disponible dans votre atelier", { exact: true }),
    ).toHaveCount(0);
    await page.unroute("**/api/capabilities");
  }
  expect(state.writes).toEqual([]);
});

test("an uncertain PDF request is never retried automatically and explicit replay keeps its key", async ({
  page,
  hasTouch,
}) => {
  const state = await fixture(page, { entitled: true });
  const keys: string[] = [];
  await page.route("**/api/documents/*/validation", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) await route.abort("failed");
    else await route.fallback();
  });
  await page.goto(`/#/app/documents?document=${state.document.id}`);
  const panel = page.locator(".pdf-validation");
  const control = panel.getByRole("button", { name: "Contrôler ce PDF" });
  // Exercise native touch activation on phone projects. Synthetic mouse clicks
  // in touch WebKit have completed without submitting the rapidly moved form.
  const activate = () => (hasTouch ? control.tap() : control.click());
  await activate();
  await expect(panel.getByRole("alert")).toBeVisible();
  expect(keys).toHaveLength(1);
  await activate();
  await expect(panel.getByText("Écarts techniques détectés")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  await activate();
  await expect.poll(() => keys.length).toBe(3);
  expect(keys[2]).not.toBe(keys[1]);
});

for (const [locale, title, status] of [
  ["en", "Horizon plan", "Coming soon"],
  ["de", "Horizon-Tarif", "Bald verfügbar"],
  ["lb", "Horizon-Abonnement", "Geschwënn disponibel"],
]) {
  test(`Horizon offer has translated consent and status in ${locale}`, async ({
    page,
  }) => {
    await fixture(page, { enabled: false });
    await page.goto(`/?lang=${locale}#/app/plan`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(status, { exact: true })).toBeVisible();
    await expect(
      page.getByText("Cette offre est en préparation", { exact: false }),
    ).toHaveCount(0);
  });
}
