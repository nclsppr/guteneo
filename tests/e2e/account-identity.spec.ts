import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type { Session } from "../../apps/web/src/api";
import type { SupportedLocale } from "../../packages/contracts/src/locale";
import {
  workspacePermissions,
  type WorkspaceRole,
} from "../../packages/contracts/src/roles";

// UI evidence only: every API call is intercepted, including all writes.
// No identity provider, real invitation, communication or billing service is used.
async function fixture(
  page: Page,
  {
    role = "member",
    locale = "fr",
  }: { role?: WorkspaceRole; locale?: SupportedLocale } = {},
) {
  const session: Session = {
    organization: {
      id: "identity-workshop",
      name: "Atelier de contrôle des identités",
    },
    user: {
      id: "identity-user",
      name: "Camille Nom partagé",
      email:
        "camille.identite.avec.une.adresse.de.connexion.tres.longue@example.invalid",
      role,
      preferredLocale: locale,
      supervisorCanApprove: false,
      supervisorCanReport: role === "supervisor",
    },
    permissions: workspacePermissions(role, {
      canApprove: false,
      canReport: role === "supervisor",
    }),
    csrfToken: "intercepted-ui-fixture",
    simulation: false,
    verifiedAccount: true,
  };
  const members = [
    {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role,
      supervisorCanApprove: false,
      supervisorCanReport: false,
      joinedAt: "2026-10-09T08:00:00Z",
      sessions: 1,
      connections: 0,
    },
    {
      id: "same-name-colleague",
      name: session.user.name,
      email: "autre.camille@example.invalid",
      role: "supervisor",
      supervisorCanApprove: true,
      supervisorCanReport: false,
      joinedAt: "2026-10-09T08:00:00Z",
      sessions: 1,
      connections: 0,
    },
  ];
  const writes: {
    method: string;
    path: string;
    body: Record<string, unknown>;
  }[] = [];
  const unmatched: string[] = [];
  const state = { failContacts: false, contactReads: 0 };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
    const method = request.method();
    if (method !== "GET")
      writes.push({ method, path, body: request.postDataJSON() });
    let status = 200;
    let body: unknown;
    if (path === "/session") body = session;
    else if (path === "/capabilities")
      body = { scanner: "ready", simulation: false };
    else if (path === "/connections") body = { items: [] };
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
    else if (path === "/dispatches") body = { items: [], nextCursor: null };
    else if (path === "/account/workspaces")
      body = {
        items: [
          {
            id: "identity-workshop",
            name: "Atelier de contrôle des identités",
            current: session.organization.id === "identity-workshop",
          },
          {
            id: "other-workshop",
            name: "Deuxième atelier",
            current: session.organization.id === "other-workshop",
          },
        ],
      };
    else if (path === "/account/workspace" && method === "POST") {
      session.organization = {
        id: request.postDataJSON().organizationId,
        name: "Deuxième atelier",
      };
      body = session;
    } else if (path === "/account/contacts") {
      state.contactReads++;
      if (state.failContacts) {
        status = 503;
        body = {
          error: {
            code: "CONTACTS_UNAVAILABLE",
            message:
              "Les contacts sont temporairement indisponibles. Réessayez leur consultation.",
          },
        };
      } else
        body = {
          items:
            session.organization.id === "other-workshop"
              ? [
                  {
                    id: "other-admin",
                    name: "Responsable du deuxième atelier",
                    email: "autre.atelier@example.invalid",
                    role: "admin",
                    permissions: workspacePermissions("admin"),
                  },
                ]
              : [
                  {
                    id: "contact-admin",
                    name: "Alexandre Responsable avec un nom particulièrement long",
                    email:
                      "administration.adresse.longue.pour.verifier.la.mise.en.page@example.invalid",
                    role: "admin",
                    permissions: workspacePermissions("admin"),
                  },
                  {
                    id: "contact-approval",
                    name: "Samira Validation",
                    email: "validation@example.invalid",
                    role: "supervisor",
                    permissions: workspacePermissions("supervisor", {
                      canApprove: true,
                    }),
                  },
                  {
                    id: "contact-reports",
                    name: "Lou Rapports",
                    email: "rapports@example.invalid",
                    role: "supervisor",
                    permissions: workspacePermissions("supervisor", {
                      canReport: true,
                    }),
                  },
                ],
          hasMore: false,
        };
    } else if (path === "/account/sessions")
      body = { items: [], hasMore: false };
    else if (path === "/account/expert-approval")
      body = {
        canManage: role === "admin",
        day: "2026-10-09",
        connections: [],
      };
    else if (path === "/account" && method === "PATCH") {
      const update = request.postDataJSON();
      session.user.name = update.userName;
      if (update.preferredLocale)
        session.user.preferredLocale = update.preferredLocale;
      if (update.organizationName)
        session.organization.name = update.organizationName;
      body = { saved: true };
    } else if (path === "/admin/members")
      body = { items: members, nextCursor: null };
    else if (path.startsWith("/admin/members/") && method === "PATCH") {
      const member = members.find((item) => item.id === path.split("/")[3]);
      Object.assign(member!, request.postDataJSON());
      body = { self: false, sessionsRevoked: true };
    } else if (path === "/admin/invitations")
      body = { items: [], nextCursor: null };
    else if (path === "/admin") body = { controls: [], deadLetters: [] };
    else {
      unmatched.push(`${method} ${path}`);
      status = 503;
      body = {
        error: {
          code: "UI_FIXTURE_MISSING",
          message: "Donnée de test manquante.",
        },
      };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return { session, state, writes, unmatched };
}

async function fits(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}

async function capture(
  page: Page,
  surface: string,
  project: string,
  locale = "fr",
) {
  await mkdir("/tmp/guteneo-identity-ui", { recursive: true });
  await page.screenshot({
    path: `/tmp/guteneo-identity-ui/${surface}-${project}-${locale}.png`,
    fullPage: true,
  });
}

test("identity stays visible, switching names the account action and profile changes persist", async ({
  page,
}, info) => {
  const data = await fixture(page);
  await page.goto("/#/app");
  const identity = page.locator("aside .workspace-identity");
  await expect(identity).toHaveAttribute("aria-label", "Votre compte");
  await expect(identity).toContainText(data.session.user.name);
  await expect(identity).toContainText(data.session.user.email!);
  await expect(identity).toContainText("Opérateur");
  const switchAccount = identity.getByRole("link", {
    name: "Changer de compte",
    exact: true,
  });
  const href = await switchAccount.getAttribute("href");
  const target = new URL(href!, "http://localhost:8787");
  expect(target.pathname).toBe("/auth/login");
  expect(target.searchParams.get("intent")).toBe("switch-account");
  expect(target.searchParams.get("locale")).toBe("fr");
  expect(target.searchParams.get("returnTo")).toBe("/#/app");
  const role = page.getByRole("region", {
    name: "Votre rôle dans cet atelier",
    exact: true,
  });
  await expect(role).toContainText("une personne habilitée les valide");
  await expect(page.locator(".workspace-contact-list > li")).toHaveCount(3);
  await capture(page, "dashboard", info.project.name);
  await identity
    .getByRole("link", { name: /Mon profil et mes droits/ })
    .click();
  await expect(page.getByRole("main")).toBeFocused();
  const summary = page
    .getByRole("main")
    .getByRole("region", { name: "Votre compte", exact: true });
  await expect(summary).toContainText(data.session.user.email!);
  await expect(
    page.getByRole("textbox", { name: /adresse.*connexion|e-mail/i }),
  ).toHaveCount(0);
  await page
    .getByLabel("Votre nom", { exact: true })
    .fill("Camille Profil modifié");
  await page.locator(".language-preference select").selectOption("de");
  await page
    .getByRole("button", { name: "Enregistrer les modifications", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mein Profil", exact: true }),
  ).toBeVisible();
  await expect(identity).toHaveAttribute("aria-label", "Ihr Konto");
  await expect(identity).toContainText("Camille Profil modifié");
  expect(data.writes).toEqual([
    {
      method: "PATCH",
      path: "/account",
      body: { userName: "Camille Profil modifié", preferredLocale: "de" },
    },
  ]);
  await page.reload();
  await expect(page.locator("#account-name")).toHaveValue(
    "Camille Profil modifié",
  );
  await expect(page.locator(".language-preference select")).toHaveValue("de");
  expect(data.unmatched).toEqual([]);
});

for (const [locale, heading, roleLabel, contactsHeading] of [
  ["fr", "Mon profil", "Superviseur", "Qui contacter dans cet atelier ?"],
  ["en", "My profile", "Supervisor", "Who can help in this workshop?"],
  ["de", "Mein Profil", "Supervisor", "Wer kann in dieser Werkstatt helfen?"],
  ["lb", "Mäi Profil", "Supervisor", "Wien kann an dësem Atelier hëllefen?"],
] as const) {
  test(`account identity and contacts fit long names and addresses in ${locale}`, async ({
    page,
    isMobile,
  }, info) => {
    const data = await fixture(page, { role: "supervisor", locale });
    if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/?locale=${locale}#/app/account`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".account-identity")).toContainText(roleLabel);
    await expect(page.locator(".account-identity")).toContainText(
      data.session.user.email!,
    );
    const contacts = page.getByRole("region", {
      name: contactsHeading,
      exact: true,
    });
    await expect(
      contacts.getByRole("link", { name: /validation@example.invalid/ }),
    ).toBeVisible();
    await expect(
      contacts.getByRole("link", { name: /validation@example.invalid/ }),
    ).toHaveAttribute("href", "mailto:validation%40example.invalid");
    await expect(contacts.locator(".workspace-contact-list > li")).toHaveCount(
      3,
    );
    await fits(page);
    await capture(page, "profile", info.project.name, locale);
    if (locale === "fr") {
      const rights = page.getByRole("region", {
        name: "Vos droits dans cet atelier",
        exact: true,
      });
      await expect(
        rights
          .locator(".account-permissions > div")
          .filter({ hasText: "Approbation des envois" }),
      ).toContainText("Non autorisée");
      await expect(
        rights
          .locator(".account-permissions > div")
          .filter({ hasText: "Rapports de l’atelier" }),
      ).toContainText("Accessibles");
      const reportContact = contacts
        .locator(".workspace-contact-list > li")
        .filter({ hasText: "Lou Rapports" });
      await expect(reportContact).toContainText(
        "Ne peut pas approuver les envois",
      );
      await expect(reportContact).toContainText("Peut consulter les rapports");
      const approver = contacts
        .locator(".workspace-contact-list > li")
        .filter({ hasText: "Samira Validation" });
      await expect(approver).toContainText("Peut approuver les envois");
      await expect(approver).not.toContainText("Gère les accès");
    }
    expect(data.writes).toEqual([]);
    expect(data.unmatched).toEqual([]);
  });
}

test("returning to a healthy tab reconciles a different account and workshop together", async ({
  page,
}) => {
  const data = await fixture(page, { role: "admin" });
  await page.goto("/#/app");
  const identity = page.locator("aside .workspace-identity");
  await expect(identity).toContainText("Camille Nom partagé");
  await expect(page.locator(".workspace-contact-list")).toContainText(
    "Samira Validation",
  );
  data.session.organization = {
    id: "other-workshop",
    name: "Deuxième atelier",
  };
  data.session.user = {
    id: "other-account",
    name: "Noa Compte actuel",
    email: "noa@example.invalid",
    role: "viewer",
    preferredLocale: "fr",
  };
  data.session.permissions = workspacePermissions("viewer");
  // No SESSION_EXPIRED event: the tab still believes its original session is healthy.
  await expect
    .poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      return identity.textContent();
    })
    .toContain("Noa Compte actuel");
  await expect(identity).toContainText("noa@example.invalid");
  await expect(identity).toContainText("Observateur");
  const role = page.getByRole("region", {
    name: "Votre rôle dans cet atelier",
    exact: true,
  });
  await expect(role).toContainText("Noa Compte actuel");
  await expect(role).toContainText("lecture seule");
  await expect(page.locator(".workspace-contact-list")).toContainText(
    "Responsable du deuxième atelier",
  );
  await expect(page.locator(".workspace-contact-list")).not.toContainText(
    "Samira Validation",
  );
  await expect(identity).not.toContainText("Camille Nom partagé");
  expect(data.writes).toEqual([]);
  expect(data.unmatched).toEqual([]);
});

