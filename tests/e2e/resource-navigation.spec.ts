import { expect, test, type Page } from "@playwright/test";
import type { Session } from "../../apps/web/src/api";

// Synthetic browser fixtures only. No session, document or draft is written.
async function setup(page: Page, failure?: "missing" | "expired") {
  let session: Session = {
    organization: { id: "resource-workshop-a", name: "Atelier synthétique A" },
    user: { id: "resource-user-a", name: "Compte de test A", role: "admin" },
    csrfToken: "synthetic-csrf",
    simulation: true,
  };
  const writes: string[] = [];
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const gates: Record<string, () => void> = {};
    Object.assign(window, { resourceReadGates: gates });
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path !== "/api/campaigns/pending") return original(input, init);
      // Model a transport that finishes after abort (e.g. cached parsing).
      // Application state must reject that result independently of fetch.
      const response = await original(input, { ...init, signal: undefined });
      await new Promise<void>((resolve) => {
        gates.pending = resolve;
      });
      return response;
    };
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    if (route.request().method() !== "GET") writes.push(path);
    let body: unknown;
    if (path === "/session") body = session;
    else if (path === "/capabilities")
      body = { registration: { enabled: true } };
    else if (path.startsWith("/campaigns/")) {
      const id = path.split("/").at(-1)!;
      if (id === "pending" && failure)
        return route.fulfill({
          status: failure === "expired" ? 401 : 404,
          json: {
            error: {
              code: failure === "expired" ? "UNAUTHENTICATED" : "NOT_FOUND",
              message: "Campagne introuvable.",
            },
          },
        });
      body = {
        campaign: {
          id,
          name: `Campagne synthétique ${id}`,
          status: "prepared",
          created_at: "2026-10-23T00:00:00.000Z",
          updated_at: "2026-10-23T00:00:00.000Z",
        },
        dispatches: [
          {
            id: `dispatch-${id}`,
            channel: "email",
            recipient_json: { email: `${id}@example.invalid` },
            status: "prepared",
            mode: "simulation",
            estimated_minor: 0,
            ceiling_minor: 100,
            currency: "EUR",
            fingerprint: "synthetic-fingerprint",
            created_at: "2026-10-23T00:00:00.000Z",
            updated_at: "2026-10-23T00:00:00.000Z",
          },
        ],
      };
    } else if (path === "/overview")
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
    else body = { items: [], nextCursor: null };
    return route.fulfill({ json: body });
  });
  return {
    writes,
    switchAccount() {
      session = {
        ...session,
        organization: {
          id: "resource-workshop-b",
          name: "Atelier synthétique B",
        },
        user: {
          id: "resource-user-b",
          name: "Compte de test B",
          role: "admin",
        },
      };
    },
  };
}

async function navigate(page: Page, id: string) {
  await page.evaluate((value) => {
    location.hash = `/app/campaign/${value}`;
  }, id);
}

async function waitForPending(page: Page) {
  await page.waitForFunction(() =>
    Boolean(Reflect.get(window, "resourceReadGates")?.pending),
  );
}

async function releasePending(page: Page) {
  await page.evaluate(() => Reflect.get(window, "resourceReadGates").pending());
}

test("a different campaign never displays the previous recipients while loading or failing", async ({
  page,
}) => {
  const fixture = await setup(page, "missing");
  await page.goto("/#/app/campaign/first");
  await expect(
    page.getByRole("heading", {
      name: "Campagne synthétique first",
      exact: true,
    }),
  ).toBeVisible();
  await navigate(page, "pending");
  await waitForPending(page);
  await expect(
    page.getByRole("heading", {
      name: "Campagne synthétique first",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /first@example\.invalid/ }),
  ).toHaveCount(0);
  await releasePending(page);
  await expect(page.getByRole("alert")).toContainText("Campagne introuvable.");
  await navigate(page, "last");
  await expect(
    page.getByRole("heading", {
      name: "Campagne synthétique last",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test("an aborted read that still resolves cannot replace a newer campaign", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/#/app/campaign/pending");
  await waitForPending(page);
  await navigate(page, "last");
  await expect(
    page.getByRole("heading", {
      name: "Campagne synthétique last",
      exact: true,
    }),
  ).toBeVisible();
  await releasePending(page);
  // Observe after the delayed JSON and React update have both had a frame.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole("heading", {
      name: "Campagne synthétique last",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Campagne synthétique pending",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test("a late unauthorized read from the previous account cannot expire the new workshop session", async ({
  page,
}) => {
  const fixture = await setup(page, "expired");
  await page.goto("/#/app/campaign/pending");
  await waitForPending(page);
  fixture.switchAccount();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  await expect(page.locator(".workspace")).toContainText(
    "Atelier synthétique B",
  );
  await releasePending(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".session-expired")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Campagne synthétique pending",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".workspace")).not.toContainText(
    "Compte de test A",
  );
  expect(fixture.writes).toEqual([]);
});
