import { expect, type Page } from "@playwright/test";
import { workspacePermissions } from "../../packages/contracts/src/roles";

export type FixtureOptions = {
  signedIn?: boolean;
  role?: "admin" | "supervisor" | "member" | "viewer";
  document?: boolean;
  locale?: "fr" | "en" | "de" | "lb";
};

/** Synthetic transport evidence, not a real Auth0, database or provider journey. */
export async function stationFixture(page: Page, options: FixtureOptions = {}) {
  let identity = "A";
  let signedIn = options.signedIn ?? true;
  let documentFailure = 0;
  const writes: string[] = [];
  const requests: string[] = [];
  const missing: string[] = [];
  const role = options.role ?? "admin";
  const capabilities = {
    version: "synthetic-browser-fixture",
    mode: "production",
    simulation: false,
    liveSending: false,
    channels: ["fax", "email", "postal"].map((id) => ({
      id,
      name: id,
      liveSending: false,
      provider: "synthetic",
      status: "disabled",
    })),
    registration: { enabled: true, verification: "verified_account" },
    secureDistribution: { available: true },
    scheduledDispatches: { enabled: false },
    customerWebhooks: { enabled: false },
    billing: { configured: false, mode: "disabled" },
    pdfValidation: { available: false, priceMinor: 0, currency: "EUR" },
    documents: { import: true, render: true },
  };
  const document = () => ({
    id: `doc-${identity}`,
    name: `Private fixture ${identity}.pdf`,
    sha256: "a".repeat(64),
    size: 1000,
    pages: 1,
    status: "ready",
    source: "import",
    created_at: "2026-11-11T10:00:00.000Z",
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
    const method = request.method();
    requests.push(`${method} ${path}`);
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:8850",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers":
        "Content-Type, X-CSRF-Token, Idempotency-Key",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, PUT",
    };
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (method !== "GET") {
      writes.push(`${method} ${path}`);
      return route.fulfill({
        status: 403,
        headers,
        json: {
          error: {
            code: "FIXTURE_WRITE_REFUSED",
            message: "This browser fixture never sends.",
          },
        },
      });
    }
    if (path === "/capabilities")
      return route.fulfill({ headers, json: capabilities });
    if (!signedIn)
      return route.fulfill({
        status: 401,
        headers,
        json: {
          error: {
            code: "UNAUTHENTICATED",
            message: "Sign in required.",
          },
        },
      });
    const user = {
      id: `user-${identity}`,
      name: `Synthetic account ${identity}`,
      email: `fixture-${identity.toLowerCase()}@example.invalid`,
      role,
      preferredLocale: options.locale ?? "fr",
    };
    const organization = {
      id: `workspace-${identity}`,
      name: `Synthetic workspace ${identity}`,
    };
    const csrfToken = `fixture-csrf-${identity}`;
    let body: unknown;
    if (path === "/session")
      body = {
        organization,
        user,
        csrfToken,
        permissions: workspacePermissions(role),
        simulation: false,
        verifiedAccount: true,
      };
    else if (path === "/personal/session")
      body = {
        user,
        csrfToken,
        simulation: false,
        mfa: false,
        verifiedAccount: true,
        authenticatedAt: 1_794_391_200,
        strongAuthentication: false,
        documentAccessMode: "verified_account",
        documentAccessAllowed: true,
        workspaces: [
          {
            ...organization,
            role,
            current: true,
            canViewReports: role === "admin",
          },
        ],
      };
    else if (path === "/overview")
      body = {
        documents: options.document ? 1 : 0,
        dispatches: {
          total: 0,
          approval: 0,
          in_progress: 0,
          attention: 0,
          done: 0,
        },
      };
    else if (path === "/usage")
      body = {
        period: "2026-11",
        currentPeriod: "2026-11",
        availablePeriods: ["2026-11"],
        items: [],
        welcomeCredit: {
          kind: "synthetic",
          currency: "EUR",
          grantedMinor: 5000,
          reservedMinor: 0,
          spentMinor: 0,
          availableMinor: 5000,
          status: "available",
          topUpAvailable: false,
        },
      };
    else if (path === "/documents") {
      if (documentFailure)
        return route.fulfill({
          status: documentFailure,
          headers,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "Document access was revoked.",
            },
          },
        });
      body = { items: options.document ? [document()] : [], nextCursor: null };
    } else if (
      [
        "/dispatches",
        "/senders",
        "/personal/documents",
        "/recipients",
        "/dispatch-schedules",
        "/secure-distributions",
        "/templates",
        "/account/workspaces",
        "/admin/members",
      ].includes(path)
    )
      body = { items: [], nextCursor: null };
    else {
      missing.push(`${method} ${path}`);
      return route.fulfill({
        status: 501,
        headers,
        json: {
          error: {
            code: "UNMAPPED_FIXTURE",
            message: `No synthetic fixture for ${path}.`,
          },
        },
      });
    }
    return route.fulfill({ headers, json: body });
  });
  return {
    writes,
    requests,
    missing,
    async replaceIdentity(next: string) {
      identity = next;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    },
    async revokeDocuments(status = 403) {
      documentFailure = status;
      if (status === 401) signedIn = false;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    },
    assertReadOnly() {
      expect(writes).toEqual([]);
    },
  };
}
