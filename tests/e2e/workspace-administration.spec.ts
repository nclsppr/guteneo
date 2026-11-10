import { expect, test, type Page } from "@playwright/test";
import { workspacePermissions } from "../../packages/contracts/src/roles";

// Intercepted API only: fictional workspace data, no business write.
async function fixture(
  page: Page,
  role: "admin" | "supervisor" | "member" | "viewer",
  locale = "fr",
) {
  let workspace = "administration-fixture";
  let canReport = true;
  const totals = new Map<string, number>();
  const reads: string[] = [];
  const writes: string[] = [];
  const now = "2026-10-30T10:00:00.000Z";
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(4);
    if (request.method() === "GET") reads.push(`${path}${url.search}`);
    else writes.push(path);
    let body: unknown = { items: [], nextCursor: null };
    if (path === "/session")
      body = {
        organization: {
          id: workspace,
          name:
            workspace === "administration-fixture"
              ? "Atelier Alpha"
              : "Atelier Beta",
        },
        user: {
          id: "administration-user",
          preferredLocale: locale,
          name: role === "admin" ? "Camille Admin" : "Lou Rapports",
          role,
          supervisorCanReport: role === "supervisor" && canReport,
        },
        permissions: workspacePermissions(role, { canReport }),
        csrfToken: "fixture-only",
        simulation: true,
      };
    else if (path === "/capabilities")
      body = { scanner: "disabled_in_local_simulation" };
    else if (path === "/personal/session")
      body = {
        user: {
          id: "administration-user",
          name: "Camille Admin",
          email: "admin@example.invalid",
          preferredLocale: locale,
        },
        csrfToken: "fixture-only",
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
        // The server projects each membership's current report right.
        workspaces: [
          {
            id: workspace,
            name: "Atelier Alpha",
            role,
            current: true,
            canViewReports: workspacePermissions(role, { canReport })
              .viewReports,
          },
        ],
      };
    else if (path === "/personal/documents/summary") {
      const counts = {
        total: 0,
        available: 0,
        pending: 0,
        expiring: 0,
        ended: 0,
      };
      body = {
        shared: counts,
        personal: counts,
        senders: [],
        sendersTotal: 0,
        expiringDays: 14,
      };
    } else if (path === "/account/expert-approval")
      body = {
        canManage: role === "admin",
        connections: [],
        day: "2026-10-30",
      };
    else if (path === "/account/sessions" || path === "/account/contacts")
      body = { items: [], hasMore: false };
    else if (path === "/administration/overview")
      body = {
        generatedAt: now,
        period: { from: "2026-10-01", to: "2026-10-30" },
        workspace: {
          id: workspace,
          name:
            workspace === "administration-fixture"
              ? "Atelier Alpha"
              : "Atelier Beta",
          mode: "simulation",
          createdAt: now,
        },
        totals: {
          dispatches:
            totals.get(url.searchParams.get("from") ?? "") ??
            (workspace === "administration-fixture" ? 1234 : 5678),
          delivered: 1200,
          attention: 3,
          pages: 4321,
          consumptionMinor: 98765,
          reservedMinor: 1200,
          documents: 456,
          secureShares: 78,
          members: 9,
          activeConnections: 4,
        },
        credit: { grantedMinor: 5000, availableMinor: 1234 },
        trend: Array.from({ length: 30 }, (_, index) => ({
          date: `2026-10-${String(index + 1).padStart(2, "0")}`,
          dispatches: index,
          delivered: index,
          consumptionMinor: index * 10,
          connections: index % 3,
        })),
        channels: [
          {
            channel: "email",
            dispatches: 1000,
            consumptionMinor: 50000,
            reservedMinor: 0,
          },
          {
            channel: "postal",
            dispatches: 234,
            consumptionMinor: 48765,
            reservedMinor: 1200,
          },
        ],
        statuses: [
          { status: "delivered", dispatches: 1200 },
          { status: "failed", dispatches: 3 },
        ],
        incidents: [
          { kind: "dispatch_attention", count: 3, severity: "warning" },
        ],
      };
    else if (path === "/administration/consumption")
      body = {
        generatedAt: now,
        period: { from: "2026-10-01", to: "2026-10-30" },
        basis: "simulation_confirmation",
        totalMinor: 0,
        reservedMinor: 0,
        credit: null,
        services: [],
        channels: [],
        daily: [],
        monthly: [],
      };
    else if (path === "/usage")
      body = {
        items: [],
        period: "2026-10",
        currentPeriod: "2026-10",
        availablePeriods: ["2026-10"],
      };
    else if (path === "/usage/activity")
      body = {
        year: Number(url.searchParams.get("year")),
        timezone: "UTC",
        currency: "EUR",
        evidence: "simulation",
        asOf: now,
        availableYears: [2026],
        totals: {
          amountMinor: 0,
          dispatchCount: 0,
          chargeCount: 0,
          activeDays: 0,
        },
        days: [],
      };
    else if (path === "/administration/activity")
      body = {
        items: [
          {
            id: "dispatch-administration-1",
            channel: "email",
            status: "delivered",
            createdAt: now,
            updatedAt: now,
            pages: 2,
            deliveryMode: "attachment",
            destinationCountry: null,
            estimatedMinor: 10,
            ceilingMinor: 20,
            consumptionMinor: 10,
            reservedMinor: 0,
            approvedBy: "Camille Admin",
            campaignId: null,
          },
        ],
        total: 1234,
        page: Number(url.searchParams.get("page") ?? 1),
        pageSize: 50,
      };
    else if (path === "/administration/exports/report") {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            'attachment; filename="guteneo-atelier-alpha-report-2026-10-01-2026-10-30-simulation.xlsx"',
        },
        body: "PK fictional workbook",
      });
      return;
    }
    await route.fulfill({ status: 200, json: body });
  });
  return {
    reads,
    writes,
    switchWorkspace(id: string) {
      workspace = id;
    },
    changeRole(next: typeof role) {
      role = next;
    },
    revokeReports() {
      canReport = false;
    },
    overviewTotal(from: string, total: number) {
      totals.set(from, total);
    },
  };
}

