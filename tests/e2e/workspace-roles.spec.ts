import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  workspacePermissions,
  type WorkspaceRole,
} from "../../packages/contracts/src/roles";

// UI fixtures only. Authorization is exercised separately against real local API
// requests by the workspace-role integration tests.
async function fixture(
  page: Page,
  role: WorkspaceRole,
  canApprove = false,
  canReport = false,
) {
  const now = "2026-10-02T10:00:00Z";
  const requested: string[] = [];
  const writes: unknown[] = [];
  const session = {
    organization: { id: "role-ui-workspace", name: "Atelier des rôles" },
    user: {
      id: "current",
      name: "Camille Exemple",
      role,
      supervisorCanApprove: canApprove,
      supervisorCanReport: canReport,
    },
    permissions: workspacePermissions(role, { canApprove, canReport }),
    csrfToken: "ui-fixture-only",
    simulation: true,
  };
  const member = {
    id: "colleague",
    name: "Alex Responsable de correspondance",
    role: "member",
    supervisorCanApprove: false,
    supervisorCanReport: false,
    joinedAt: now,
    sessions: 1,
    connections: 1,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    requested.push(path);
    let body: unknown;
    if (path === "/session") body = session;
    else if (path === "/capabilities")
      body = { scanner: "disabled_in_local_simulation" };
    else if (path === "/overview")
      body = {
        documents: 3,
        dispatches: { total: 2, approval: 1, attention: 0 },
      };
    else if (path === "/account/expert-approval")
      body = {
        canManage: role === "admin",
        day: "2026-10-02",
        connections: [],
      };
    else if (path === "/account/sessions") body = { items: [], hasMore: false };
    else if (path === "/admin") body = { controls: [], deadLetters: [] };
    else if (path === "/admin/members")
      body = { items: [member], nextCursor: null };
    else if (
      path === "/admin/members/colleague" &&
      route.request().method() === "PATCH"
    ) {
      const update = route.request().postDataJSON();
      writes.push(update);
      Object.assign(member, update, { sessions: 0, connections: 0 });
      body = { self: false, sessionsRevoked: true };
    } else if (path === "/dispatches/request")
      body = {
        dispatch: {
          id: "request",
          channel: "email",
          recipient_json: { email: "recipient@example.invalid" },
          subject: "Courrier à valider",
          html: "<p>Correspondance fictive.</p>",
          text: "Correspondance fictive.",
          status: "prepared",
          mode: "simulation",
          estimated_minor: 10,
          ceiling_minor: 100,
          currency: "EUR",
          fingerprint: "fixture-version",
          created_at: now,
          updated_at: now,
        },
        events: [],
        attempts: [],
        approval: null,
      };
    else if (
      [
        "/dispatches",
        "/documents",
        "/campaigns",
        "/senders",
        "/usage",
        "/connections",
        "/admin/invitations",
      ].includes(path)
    )
      body = { items: [], nextCursor: null };
    else {
      await route.fulfill({
        status: 404,
        json: { error: { code: "UNEXPECTED_FIXTURE_REQUEST", message: path } },
      });
      return;
    }
    await route.fulfill({ status: 200, json: body });
  });
  return { requested, writes };
}

