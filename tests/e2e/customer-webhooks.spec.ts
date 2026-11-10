import { expect, test, type Page } from "@playwright/test";
import type { CustomerWebhookEndpoint } from "../../packages/contracts/src/customer-webhooks";

// Every API response is synthetic. No callback destination or provider is contacted.
const path = "/#/app/administration/webhooks";
const initialSecret = "cwhsec_synthetic_browser_first_reveal_only";
const rotatedSecret = "cwhsec_synthetic_browser_replacement_only";
const emptyCounts = {
  pending: 0,
  sending: 0,
  sent: 0,
  failed: 0,
  unknown: 0,
  superseded: 0,
};
const endpoint = (id = "cwh_synthetic"): CustomerWebhookEndpoint => ({
  id,
  name: "Synthetic callback",
  url: "https://callback.synthetic-customer.org/events",
  enabled: false,
  status: "active",
  revision: 1,
  createdAt: "2026-11-09T12:00:00.000Z",
  updatedAt: "2026-11-09T12:00:00.000Z",
  overflowCount: 0,
  deliveryCounts: { ...emptyCounts },
});
type Write = {
  path: string;
  method: string;
  key?: string;
  body: Record<string, unknown>;
};

async function fixture(
  page: Page,
  options: {
    enabled?: boolean;
    configured?: boolean;
    initial?: CustomerWebhookEndpoint[];
    loseFirstCreate?: boolean;
    createGate?: Promise<void>;
  } = {},
) {
  const items = structuredClone(options.initial ?? []),
    writes: Write[] = [];
  let workspace = "original",
    creates = 0,
    configStatus = 200,
    mutationStatus = 200,
    conflictNextMutation = false;
  const enabled = options.enabled ?? true,
    configured = options.configured ?? true;
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      routePath = url.pathname;
    if (routePath === "/api/session") {
      await route.fulfill({
        json: {
          organization: {
            id: `org_${workspace}`,
            name: `${workspace} synthetic workspace`,
          },
          user: {
            id: `user_${workspace}`,
            name: "Synthetic administrator",
            role: "admin",
            preferredLocale: "en",
          },
          csrfToken: `synthetic-csrf-${workspace}`,
          simulation: false,
          verifiedAccount: true,
        },
      });
      return;
    }
    if (routePath === "/api/administration/overview") {
      await route.fulfill({
        json: {
          generatedAt: "2026-11-09T12:00:00.000Z",
          period: { from: "2026-11-01", to: "2026-11-09" },
          workspace: {
            id: `org_${workspace}`,
            name: `${workspace} synthetic workspace`,
            mode: "production",
            createdAt: "2026-11-01T00:00:00.000Z",
          },
          totals: {
            dispatches: 0,
            delivered: 0,
            attention: 0,
            pages: 0,
            consumptionMinor: 0,
            reservedMinor: 0,
            documents: 0,
            secureShares: 0,
            members: 1,
            activeConnections: 1,
          },
          credit: null,
          trend: [],
          channels: [],
          statuses: [],
          incidents: [],
        },
      });
      return;
    }
    if (routePath === "/api/customer-webhooks" && request.method() === "GET") {
      await route.fulfill(
        configStatus === 403
          ? {
              status: 403,
              json: {
                error: {
                  code: "FORBIDDEN",
                  message: "A browser administrator is required.",
                },
              },
            }
          : {
              json: {
                items: workspace === "original" ? items : [],
                capabilities: {
                  configured,
                  enabled,
                  reason: enabled ? null : "disabled",
                  endpointLimit: 5,
                  pendingLimit: 500,
                },
              },
            },
      );
      return;
    }
    if (/^\/api\/customer-webhooks\/[^/]+\/deliveries$/.test(routePath)) {
      await route.fulfill({
        json: {
          items: [
            {
              id: "cwhd_unknown",
              eventId: "evt_synthetic",
              endpointRevision: 1,
              dispatchId: "dispatch_synthetic",
              dispatchStatus: "submission_unknown",
              status: "unknown",
              occurredAt: "2026-11-09T12:00:00.000Z",
              finishedAt: "2026-11-09T12:00:01.000Z",
              responseStatus: null,
              errorCode: "transport_outcome_unknown",
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    if (
      routePath.startsWith("/api/customer-webhooks") &&
      request.method() !== "GET"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({
        path: routePath,
        method: request.method(),
        key: request.headers()["idempotency-key"],
        body,
      });
      if (mutationStatus === 403) {
        await route.fulfill({
          status: 403,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "A browser administrator is required.",
            },
          },
        });
        return;
      }
      if (routePath === "/api/customer-webhooks") {
        creates++;
        if (!items.length)
          items.push({
            ...endpoint(),
            name: String(body.name),
            url: String(body.url),
          });
        const receipt = {
          endpoint: structuredClone(items[0]),
          ...(creates === 1 ? { signingSecret: initialSecret } : {}),
        };
        if (options.loseFirstCreate && creates === 1) {
          await route.abort("failed");
          return;
        }
        await options.createGate;
        await route.fulfill({ json: receipt });
        return;
      }
      const id = routePath.split("/")[3],
        current = items.find((item) => item.id === id);
      if (!current) {
        await route.fulfill({
          status: 404,
          json: {
            error: { code: "NOT_FOUND", message: "Endpoint unavailable." },
          },
        });
        return;
      }
      if (conflictNextMutation) {
        conflictNextMutation = false;
        current.revision++;
        current.name = "Fresh server revision";
      }
      if (body.revision !== current.revision) {
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: "WEBHOOK_CHANGED",
              message: "This endpoint changed. Refresh before continuing.",
            },
          },
        });
        return;
      }
      current.revision++;
      if (routePath.endsWith("/rotate-secret")) {
        current.enabled = false;
        await route.fulfill({
          json: { endpoint: current, signingSecret: rotatedSecret },
        });
        return;
      }
      if (routePath.endsWith("/revoke")) {
        current.enabled = false;
        current.status = "revoked";
        await route.fulfill({ json: current });
        return;
      }
      if (typeof body.name === "string") current.name = body.name;
      if (typeof body.url === "string" && body.url !== current.url) {
        current.url = body.url;
        current.enabled = false;
      }
      if (typeof body.enabled === "boolean") current.enabled = body.enabled;
      await route.fulfill({ json: current });
      return;
    }
    await route.fulfill({
      json:
        routePath === "/api/capabilities"
          ? {
              version: "1",
              mode: "production",
              simulation: false,
              channels: [],
            }
          : { items: [], nextCursor: null },
    });
  });
  return {
    items,
    writes,
    switchWorkspace: () => {
      workspace = "replacement";
    },
    denyConfiguration: () => {
      configStatus = 403;
    },
    conflictNextMutation: () => {
      conflictNextMutation = true;
    },
    denyMutation: () => {
      mutationStatus = 403;
    },
  };
}
async function open(page: Page) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Customer webhooks", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main .loading")).toHaveCount(0);
}
const newForm = (page: Page) =>
  page.locator("section").filter({
    has: page.getByRole("heading", { name: "New endpoint", exact: true }),
  });