const navigation = (page: Page) =>
  page.getByRole("navigation", {
    name: "Navigation de l’administration",
    exact: true,
  });

test("an administrator manages the workspace in Administration, not in the profile", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/administration");
  await expect(page.locator("main h1")).toHaveText(
    "Vue d’ensemble de l’espace de travail",
  );
  await expect(page.locator(".stat-tile").first()).toContainText("1 234");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "3 envois demandent une vérification." }),
  ).toBeVisible();
  const summary = page.locator(".workspace-navigation summary");
  if (await summary.isVisible()) await summary.click();
  await expect(navigation(page).getByRole("link")).toHaveText([
    "Vue d’ensemble",
    "Activité",
    "Consommation",
    "Rapports",
    "Membres",
    "Accès",
    "Journal d’audit",
    "Webhooks clients",
    "Facturation",
    "Exploitation",
    "Paramètres",
  ]);
  await navigation(page)
    .getByRole("link", { name: "Activité", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText(
    "Activité de l’espace de travail",
  );
  await expect(page.getByText("dispatch-administration-1")).toBeVisible();
  const dispatchLink = page.getByRole("link", {
    name: "dispatch-administration-1",
    exact: true,
  });
  const dispatchTarget = await dispatchLink.boundingBox();
  expect(dispatchTarget?.width).toBeGreaterThanOrEqual(24);
  expect(dispatchTarget?.height).toBeGreaterThanOrEqual(24);
  await expect(
    page.getByRole("button", { name: "Page suivante", exact: true }),
  ).toBeVisible();
  // Earlier addresses land on their Administration views.
  await page.goto("/#/app/admin");
  await expect(page).toHaveURL(/#\/app\/administration\/members$/);
  await expect(page.locator("main h1")).toHaveText("Membres et invitations");
  await page.goto("/#/app/account");
  await expect(
    page.getByLabel("Nom de l’espace de travail", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: "Gérer cet espace de travail dans Administration",
    }),
  ).toHaveAttribute("href", "#/app/administration");
  await page.goto("/#/app/administration/settings");
  await expect(
    page.getByLabel("Nom de l’espace de travail", { exact: true }),
  ).toHaveValue("Atelier Alpha");
  expect(state.writes).toEqual([]);
});