test("administrator assigns a supervisor and independently saves approval and reporting", async ({
  page,
}, testInfo) => {
  const state = await fixture(page, "admin");
  await page.goto("/#/app/admin");
  const team = page.getByRole("region", { name: "Membres de l’atelier" });
  const role = team.getByLabel("Rôle de Alex Responsable de correspondance", {
    exact: true,
  });
  await role.selectOption("supervisor");
  const approve = team.getByRole("checkbox", {
    name: "Approuver et refuser les requêtes",
  });
  const report = team.getByRole("checkbox", { name: "Consulter les rapports" });
  await expect(approve).not.toBeChecked();
  await expect(report).not.toBeChecked();
  await report.check();
  await team
    .getByRole("button", {
      name: "Enregistrer le rôle de Alex Responsable de correspondance",
    })
    .click();
  await expect(team.getByRole("status")).toContainText("doit se reconnecter");
  expect(state.writes[0]).toEqual({
    role: "supervisor",
    supervisorCanApprove: false,
    supervisorCanReport: true,
  });
  await expect(report).toBeChecked();
  await expect(approve).not.toBeChecked();
  await approve.check();
  await report.uncheck();
  await team
    .getByRole("button", {
      name: "Enregistrer le rôle de Alex Responsable de correspondance",
    })
    .click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1]).toEqual({
    role: "supervisor",
    supervisorCanApprove: true,
    supervisorCanReport: false,
  });
  await expect(approve).toBeChecked();
  await expect(report).not.toBeChecked();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await mkdir("/tmp/guteneo-roles-ui", { recursive: true });
  await page.screenshot({
    path: `/tmp/guteneo-roles-ui/admin-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("operator can prepare while approval and report interfaces stay restricted", async ({
  page,
}) => {
  const state = await fixture(page, "member");
  await page.goto("/#/app");
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  expect(state.requested).not.toContain("/overview");
  await expect(page.locator(".overview-stats")).toHaveCount(0);
  await page.goto("/#/app/dispatches");
  await expect(
    page.locator('main a[href="#/app/prepare"]').first(),
  ).toBeVisible();
  await page.goto("/#/app/dispatch/request");
  await expect(
    page.getByText("Votre rôle ne permet pas cette action.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".approval-panel")).toHaveCount(0);
  await expect(page.locator(".cancel-button")).toHaveCount(0);
  await page.goto("/#/app/usage");
  await expect(
    page.getByText("Votre rôle ne donne pas accès aux rapports", {
      exact: false,
    }),
  ).toBeVisible();
  expect(state.requested).not.toContain("/usage");
});

test("observer sees documents and tracking without preparation controls", async ({
  page,
}) => {
  await fixture(page, "viewer");
  await page.goto("/#/app/documents");
  await expect(
    page.getByRole("heading", { name: "La matière première.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Importer un PDF", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('a[href="#/app/prepare"]')).toHaveCount(0);
  await page.goto("/#/app/dispatches");
  await expect(page.locator('a[href="#/app/prepare"]')).toHaveCount(0);
  await page.goto("/#/app/prepare");
  await expect(
    page.getByText("Votre rôle ne permet pas cette action.", { exact: false }),
  ).toBeVisible();
  await page.goto("/#/app/admin");
  await expect(
    page.getByRole("heading", { name: "Membres de l’atelier" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Votre rôle ne permet pas cette action.", { exact: false }),
  ).toBeVisible();
});

for (const [canApprove, canReport] of [
  [true, false],
  [false, true],
] as const) {
  test(`supervisor approval=${canApprove} reports=${canReport} uses independent permissions`, async ({
    page,
  }) => {
    const state = await fixture(page, "supervisor", canApprove, canReport);
    await page.goto("/#/app");
    await expect(
      page.getByRole("heading", { name: "Votre correspondance, au clair." }),
    ).toBeVisible();
    await expect(page.locator(".overview-stats")).toHaveCount(
      canReport ? 1 : 0,
    );
    if (canReport)
      await expect.poll(() => state.requested.includes("/overview")).toBe(true);
    else expect(state.requested).not.toContain("/overview");
    await page.goto("/#/app/dispatch/request");
    await expect(
      page.getByText("Courrier à valider", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".approval-panel")).toHaveCount(
      canApprove ? 1 : 0,
    );
    await expect(page.locator(".cancel-button")).toHaveCount(
      canApprove ? 1 : 0,
    );
    await page.goto("/#/app/usage");
    if (canReport)
      await expect.poll(() => state.requested.includes("/usage")).toBe(true);
    else {
      await expect(
        page.getByText("Votre rôle ne donne pas accès aux rapports", {
          exact: false,
        }),
      ).toBeVisible();
      expect(state.requested).not.toContain("/usage");
    }
  });
}

test("public guide explains all roles and supervisor options in four languages", async ({
  page,
}, testInfo) => {
  await fixture(page, "admin");
  await page.goto("/roles/");
  for (const [locale, title, operator, observer, approval] of [
    [
      "fr",
      "Un rôle clair pour chaque membre.",
      "Opérateur",
      "Observateur",
      "Approuver et refuser les requêtes",
    ],
    [
      "en",
      "A clear role for every member.",
      "Operator",
      "Observer",
      "Approve and reject requests",
    ],
    [
      "de",
      "Eine klare Rolle für jedes Mitglied.",
      "Sachbearbeiter",
      "Beobachter",
      "Anfragen genehmigen und ablehnen",
    ],
    [
      "lb",
      "Eng kloer Roll fir all Member.",
      "Operateur",
      "Observateur",
      "Ufroe geneemegen a refuséieren",
    ],
  ]) {
    await page.locator(".language-selector select").selectOption(locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(
      page.locator("dt").filter({ hasText: new RegExp(`^${operator}$`) }),
    ).toBeVisible();
    await expect(
      page.locator("dt").filter({ hasText: new RegExp(`^${observer}$`) }),
    ).toBeVisible();
    await expect(
      page.locator("dt").filter({ hasText: new RegExp(`^${approval}$`) }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
  await mkdir("/tmp/guteneo-roles-ui", { recursive: true });
  await page.screenshot({
    path: `/tmp/guteneo-roles-ui/guide-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("switching workspace refreshes its name and permissions without carrying over preparation access", async ({
  page,
}) => {
  let active = "first";
  const workshops = [
    { id: "first", name: "Atelier de préparation", role: "member" },
    { id: "second", name: "Atelier de consultation", role: "viewer" },
  ];
  const switches: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    if (path === "/account/workspace") {
      const body = route.request().postDataJSON();
      switches.push(body);
      active = body.organizationId;
    }
    const workshop = workshops.find((item) => item.id === active)!;
    const session = {
      organization: { id: workshop.id, name: workshop.name },
      user: { id: "person", name: "Camille Exemple", role: workshop.role },
      permissions: workspacePermissions(workshop.role),
      csrfToken: `csrf-${active}`,
      simulation: true,
    };
    const body =
      path === "/session" || path === "/account/workspace"
        ? session
        : path === "/account/workspaces"
          ? {
              items: workshops.map((item) => ({
                ...item,
                current: item.id === active,
              })),
            }
          : path === "/account/expert-approval"
            ? { canManage: false, connections: [], day: "2026-10-02" }
            : path === "/capabilities"
              ? { scanner: "disabled_in_local_simulation" }
              : { items: [], hasMore: false, nextCursor: null };
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto("/#/app/account");
  await expect(
    page.getByLabel("Nom de l’atelier", { exact: true }),
  ).toHaveValue("Atelier de préparation");
  await page.getByLabel("Atelier actif").selectOption("second");
  await page.getByRole("button", { name: "Ouvrir cet atelier" }).click();
  await expect(
    page.getByLabel("Nom de l’atelier", { exact: true }),
  ).toHaveValue("Atelier de consultation");
  await expect(page.getByLabel("Atelier actif")).toHaveValue("second");
  await expect(page.locator('a[href="#/app/prepare"]')).toHaveCount(0);
  expect(switches).toEqual([{ organizationId: "second" }]);
});

test("an invalid optional workspace response leaves the account form usable", async ({
  page,
}) => {
  await fixture(page, "member");
  await page.route("**/api/account/workspaces", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.goto("/#/app/account");
  await expect(page.getByLabel("Votre nom", { exact: true })).toHaveValue(
    "Camille Exemple",
  );
  await page.getByLabel("Votre nom", { exact: true }).fill("Camille Modifié");
  await expect(
    page.getByRole("button", { name: "Enregistrer les modifications" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Atelier actif")).toHaveCount(0);
});