async function fillAndCreate(page: Page) {
  const form = newForm(page);
  await form
    .getByLabel("Endpoint name", { exact: true })
    .fill("Synthetic callback");
  await form
    .getByLabel("HTTPS endpoint", { exact: true })
    .fill("https://callback.synthetic-customer.org/events");
  await form
    .getByRole("button", {
      name: "Create endpoint and show signing secret",
      exact: true,
    })
    .click();
}
async function noStoredSecret(page: Page) {
  const values = await page.evaluate(() =>
    [...Object.values(localStorage), ...Object.values(sessionStorage)].join(
      "\n",
    ),
  );
  expect(values).not.toContain(initialSecret);
  expect(values).not.toContain(rotatedSecret);
}

test("configuration-off keeps metadata visible and does not enable or invoke a callback", async ({
  page,
}) => {
  const state = await fixture(page, {
    enabled: false,
    configured: false,
    initial: [endpoint()],
  });
  await open(page);
  await expect(
    page.getByText("Webhook configuration is unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enable endpoint", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Synthetic callback", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "New endpoint", exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("creation shows a one-time secret only in the current page and a reload never reveals it again", async ({
  page,
}) => {
  const state = await fixture(page);
  await open(page);
  await fillAndCreate(page);
  const secret = page.getByRole("textbox", {
    name: "Signing secret",
    exact: true,
  });
  await expect(secret).toHaveValue(initialSecret);
  await expect(secret).toHaveAttribute("autocomplete", "off");
  await expect(
    page.getByRole("button", { name: "Enable endpoint", exact: true }),
  ).toBeVisible();
  expect(state.items[0].enabled).toBe(false);
  expect(state.writes[0].body.revealSigningSecret).toBe(true);
  await noStoredSecret(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Synthetic callback", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Signing secret", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(initialSecret);
  expect(state.writes).toHaveLength(1);
});

test("enable, pause, revision-bound rotation and revocation require their explicit actions", async ({
  page,
}) => {
  const state = await fixture(page, { initial: [endpoint()] });
  await open(page);
  await page
    .getByRole("button", { name: "Enable endpoint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause endpoint", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause endpoint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable endpoint", exact: true }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Replace and show signing secret",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Signing secret", exact: true }),
  ).toHaveValue(rotatedSecret);
  expect(state.items[0]).toMatchObject({ enabled: false, revision: 4 });
  await page
    .getByRole("button", { name: /^(Delete|Revoke) endpoint$/ })
    .click();
  await expect(
    page.getByText("Endpoint revoked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Signing secret", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "This endpoint already exists. Replace its signing secret if the first response was lost.",
      { exact: true },
    ),
  ).toHaveCount(0);
  expect(state.writes.map((write) => write.body.revision)).toEqual([
    1, 2, 3, 4,
  ]);
  expect(state.items[0].status).toBe("revoked");
  await noStoredSecret(page);
});

test("a lost creation response retries one key and explicitly replaces its unrecoverable first secret", async ({
  page,
}) => {
  const state = await fixture(page, { loseFirstCreate: true });
  await open(page);
  await fillAndCreate(page);
  await expect(newForm(page).getByRole("alert")).toBeVisible();
  await newForm(page)
    .getByRole("button", {
      name: "Create endpoint and show signing secret",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "This endpoint already exists. Replace its signing secret if the first response was lost.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(state.items).toHaveLength(1);
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0].key).toBeTruthy();
  expect(state.writes[1].key).toBe(state.writes[0].key);
  await expect(
    page.getByRole("textbox", { name: "Signing secret", exact: true }),
  ).toHaveCount(0);
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Replace and show signing secret",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Signing secret", exact: true }),
  ).toHaveValue(rotatedSecret);
  await noStoredSecret(page);
});