test("a report download goes through the session and names the period", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto(
    "/#/app/administration/reports?from=2026-10-01&to=2026-10-30",
  );
  await expect(page.locator("main h1")).toHaveText("Rapports et exports");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", {
        name: "Télécharger Rapport complet de l’espace de travail au format Excel",
      })
      .click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    "guteneo-atelier-alpha-report-2026-10-01-2026-10-30-simulation.xlsx",
  );
  expect(state.reads).toContainEqual(
    expect.stringMatching(
      /^\/administration\/exports\/report\?format=xlsx&locale=fr&from=2026-10-01&to=2026-10-30$/,
    ),
  );
  // A CSV holds one table: the complete report offers Excel and PDF only.
  await expect(
    page.getByRole("button", {
      name: "Télécharger Rapport complet de l’espace de travail au format CSV",
    }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("a supervisor with report permission sees report views only", async ({
  page,
}) => {
  const state = await fixture(page, "supervisor");
  await page.goto("/#/app/administration");
  await expect(page.locator("main h1")).toHaveText(
    "Vue d’ensemble de l’espace de travail",
  );
  const summary = page.locator(".workspace-navigation summary");
  if (await summary.isVisible()) await summary.click();
  await expect(navigation(page).getByRole("link")).toHaveText([
    "Vue d’ensemble",
    "Activité",
    "Consommation",
    "Rapports",
  ]);
  await page.goto("/#/app/administration/members");
  await expect(
    page.getByText("Votre rôle ne permet pas cette action.", { exact: false }),
  ).toBeVisible();
  expect(state.reads.some((read) => read.startsWith("/admin/members"))).toBe(
    false,
  );
  await page.goto("/#/app/administration/reports");
  await expect(
    page.getByRole("heading", { name: "Membres", exact: true }),
  ).toHaveCount(0);
});

test("period fields follow presets, browser Back and invalid date recovery", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/administration?from=2026-10-01&to=2026-10-30");
  const start = page.getByLabel("Date de début", { exact: true });
  const end = page.getByLabel("Date de fin", { exact: true });
  await expect(start).toHaveValue("2026-10-01");
  await start.fill("2026-10-05");
  await page.getByRole("button", { name: "7 jours", exact: true }).click();
  await expect(async () => {
    const query = new URLSearchParams(new URL(page.url()).hash.split("?")[1]);
    await expect(start).toHaveValue(query.get("from")!);
    await expect(end).toHaveValue(query.get("to")!);
  }).toPass();
  await page.goBack();
  await expect(start).toHaveValue("2026-10-01");
  await expect(end).toHaveValue("2026-10-30");
  await expect(page.locator(".stat-tile").first()).toBeVisible();
  const currentUrl = page.url();
  const readsBefore = state.reads.length;
  await start.fill("2024-01-01");
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Choisissez une période d’au plus 366 jours.",
  );
  await expect(start).toHaveValue("2024-01-01");
  await expect(end).toHaveValue("2026-10-30");
  expect(page.url()).toBe(currentUrl);
  expect(state.reads).toHaveLength(readsBefore);
  await page.goto("/#/app/administration?from=2026-99-99&to=2026-11-03");
  await expect(page.locator("main h1")).toHaveText(
    "Vue d’ensemble de l’espace de travail",
  );
  await expect(start).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(start).not.toHaveValue("2026-99-99");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("a workspace administrator can return from My documents to Administration", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/my-documents");
  await expect(page.locator("main h1")).toHaveText("Mes documents");
  await page.getByRole("button", { name: /^Application/ }).click();
  await page
    .getByRole("navigation", { name: "Applications", exact: true })
    .getByRole("link", { name: "Administration", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText(
    "Vue d’ensemble de l’espace de travail",
  );
  await expect(page.locator(".stat-tile").first()).toContainText("1 234");
  expect(state.writes).toEqual([]);
});

test("a supervisor with report permission reaches Administration from My documents", async ({
  page,
}) => {
  const state = await fixture(page, "supervisor");
  await page.goto("/#/app/my-documents");
  await expect(page.locator("main h1")).toHaveText("Mes documents");
  await page.getByRole("button", { name: /^Application/ }).click();
  await page
    .getByRole("navigation", { name: "Applications", exact: true })
    .getByRole("link", { name: "Administration", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText(
    "Vue d’ensemble de l’espace de travail",
  );
  expect(state.reads.some((read) => read.startsWith("/admin/members"))).toBe(
    false,
  );
  expect(state.writes).toEqual([]);
});

test("My documents stops offering Administration once the report right is removed", async ({
  page,
}) => {
  const state = await fixture(page, "supervisor");
  state.revokeReports();
  await page.goto("/#/app/my-documents");
  await expect(page.locator("main h1")).toHaveText("Mes documents");
  await page.getByRole("button", { name: /^Application/ }).click();
  const applications = page.getByRole("navigation", {
    name: "Applications",
    exact: true,
  });
  await expect(
    applications.getByRole("link", { name: "Mes documents", exact: true }),
  ).toBeVisible();
  await expect(
    applications.getByRole("link", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  expect(state.reads.some((read) => read.startsWith("/administration/"))).toBe(
    false,
  );
  expect(state.writes).toEqual([]);
});

test("a late period response cannot replace the current report", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  state.overviewTotal("2026-10-01", 1111);
  state.overviewTotal("2026-10-05", 2222);
  await page.addInitScript(() => {
    const original = fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (
        url.pathname !== "/api/administration/overview" ||
        url.searchParams.get("from") !== "2026-10-01"
      )
        return original(input, init);
      const response = await original(input, { ...init, signal: undefined });
      await new Promise<void>((resolve) =>
        Reflect.set(window, "releaseOldReport", resolve),
      );
      return response;
    };
  });
  await page.goto("/#/app/administration?from=2026-10-01&to=2026-10-30");
  await page.waitForFunction(() =>
    Boolean(Reflect.get(window, "releaseOldReport")),
  );
  await page
    .locator("details.administration-custom")
    .evaluate((panel) => panel.setAttribute("open", ""));
  await page.getByLabel("Date de début", { exact: true }).fill("2026-10-05");
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(page.locator(".stat-tile").first()).toContainText("2 222");
  await page.evaluate(() => Reflect.get(window, "releaseOldReport")());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".stat-tile").first()).toContainText("2 222");
  expect(state.writes).toEqual([]);
});

test("a refused refresh clears already loaded report metadata", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/administration");
  await expect(page.locator(".stat-tile").first()).toContainText("1 234");
  await page.route("**/api/administration/overview?**", (route) =>
    route.fulfill({
      status: 403,
      json: {
        error: { code: "MEMBERSHIP_CHANGED", message: "Membership changed." },
      },
    }),
  );
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".stat-tile")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("a delayed export does not download after its period changes", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.addInitScript(() => {
    const original = fetch.bind(window);
    window.fetch = async (input, init) => {
      if (!String(input).includes("/administration/exports/"))
        return original(input, init);
      const response = await original(input, { ...init, signal: undefined });
      await new Promise<void>((resolve) =>
        Reflect.set(window, "releaseOldExport", resolve),
      );
      return response;
    };
  });
  await page.goto(
    "/#/app/administration/reports?from=2026-10-01&to=2026-10-30",
  );
  await page
    .getByRole("button", {
      name: "Télécharger Rapport complet de l’espace de travail au format Excel",
      exact: true,
    })
    .click();
  await page.waitForFunction(() =>
    Boolean(Reflect.get(window, "releaseOldExport")),
  );
  await page.getByRole("button", { name: "7 jours", exact: true }).click();
  await expect(page).not.toHaveURL(/from=2026-10-01/);
  await page.evaluate(() => Reflect.get(window, "releaseOldExport")());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(downloads).toEqual([]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("workspace A to B to A and permission removal never retain another workspace report", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/administration");
  await expect(page.locator(".stat-tile").first()).toContainText("1 234");
  for (const [workspace, total] of [
    ["administration-beta", "5 678"],
    ["administration-fixture", "1 234"],
  ]) {
    state.switchWorkspace(workspace);
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.locator(".stat-tile").first()).toContainText(total, {
        timeout: 250,
      });
    }).toPass();
  }
  state.changeRole("viewer");
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText(
        "Votre rôle ne donne pas accès aux rapports de l’espace de travail.",
        {
          exact: false,
        },
      ),
    ).toBeVisible({ timeout: 250 });
  }).toPass();
  await expect(page.locator(".stat-tile")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

for (const [locale, heading] of [
  ["fr", "Vue d’ensemble de l’espace de travail"],
  ["en", "Workspace overview"],
  ["de", "Übersicht des Arbeitsbereichs"],
  ["lb", "Iwwersiicht vum Aarbechtsberäich"],
])
  test(`Administration uses the shared responsive layout in ${locale}`, async ({
    page,
  }, info) => {
    const state = await fixture(page, "admin", locale);
    await page.goto("/#/app/administration");
    await expect(page.locator("main h1")).toHaveText(heading);
    await expect(page.locator(".stat-tile").first()).toBeVisible();
    const readyMs = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now())),
          );
        }),
    );
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`administration-${locale}.png`),
      fullPage: true,
    });
    if (locale === "fr") {
      const resources = await page.evaluate(() => ({
        resources: performance.getEntriesByType("resource").map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          return {
            path: new URL(resource.name).pathname,
            encodedBodySize: resource.encodedBodySize,
            transferSize: resource.transferSize,
          };
        }),
      }));
      await info.attach("administration-entry-measurement", {
        body: JSON.stringify(
          {
            project: info.project.name,
            firstUsefulDomMs: readyMs,
            browserVersion: page.context().browser()?.version(),
            viewport: page.viewportSize(),
            fixture:
              "intercepted API; no latency injection; local optimized build",
            reads: state.reads,
            ...resources,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    }
    await page.goto(
      "/#/app/administration/reports?from=2026-10-01&to=2026-10-30",
    );
    await expect(page.locator(".administration-exports")).toBeVisible();
    const periodLabel = {
      fr: "Période",
      en: "Period",
      de: "Zeitraum",
      lb: "Zäitraum",
    };
    await expect(
      page.getByRole("group", {
        name: periodLabel[locale as keyof typeof periodLabel],
        exact: true,
      }),
    ).toBeVisible();
    const limitCopy = {
      fr: "Le PDF affiche au plus 500 lignes",
      en: "PDF shows at most 500 rows",
      de: "PDF zeigt höchstens 500 Zeilen",
      lb: "De PDF weist héchstens 500 Zeilen",
    };
    await expect(page.locator("main").getByRole("note")).toContainText(
      limitCopy[locale as keyof typeof limitCopy],
    );
    await page.screenshot({
      path: info.outputPath(`administration-reports-${locale}.png`),
      fullPage: true,
    });
    expect(state.writes).toEqual([]);
  });

test("Consumption has one refresh action for its summary and the embedded ledger", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/administration/consumption");
  const refresh = page.getByRole("button", { name: "Actualiser", exact: true });
  await expect(refresh).toHaveCount(1);
  await expect(page.locator(".stat-tile").first()).toBeVisible();
  await expect
    .poll(() => state.reads.filter((path) => path.startsWith("/usage?")).length)
    .toBe(1);
  const before = state.reads.length;
  await refresh.click();
  await expect
    .poll(
      () =>
        state.reads
          .slice(before)
          .filter((path) => path.startsWith("/administration/consumption?"))
          .length,
    )
    .toBe(1);
  await expect
    .poll(
      () =>
        state.reads.slice(before).filter((path) => path.startsWith("/usage?"))
          .length,
    )
    .toBe(1);
  await expect
    .poll(
      () =>
        state.reads
          .slice(before)
          .filter((path) => path.startsWith("/usage/activity?")).length,
    )
    .toBe(1);
  await expect(refresh).toHaveCount(1);
  expect(state.writes).toEqual([]);
});