test("contact failure is recoverable and switching workshops removes the previous contacts", async ({
  page,
}) => {
  const data = await fixture(page);
  data.state.failContacts = true;
  await page.goto("/#/app/account");
  const contacts = page.getByRole("region", {
    name: "Qui contacter dans cet atelier ?",
    exact: true,
  });
  await expect(contacts.getByRole("alert")).toContainText(
    "contacts sont temporairement indisponibles",
  );
  await expect(
    contacts.getByRole("link", { name: /validation@example.invalid/ }),
  ).toHaveCount(0);
  data.state.failContacts = false;
  await contacts
    .getByRole("button", { name: "Réessayer", exact: true })
    .click();
  await expect(
    contacts.getByRole("link", { name: /validation@example.invalid/ }),
  ).toBeVisible();
  await page
    .getByLabel("Atelier actif", { exact: true })
    .selectOption("other-workshop");
  await page
    .getByRole("button", { name: "Ouvrir cet atelier", exact: true })
    .click();
  await expect(
    contacts.getByRole("link", { name: /autre.atelier@example.invalid/ }),
  ).toBeVisible();
  await expect(
    contacts.getByRole("link", { name: /validation@example.invalid/ }),
  ).toHaveCount(0);
  await expect(page.locator("#account-organization")).toHaveValue(
    "Deuxième atelier",
  );
  expect(data.state.contactReads).toBe(3);
  expect(data.writes).toEqual([
    {
      method: "POST",
      path: "/account/workspace",
      body: { organizationId: "other-workshop" },
    },
  ]);
  expect(data.unmatched).toEqual([]);
});

test("member emails distinguish identical names and role controls target the selected member", async ({
  page,
}) => {
  const data = await fixture(page, { role: "admin" });
  await page.goto("/#/app/admin");
  const team = page.getByRole("region", {
    name: "Membres de l’atelier",
    exact: true,
  });
  await expect(team.getByRole("rowheader")).toHaveCount(2);
  await expect(team).toContainText(data.session.user.email!);
  await expect(team).toContainText("autre.camille@example.invalid");
  const colleagueLabel = "Camille Nom partagé (autre.camille@example.invalid)";
  await team
    .getByLabel(`Rôle de ${colleagueLabel}`, { exact: true })
    .selectOption("viewer");
  const save = team.getByRole("button", {
    name: `Enregistrer le rôle de ${colleagueLabel}`,
    exact: true,
  });
  await save.focus();
  await expect(save).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(team.getByRole("status")).toContainText("Le rôle a été modifié");
  expect(data.writes).toEqual([
    {
      method: "PATCH",
      path: "/admin/members/same-name-colleague",
      body: {
        role: "viewer",
        supervisorCanApprove: false,
        supervisorCanReport: false,
      },
    },
  ]);
  await fits(page);
  expect(data.unmatched).toEqual([]);
});