test("a stale endpoint revision stops the write until the current configuration is read", async ({
  page,
}) => {
  const state = await fixture(page, { initial: [endpoint()] });
  await open(page);
  state.conflictNextMutation();
  await page
    .getByRole("button", { name: "Enable endpoint", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("WEBHOOK_CHANGED");
  expect(state.writes).toHaveLength(1);
  expect(state.items[0].enabled).toBe(false);
  await page
    .getByRole("button", { name: "Refresh", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Fresh server revision", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enable endpoint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause endpoint", exact: true }),
  ).toBeVisible();
  expect(state.writes.map((write) => write.body.revision)).toEqual([1, 2]);
});

for (const refusal of ["configuration", "action"] as const) {
  test(`an ${refusal} authority refusal clears prior signing material and privileged configuration`, async ({
    page,
  }) => {
    const state = await fixture(page);
    await open(page);
    await fillAndCreate(page);
    await expect(
      page.getByRole("textbox", { name: "Signing secret", exact: true }),
    ).toHaveValue(initialSecret);
    if (refusal === "configuration") {
      state.denyConfiguration();
      await page
        .getByRole("button", { name: "Refresh", exact: true })
        .first()
        .click();
    } else {
      state.denyMutation();
      await page
        .getByRole("button", { name: "Enable endpoint", exact: true })
        .click();
    }
    await expect(page.getByRole("alert")).toContainText("FORBIDDEN");
    await expect(
      page.getByRole("textbox", { name: "Signing secret", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(initialSecret);
    await expect(
      page.getByRole("button", { name: "Enable endpoint", exact: true }),
    ).toHaveCount(0);
  });
}

test("a delayed creation receipt cannot publish a secret into another workspace", async ({
  page,
}) => {
  let release!: () => void;
  const createGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await fixture(page, { createGate });
  try {
    await open(page);
    await fillAndCreate(page);
    await expect.poll(() => state.writes.length).toBe(1);
    state.switchWorkspace();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page).toHaveURL(/#\/app\/administration$/);
    await page.evaluate(() => {
      location.hash = "#/app/administration/webhooks";
    });
    await expect(
      page.getByRole("heading", { name: "Customer webhooks", exact: true }),
    ).toBeVisible();
    release();
    await expect(
      page.getByText("No configured webhooks.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Signing secret", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(initialSecret);
    expect(state.writes).toHaveLength(1);
    await noStoredSecret(page);
  } finally {
    release();
  }
});

test("unknown callback history is explicit and offers no automatic resubmission", async ({
  page,
}) => {
  const state = await fixture(page, { initial: [endpoint()] });
  await open(page);
  await page
    .getByRole("button", { name: "Webhook deliveries", exact: true })
    .click();
  await expect(
    page.getByText("Unknown outcome, review required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Unknown webhook outcomes are not retried automatically. Acknowledgement confirms receipt by the endpoint, not delivery of the original dispatch.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /retry (delivery|notification)|resend/i }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
});