for (const [locale, resolveLabel, resolvedLabel] of [
  ["en", "Resolve incident", "Resolved"],
  ["fr", "Résoudre l’incident", "Résolu"],
  ["de", "Vorfall abschließen", "Erledigt"],
  ["lb", "Virfall léisen", "Geléist"],
] as const)
  test(`queue incident resolution requires a deliberate browser action in ${locale}`, async ({
    page,
  }) => {
    await fixture(page, "admin", locale);
    const id = "dead_synthetic_fixture";
    let resolvedAt: string | null = null;
    const requests: { body: unknown; csrf: string | undefined }[] = [];
    await page.route("**/api/admin", (route) =>
      route.fulfill({
        json: {
          controls: [],
          states: [],
          uncertain: [],
          audit: [],
          outbox: { pending: 0 },
          deadLetters: [
            {
              id,
              dispatch_id: "dispatch-synthetic",
              queue: "interactive",
              received_at: "2026-11-08T09:00:00.000Z",
              resolved_at: resolvedAt,
            },
          ],
        },
      }),
    );
    await page.route(
      `**/api/admin/dead-letters/${id}/resolution`,
      async (route) => {
        requests.push({
          body: route.request().postDataJSON(),
          csrf: route.request().headers()["x-csrf-token"],
        });
        resolvedAt = "2026-11-08T09:05:00.000Z";
        await route.fulfill({
          json: { id, dispatchId: "dispatch-synthetic", resolvedAt },
        });
      },
    );
    await page.goto("/#/app/administration/settings");
    const incident = page.locator(".dead-letters");
    await expect(incident.getByText(id, { exact: true })).toBeVisible();
    expect(requests).toEqual([]);
    await incident
      .getByRole("button", { name: `${resolveLabel} · ${id}`, exact: true })
      .click();
    expect(requests).toEqual([]);
    await incident
      .getByRole("button", { name: resolveLabel, exact: true })
      .click();
    await expect(
      incident.locator("time").filter({ hasText: resolvedLabel }),
    ).toBeVisible();
    await expect(
      incident.getByRole("button", { name: resolveLabel, exact: true }),
    ).toHaveCount(0);
    expect(requests).toEqual([
      { body: { confirmed: true }, csrf: "fixture-only" },
    ]);
  });

