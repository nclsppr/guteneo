import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { PostalSetup } from "../../packages/contracts/src/postal-setup";

// Browser fixtures only. Every API request is intercepted; setup never transfers
// a PDF, creates a provider draft, approves a dispatch or sends a letter here.
async function fixture(
  page: Page,
  {
    role = "admin",
    reason = "setup_required",
    failFirst = false,
    senderStatus,
  }: {
    role?: "admin" | "member" | "viewer";
    reason?: PostalSetup["reason"];
    failFirst?: boolean;
    senderStatus?: "pending" | "disabled";
  } = {},
) {
  const writes: { path: string; body: unknown; csrf?: string }[] = [];
  const unmatched: string[] = [];
  const setup: PostalSetup = {
    available: true,
    canManage: role === "admin",
    configured: reason === "channel_stopped",
    channelEnabled: false,
    senderVerification: null,
    pricingBasis: "public_list_price_ex_tax",
    defaultCountry: "LU",
    reason,
    ...(reason === "sender_disabled" ||
    reason === "channel_stopped" ||
    reason === "pricing_expired" ||
    reason === "operator_review_required"
      ? {
          sender: {
            id: "postal-sender-fixture",
            name: "Atelier Exemple",
            address: "12 rue des Exemples\nL-1234 Luxembourg",
            status:
              senderStatus ??
              (reason === "sender_disabled" ? "disabled" : "verified"),
          },
          senderVerification: "administrator_declaration" as const,
        }
      : {}),
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown;
    let status = 200;
    if (request.method() !== "GET")
      writes.push({
        path,
        body: request.postDataJSON(),
        csrf: request.headers()["x-csrf-token"],
      });
    if (path === "/api/session")
      body = {
        organization: { id: "postal-setup-fixture", name: "Atelier de test" },
        user: { id: "postal-admin-fixture", name: "Camille Exemple", role },
        csrfToken: "postal-csrf-fixture",
        simulation: false,
        verifiedAccount: true,
      };
    else if (path === "/api/capabilities") body = {};
    else if (path === "/api/postal/setup") {
      if (request.method() === "POST") {
        if (failFirst) {
          failFirst = false;
          status = 503;
          body = {
            error: {
              code: "POSTAL_SETUP_UNAVAILABLE",
              message: "L’activation n’a pas abouti. Réessayez.",
            },
          };
        } else {
          const input = request.postDataJSON();
          setup.configured = true;
          setup.channelEnabled = true;
          setup.sender = {
            id: "postal-sender-fixture",
            name: input.name,
            address: input.address,
            status: "verified",
          };
          setup.senderVerification = "administrator_declaration";
          delete setup.reason;
          body = setup;
        }
      } else body = setup;
    } else if (path === "/api/senders")
      body = {
        items: setup.sender
          ? [{ ...setup.sender, channel: "postal", mode: "production" }]
          : [],
      };
    else if (path === "/api/documents") body = { items: [], nextCursor: null };
    else if (path === "/api/dispatches/postal-quote-fixture")
      body = {
        dispatch: {
          id: "postal-quote-fixture",
          channel: "postal",
          mode: "production",
          status: "prepared",
          recipient_json: {
            name: "Atelier Destinataire",
            line1: "Rue du Test 12",
            postalCode: "L-1234",
            city: "Luxembourg",
            country: "LU",
          },
          sender_address: "Atelier Exemple",
          estimated_minor: 302,
          ceiling_minor: 500,
          currency: "EUR",
          fingerprint: "a".repeat(64),
          created_at: "2026-09-20T10:00:00Z",
          updated_at: "2026-09-20T10:00:00Z",
          quote_pricing_basis: "public_list_price_ex_tax",
          quote_customer_nanoeur: 3020000000,
          quote_expires_at: "2099-01-01T00:00:00Z",
        },
        events: [],
        attempts: [],
        approval: null,
      };
    else {
      unmatched.push(`${request.method()} ${path}`);
      status = 503;
      body = { error: { code: "FIXTURE_MISSING", message: "Fixture absente" } };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return { writes, unmatched };
}

test("administrator declares a sender, then reaches postal preparation without a send", async ({
  page,
}, info) => {
  const state = await fixture(page);
  await page.goto("/#/app/senders");
  const name = page.getByRole("textbox", { name: "Nom de l’expéditeur" });
  const address = page.getByRole("textbox", {
    name: "Adresse postale de l’expéditeur",
  });
  await expect(name).toBeVisible();
  await expect(
    page.getByText(/ne constitue pas une vérification physique/),
  ).toBeVisible();
  await mkdir("reports/screenshots/postal-setup", { recursive: true });
  await page.screenshot({
    path: `reports/screenshots/postal-setup/${info.project.name}.png`,
    fullPage: true,
  });
  await name.fill("Atelier Exemple");
  await address.fill("12 rue des Exemples\nL-1234 Luxembourg");
  await page
    .getByRole("button", { name: "Activer le courrier", exact: true })
    .click();
  expect(state.writes).toEqual([]);
  const authority = page.getByRole("checkbox", { name: /Je suis autorisé/ });
  const activate = page.getByRole("button", {
    name: "Activer le courrier",
    exact: true,
  });
  if (info.project.name === "chromium") {
    await authority.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await expect(activate).toBeFocused();
    await page.keyboard.press("Enter");
  } else {
    await authority.check();
    await activate.tap();
  }
  await expect(
    page.getByRole("heading", { name: "Votre expéditeur postal est prêt" }),
  ).toBeFocused();
  await expect(
    page.getByText("Déclaré par l’administrateur").first(),
  ).toBeVisible();
  expect(state.writes).toEqual([
    {
      path: "/api/postal/setup",
      body: {
        name: "Atelier Exemple",
        address: "12 rue des Exemples\nL-1234 Luxembourg",
        authorized: true,
      },
      csrf: "postal-csrf-fixture",
    },
  ]);
  await page.getByRole("link", { name: "Préparer un courrier" }).click();
  await expect(
    page.getByRole("radio", { name: "Courrier postal" }),
  ).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Expéditeur" })).toHaveValue(
    "postal-sender-fixture",
  );
  expect(state.writes).toHaveLength(1);
  expect(state.unmatched).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const role of ["member", "viewer"] as const) {
  test(`${role} gets administrator guidance without an activation form`, async ({
    page,
  }) => {
    const state = await fixture(page, { role });
    await page.goto("/#/app/senders");
    await expect(
      page.getByText(/Un administrateur de votre organisation doit déclarer/),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Nom de l’expéditeur" }),
    ).toHaveCount(0);
    expect(state.writes).toEqual([]);
    expect(state.unmatched).toEqual([]);
  });
}

for (const reason of [
  "channel_stopped",
  "sender_disabled",
  "operator_review_required",
] as const) {
  test(`${reason} cannot be reopened by declaring a sender`, async ({
    page,
  }) => {
    const state = await fixture(page, { reason });
    await page.goto("/#/app/senders");
    await expect(
      page.getByText(
        reason === "channel_stopped"
          ? "Le courrier est arrêté pour votre organisation."
          : /Cette configuration postale ne peut pas être activée ici/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Activer le courrier", exact: true }),
    ).toHaveCount(0);
    if (reason === "channel_stopped")
      await expect(
        page.getByRole("link", { name: "Ouvrir l’administration" }),
      ).toHaveAttribute("href", "#/app/admin");
    expect(state.writes).toEqual([]);
    expect(state.unmatched).toEqual([]);
  });
}

test("failed setup retains the declaration and supports an explicit retry", async ({
  page,
}) => {
  const state = await fixture(page, { failFirst: true });
  await page.goto("/#/app/senders");
  await page
    .getByRole("textbox", { name: "Nom de l’expéditeur" })
    .fill("Atelier Exemple");
  const address = page.getByRole("textbox", {
    name: "Adresse postale de l’expéditeur",
  });
  await address.fill("12 rue des Exemples\nL-1234 Luxembourg");
  await page.getByRole("checkbox", { name: /Je suis autorisé/ }).check();
  await page
    .getByRole("button", { name: "Activer le courrier", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(address).toHaveValue("12 rue des Exemples\nL-1234 Luxembourg");
  await page
    .getByRole("button", { name: "Activer le courrier", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Votre expéditeur postal est prêt" }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(
    state.writes.every((write) => write.path === "/api/postal/setup"),
  ).toBe(true);
  expect(state.unmatched).toEqual([]);
});

test("a pending sender cannot be self-verified through postal setup", async ({
  page,
}) => {
  const state = await fixture(page, {
    reason: "sender_disabled",
    senderStatus: "pending",
  });
  await page.goto("/#/app/senders");
  await expect(
    page.getByText(/Cette configuration postale ne peut pas être activée ici/),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nom de l’expéditeur" }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
  expect(state.unmatched).toEqual([]);
});

test("expired pricing renews only after reauthorization of the unchanged sender", async ({
  page,
}) => {
  const state = await fixture(page, { reason: "pricing_expired" });
  await page.goto("/#/app/senders");
  const name = page.getByRole("textbox", { name: "Nom de l’expéditeur" });
  const address = page.getByRole("textbox", {
    name: "Adresse postale de l’expéditeur",
  });
  await expect(name).toHaveAttribute("readonly", "");
  await expect(address).toHaveValue("12 rue des Exemples\nL-1234 Luxembourg");
  await expect(address).toHaveAttribute("readonly", "");
  const renew = page.getByRole("button", {
    name: "Actualiser la configuration postale",
  });
  await renew.click();
  expect(state.writes).toEqual([]);
  await page.getByRole("checkbox", { name: /Je suis autorisé/ }).check();
  await renew.click();
  await expect(
    page.getByRole("heading", { name: "Votre expéditeur postal est prêt" }),
  ).toBeVisible();
  expect(state.writes).toEqual([
    {
      path: "/api/postal/setup",
      body: {
        name: "Atelier Exemple",
        address: "12 rue des Exemples\nL-1234 Luxembourg",
        authorized: true,
      },
      csrf: "postal-csrf-fixture",
    },
  ]);
  expect(state.unmatched).toEqual([]);
});

test("missing postal sender leads to setup and a postal quote has no email exchange-rate copy", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/prepare?channel=postal");
  await page
    .getByRole("link", { name: "Activer le courrier dans les expéditeurs" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Nom de l’expéditeur" }),
  ).toBeVisible();
  await page.goto("/#/app/dispatch/postal-quote-fixture");
  await expect(
    page.getByText("Prix du courrier HT", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Prix du courrier hors taxes, fixé en euros/),
  ).toBeVisible();
  await expect(
    page.getByText(/Tarif de référence SES|1 USD|taux de référence BCE/),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
  expect(state.unmatched).toEqual([]);
});
