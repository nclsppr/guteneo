import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { workspacePermissions } from "../../packages/contracts/src/roles";

async function adminFixture(page: Page) {
  const writes: Record<string, unknown>[] = [];
  let invitations: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    let body: unknown = { items: [], nextCursor: null };
    if (path === "/session")
      body = {
        organization: { id: "invitation-fixture", name: "Atelier partagé" },
        user: { id: "admin", role: "admin", name: "Admin Exemple" },
        permissions: workspacePermissions("admin"),
        csrfToken: "fixture-only",
        simulation: true,
      };
    else if (path === "/capabilities")
      body = { scanner: "disabled_in_local_simulation" };
    else if (path === "/admin") body = { controls: [], deadLetters: [] };
    else if (path === "/admin/invitations") {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON();
        writes.push(payload);
        invitations = payload.emails.map((email: string, index: number) => ({
          id: `invite-${index}`,
          email,
          role: payload.role,
          supervisorCanApprove: payload.supervisorCanApprove,
          supervisorCanReport: payload.supervisorCanReport,
          status: "pending",
          deliveryStatus: "simulated",
          createdAt: "2026-10-02T10:00:00Z",
          expiresAt: "2026-10-09T10:00:00Z",
        }));
      }
      body = { items: invitations, nextCursor: null, simulation: true };
    }
    await route.fulfill({ status: 200, json: body });
  });
  return writes;
}

test("a single invitation requires reviewing the chosen recipient and role before sending", async ({
  page,
}, testInfo) => {
  const writes = await adminFixture(page);
  await page.goto("/#/app/admin");
  const invites = page.getByRole("region", { name: "Inviter des membres" });
  await invites.getByLabel("Adresse e-mail à inviter").fill("alex@example.com");
  await invites.getByLabel("Rôle des nouveaux membres").selectOption("viewer");
  await expect(
    invites.getByRole("button", {
      name: "Envoyer les invitations",
      exact: true,
    }),
  ).toHaveCount(0);
  await invites
    .getByRole("button", { name: "Vérifier les invitations" })
    .click();
  await expect(
    invites.getByRole("heading", { name: "Vérifier 1 invitation(s)" }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await mkdir("/tmp/guteneo-roles-ui", { recursive: true });
  await invites.screenshot({
    path: `/tmp/guteneo-roles-ui/invitation-review-${testInfo.project.name}.png`,
  });
  await invites
    .getByRole("button", { name: "Envoyer les invitations", exact: true })
    .click();
  await expect(invites.getByRole("status")).toContainText(
    "Les invitations ont été traitées",
  );
  expect(writes).toEqual([
    {
      emails: ["alex@example.com"],
      role: "viewer",
      supervisorCanApprove: false,
      supervisorCanReport: false,
    },
  ]);
  await expect(
    invites.getByText("Envoi simulé", { exact: false }),
  ).toBeVisible();
});

test("CSV invitations remove duplicates and bind supervisor options to the reviewed batch", async ({
  page,
}) => {
  const writes = await adminFixture(page);
  await page.goto("/#/app/admin");
  const invites = page.getByRole("region", { name: "Inviter des membres" });
  await invites.getByLabel("Ajouter des destinataires").selectOption("csv");
  await invites.getByLabel("Fichier CSV des membres").setInputFiles({
    name: "team.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name;email\nAlex;ALEX@example.com\nSam;sam@example.com\nAlex;alex@example.com\n",
    ),
  });
  await invites
    .getByLabel("Rôle des nouveaux membres")
    .selectOption("supervisor");
  await invites
    .getByRole("checkbox", { name: "Consulter les rapports" })
    .check();
  await invites
    .getByRole("button", { name: "Vérifier les invitations" })
    .click();
  await expect(
    invites.getByRole("heading", { name: "Vérifier 2 invitation(s)" }),
  ).toBeVisible();
  await expect(invites.getByText("1 doublon(s) retiré(s).")).toBeVisible();
  expect(writes).toHaveLength(0);
  await invites
    .getByRole("button", { name: "Envoyer les invitations", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({
    emails: ["alex@example.com", "sam@example.com"],
    role: "supervisor",
    supervisorCanApprove: false,
    supervisorCanReport: true,
  });
});

test("invalid CSV prevents review and sending", async ({ page }) => {
  const writes = await adminFixture(page);
  await page.goto("/#/app/admin");
  const invites = page.getByRole("region", { name: "Inviter des membres" });
  await invites.getByLabel("Ajouter des destinataires").selectOption("csv");
  await invites.getByLabel("Fichier CSV des membres").setInputFiles({
    name: "broken.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("email\nnot-an-email\n"),
  });
  await invites
    .getByRole("button", { name: "Vérifier les invitations" })
    .click();
  await expect(invites.getByRole("alert")).toContainText(
    "Adresse e-mail invalide à la ligne 2",
  );
  await expect(
    invites.getByRole("button", {
      name: "Envoyer les invitations",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("invitation preview clears the secret fragment and acceptance requires an explicit action", async ({
  page,
}) => {
  const token = "fictional-invitation-token-for-ui-only";
  const accepts: unknown[] = [];
  const previews: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    if (route.request().url().endsWith("/api/invitations/preview")) {
      previews.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        json: {
          organization: { name: "Atelier partagé" },
          role: "supervisor",
          supervisorCanApprove: false,
          supervisorCanReport: true,
          maskedEmail: "a***@example.com",
          status: "pending",
          expiresAt: "2026-10-09T10:00:00Z",
        },
      });
    } else
      await route.fulfill({
        status: 401,
        json: { error: { code: "UNAUTHENTICATED", message: "Sign in" } },
      });
  });
  await page.route("**/auth/invitation", async (route) => {
    accepts.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, json: { loginUrl: "/auth/login" } });
  });
  await page.route("**/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<h1>Connexion de test</h1>",
    });
  });
  await page.goto(`/invitation/#token=${token}`);
  await expect(
    page.getByRole("heading", { name: "Atelier partagé" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/invitation\/$/);
  expect(previews).toEqual([{ token }]);
  expect(accepts).toHaveLength(0);
  await expect(
    page.getByText(
      "Approbation des requêtes : non autorisée. Rapports : accessibles.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accepter et me connecter" }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion de test" }),
  ).toBeVisible();
  expect(accepts).toEqual([{ token }]);
});
