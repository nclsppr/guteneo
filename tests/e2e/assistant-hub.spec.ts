import { expect, test, type Page } from "@playwright/test";
import type { AssistantConnection } from "../../apps/web/src/assistant-state";
import type { Session } from "../../apps/web/src/api";
import { evidencePath } from "../preview-e2e/evidence";

// UI-only transport fixtures. These rows exercise the presentation of server
// evidence; they are not a real OAuth connection or a successful MCP exchange.
async function fixture(page: Page, initialItems: AssistantConnection[] = []) {
  const session: Session = {
    organization: { id: "assistant-tenant-a", name: "Atelier Exemple" },
    user: { id: "assistant-user-a", name: "Camille Exemple", role: "admin" },
    csrfToken: "assistant-ui-fixture-only",
    simulation: true,
  };
  let items = initialItems;
  let failure = false;
  let pending: Promise<void> | undefined;
  let release: (() => void) | undefined;
  const writes: string[] = [];
  const unmatched: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    const method = route.request().method();
    let status = 200;
    let body: unknown;
    if (method !== "GET") {
      writes.push(`${method} ${path}`);
      status = 403;
      body = {
        error: {
          code: "UI_ONLY",
          message: "Aucune mutation autorisée dans ce test.",
        },
      };
    } else if (path === "/session") body = session;
    else if (path === "/connections") {
      if (pending) await pending;
      if (failure) {
        status = 503;
        body = {
          error: {
            code: "FIXTURE_UNAVAILABLE",
            message: "Lecture indisponible dans ce scénario.",
          },
        };
      } else body = { items, nextCursor: null };
    } else if (["/documents", "/dispatches", "/senders"].includes(path)) {
      body = { items: [], nextCursor: null };
    } else if (path === "/capabilities") {
      body = { simulation: true };
    } else {
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
  return {
    session,
    writes,
    unmatched,
    setItems(next: AssistantConnection[]) {
      items = next;
    },
    setFailure(value: boolean) {
      failure = value;
    },
    pause() {
      pending = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    resume() {
      release?.();
      pending = undefined;
    },
  };
}

function connection(
  id: string,
  extra: Partial<AssistantConnection> = {},
): AssistantConnection {
  return {
    id,
    client_id: id,
    status: "active",
    created_at: "2026-09-20T08:00:00Z",
    display_name: null,
    assistant: null,
    last_successful_tool_at: null,
    verification: "unverified",
    ...extra,
  };
}

const welcomeTitle = "Commencez dans votre assistant habituel.";
const emptyMessage = "Aucun assistant autorisé pour ce compte.";
const activeMessage = "Autorisation active · Premier échange à vérifier";

test("loading and failed connection reads never masquerade as an empty account", async ({
  page,
}) => {
  const state = await fixture(page);
  state.pause();
  await page.goto("/#/app/connection");
  const connections = page.getByRole("region", {
    name: "Mes connexions",
    exact: true,
  });
  await expect(
    connections.getByRole("status", { name: /Chargement/ }),
  ).toBeVisible();
  await expect(connections).not.toContainText(emptyMessage);
  await expect(
    connections.getByRole("button", { name: "Actualiser", exact: true }),
  ).toBeDisabled();
  state.setFailure(true);
  state.resume();
  await expect(connections.getByRole("alert")).toBeVisible();
  await expect(connections.getByRole("status")).toContainText(
    "Impossible de vérifier vos connexions.",
  );
  await expect(connections).not.toContainText(emptyMessage);
  state.setFailure(false);
  await connections
    .getByRole("button", { name: "Actualiser", exact: true })
    .click();
  await expect(connections).toContainText(emptyMessage);
  await expect(connections.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toEqual([]);
  expect(state.unmatched).toEqual([]);
});

test("copying a guide leaves an active authorization unverified", async ({
  page,
}, info) => {
  const state = await fixture(page, [connection("fixture-active-client")]);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          document.documentElement.dataset.copied = value;
        },
      },
    }),
  );
  await page.goto("/#/app/connection/chatgpt");
  await expect(
    page.getByRole("heading", {
      name: "Ajouter Guteneo à ChatGPT",
      exact: true,
    }),
  ).toBeVisible();
  const connections = page.getByRole("region", {
    name: "Mes connexions",
    exact: true,
  });
  await expect(
    connections.getByText(activeMessage, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Copier l’adresse", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    "https://guteneo.com/mcp",
  );
  await page
    .getByRole("button", {
      name: "Copier la demande de vérification",
      exact: true,
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-copied", /Guteneo/);
  await connections
    .getByRole("button", { name: "Actualiser", exact: true })
    .click();
  await expect(
    connections.getByText(activeMessage, { exact: true }),
  ).toBeVisible();
  await expect(
    connections.getByText("Connexion vérifiée", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: await evidencePath(`workspace/guide-${info.project.name}.png`),
    fullPage: true,
  });
  expect(state.writes).toEqual([]);
  expect(state.unmatched).toEqual([]);
});

test("verified connections require active authorization and dated server proof", async ({
  page,
}) => {
  const proofTime = "2026-09-20T09:15:00Z";
  const state = await fixture(page, [
    connection("fixture-legacy", {
      verification: undefined,
      last_successful_tool_at: undefined,
    }),
    connection("fixture-missing-date", { verification: "verified" }),
    connection("fixture-verified", {
      verification: "verified",
      last_successful_tool_at: proofTime,
    }),
    connection("fixture-revoked", {
      status: "revoked",
      verification: "verified",
      last_successful_tool_at: proofTime,
    }),
  ]);
  await page.goto("/#/app/connection");
  const connections = page.getByRole("region", {
    name: "Mes connexions",
    exact: true,
  });
  await expect(
    connections.getByText("Connexion vérifiée", { exact: true }),
  ).toHaveCount(1);
  for (const id of ["fixture-legacy", "fixture-missing-date"]) {
    await expect(
      connections
        .getByRole("listitem")
        .filter({ hasText: id })
        .getByText(activeMessage, { exact: true }),
    ).toBeVisible();
  }
  await expect(
    connections.getByRole("listitem").filter({ hasText: "fixture-verified" }),
  ).toContainText("Dernier échange réussi");
  await expect(
    connections
      .getByRole("listitem")
      .filter({ hasText: "fixture-revoked" })
      .getByText("Autorisation révoquée", { exact: true }),
  ).toBeVisible();
  await expect(
    connections
      .getByRole("listitem")
      .filter({ hasText: "fixture-revoked" })
      .getByRole("button"),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
  expect(state.unmatched).toEqual([]);
});

test("workspace routing catches a fragment change before its listener subscribes", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.addInitScript(() => {
    const subscribe = window.addEventListener.bind(window);
    let changed = false;
    window.addEventListener = (
      ...args: Parameters<Window["addEventListener"]>
    ) => {
      if (args[0] === "hashchange" && !changed) {
        changed = true;
        const oldURL = window.location.href;
        // Reproduce a fragment navigation between React's first render and its
        // passive subscription. The notification precedes the new listener.
        window.history.replaceState(null, "", "/#/app");
        window.dispatchEvent(
          new HashChangeEvent("hashchange", {
            oldURL,
            newURL: window.location.href,
          }),
        );
      }
      subscribe(...args);
    };
  });
  await page.goto("/#/app/prepare?entry=direct");
  await expect(page).toHaveURL(/#\/app$/);
  await expect(
    page.getByRole("heading", {
      name: "Votre correspondance, au clair.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Préparer une correspondance.",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
  expect(state.unmatched).toEqual([]);
});

test("direct sending preference persists only for its user and tenant and can be reversed", async ({
  page,
}, info) => {
  const state = await fixture(page);
  await page.goto("/#/app");
  const welcome = page.getByRole("region", { name: welcomeTitle, exact: true });
  await expect(welcome).toBeVisible();
  expect((await welcome.boundingBox())!.y).toBeLessThan(
    (await page.locator(".overview-stats").boundingBox())!.y,
  );
  await page.screenshot({
    path: await evidencePath(`workspace/onboarding-${info.project.name}.png`),
    fullPage: true,
  });
  await expect(
    welcome.getByRole("link", { name: "Envoyer depuis Guteneo", exact: true }),
  ).toHaveAttribute("href", "#/app/prepare?entry=direct");
  await page.goto("/");
  await page
    .locator("#installation")
    .getByRole("link", { name: "Envoyer depuis Guteneo", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/prepare\?entry=direct$/);
  await expect(
    page.getByRole("heading", {
      name: "Préparer une correspondance.",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.goto("/#/app");
  await expect(page.locator(".overview-stats")).toBeVisible();
  await expect(
    page.getByText("Chargement de vos assistants…", { exact: true }),
  ).toHaveCount(0);
  await expect(welcome).toHaveCount(0);

  state.session.user.id = "assistant-user-b";
  await page.reload();
  await expect(welcome).toBeVisible();
  state.session.user.id = "assistant-user-a";
  state.session.organization.id = "assistant-tenant-b";
  await page.reload();
  await expect(welcome).toBeVisible();

  state.session.organization.id = "assistant-tenant-a";
  await page.goto("/#/app/connection");
  await page.reload();
  await page
    .getByRole("button", { name: "Réafficher l’invitation", exact: true })
    .click();
  await page.goto("/#/app");
  await expect(welcome).toBeVisible();
  await page.reload();
  await expect(welcome).toBeVisible();
  expect(state.writes).toEqual([]);
  expect(state.unmatched).toEqual([]);
});

test("Assistants is the second workspace destination and every private guide survives a deep link", async ({
  page,
}, info) => {
  const state = await fixture(page);
  await page.goto("/#/app");
  const nav = page.getByRole("navigation", {
    name: "Navigation de l’atelier",
    exact: true,
  });
  // The session response mounts the navigation after the initial page load.
  await expect(page.locator(".workspace-navigation")).toBeVisible();
  if (!(await nav.isVisible()))
    await page.locator(".workspace-navigation summary").click();
  await expect(nav).toBeVisible();
  const labels = (await nav.getByRole("link").allTextContents()).map((text) =>
    text.trim(),
  );
  expect(labels.slice(0, 2)).toEqual(["Vue d’ensemble", "Assistants"]);
  await nav.getByRole("link", { name: "Assistants", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/app\/connection$/);
  await expect(
    page.getByRole("heading", {
      name: "Vos assistants, votre correspondance.",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: await evidencePath(`workspace/assistants-${info.project.name}.png`),
    fullPage: true,
  });
  for (const [id, name] of [
    ["chatgpt", "ChatGPT"],
    ["claude", "Claude"],
    ["grok", "Grok"],
    ["copilot", "GitHub Copilot"],
    ["microsoft365", "Microsoft 365 Copilot"],
    ["cursor", "Cursor"],
  ]) {
    await page.goto(`/#/app/connection/${id}`);
    await expect(
      page.getByRole("heading", {
        name: `Ajouter Guteneo à ${name}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Vérifier la connexion", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Ajouter Guteneo à Cursor",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes).toEqual([]);
  expect(state.unmatched).toEqual([]);
});

test("signup and login preserve the requested guide or direct sending route", async ({
  page,
  baseURL,
}) => {
  const unexpected: string[] = [];
  // A reserved test origin selects the managed-login UI. All requests are
  // intercepted; only static assets are read from the local application server.
  const testOrigin = "https://assistant-ui.example.test";
  await page.route(`${testOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "Connectez-vous.",
          },
        }),
      });
    } else if (url.pathname === "/api/capabilities") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ registration: { enabled: true } }),
      });
    } else if (
      /^\/(api|auth|oauth|mcp)(\/|$)/.test(url.pathname) ||
      route.request().method() !== "GET"
    ) {
      unexpected.push(`${route.request().method()} ${url.pathname}`);
      await route.fulfill({
        status: 403,
        body: "No external action in this UI fixture.",
      });
    } else {
      const response = await route.fetch({
        url: new URL(url.pathname + url.search, baseURL).href,
      });
      await route.fulfill({ response });
    }
  });
  for (const destination of [
    "/#/app/connection/chatgpt",
    "/#/app/prepare?entry=direct",
  ]) {
    await page.goto(`${testOrigin}${destination}`);
    const signup = page.getByRole("link", {
      name: "Créer mon compte",
      exact: true,
    });
    await expect(signup).toBeVisible();
    const login = page.locator('a[href^="/auth/login?"]');
    await expect(login).toBeVisible();
    for (const link of [signup, login]) {
      const href = await link.getAttribute("href");
      expect(new URL(href!, testOrigin).searchParams.get("returnTo")).toBe(
        destination,
      );
    }
  }
  expect(unexpected).toEqual([]);
});