test("activity columns can be expanded without changing the authorized report", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/administration/activity");
  await expect(
    page.getByText("dispatch-administration-1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Pages", exact: true }),
  ).toHaveCount(0);
  const readsBefore = state.reads.filter((read) =>
    read.startsWith("/administration/activity"),
  ).length;
  await page.locator("details.administration-column-picker summary").click();
  await page.getByRole("checkbox", { name: "Pages", exact: true }).check();
  await expect(
    page.getByRole("columnheader", { name: "Pages", exact: true }),
  ).toHaveCount(1);
  expect(
    state.reads.filter((read) => read.startsWith("/administration/activity")),
  ).toHaveLength(readsBefore);
  expect(state.writes).toEqual([]);
});

test("audit prose distinguishes delegated approvals and keeps diagnostic codes collapsed", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.route("**/api/administration/audit?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "audit-1",
            action: "dispatch.approved",
            actor: "Camille",
            resourceId: "dispatch-1",
            createdAt: "2026-11-10T10:00:00Z",
          },
          {
            id: "audit-2",
            action: "dispatch.expert_approved",
            actor: "Lou",
            resourceId: "dispatch-2",
            createdAt: "2026-11-10T11:00:00Z",
          },
        ],
        total: 2,
        page: 1,
        pageSize: 50,
      },
    }),
  );
  await page.goto("/#/app/administration/audit");
  await expect(page.getByText("Envoi approuvé", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Envoi approuvé par délégation", { exact: true }),
  ).toBeVisible();
  const code = page
    .locator("code")
    .filter({ hasText: /^dispatch\.expert_approved$/ });
  await expect(code).not.toBeVisible();
  await code.locator("..").locator("summary").click();
  await expect(code).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("report rows select one format before the guarded download", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/administration/reports");
  const report = page.locator(".administration-export").filter({
    has: page.getByRole("heading", {
      name: "Rapport complet de l’espace de travail",
      exact: true,
    }),
  });
  await expect(report.getByRole("button")).toHaveCount(1);
  const format = report.getByRole("combobox");
  await expect(format.locator("option")).toHaveText(["Excel", "PDF"]);
  await format.selectOption("pdf");
  await expect(report.getByRole("button")).toHaveAccessibleName(
    "Télécharger Rapport complet de l’espace de travail au format PDF",
  );
  expect(state.writes).toEqual([]);
});

test("identity settings defer operational reads until the administrator opens Operations", async ({
  page,
}) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/administration/settings");
  await expect(
    page.getByLabel("Nom de l’espace de travail", { exact: true }),
  ).toHaveValue("Atelier Alpha");
  expect(state.reads.some((read) => read === "/admin")).toBe(false);
  expect(
    state.reads.some((read) => read.startsWith("/dispatches?group=attention")),
  ).toBe(false);
  await page
    .locator("main")
    .getByRole("link", { name: "Exploitation", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText("Exploitation");
  await expect.poll(() => state.reads.includes("/admin")).toBe(true);
  expect(state.writes).toEqual([]);
});

for (const role of ["supervisor", "member", "viewer"] as const) {
  test(`Operations refuses ${role} before operational reads`, async ({
    page,
  }) => {
    const state = await fixture(page, role);
    await page.goto("/#/app/administration/operations");
    await expect(
      page.getByText("Votre rôle ne permet pas cette action.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(state.reads.some((read) => read === "/admin")).toBe(false);
    expect(
      state.reads.some((read) =>
        read.startsWith("/dispatches?group=attention"),
      ),
    ).toBe(false);
    expect(state.writes).toEqual([]);
  });
}
