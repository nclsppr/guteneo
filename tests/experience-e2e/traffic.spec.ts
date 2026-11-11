import { expect, test, type Page } from "@playwright/test";
import { stationFixture } from "./fixtures";

async function emailFixture(
  page: Page,
  options: {
    interrupted?: boolean;
    expired?: boolean;
    holdApproval?: boolean;
    outcomeRefusal?: number;
  } = {},
) {
  await stationFixture(page);
  const writes: { path: string; body: unknown; key?: string; csrf?: string }[] =
    [];
  let reads = 0;
  let outcomeReadFails = false;
  let releaseApproval: (() => void) | undefined;
  const dispatch = {
    id: "dsp-fixture-email",
    channel: "email",
    recipient_json: JSON.stringify({ email: "recipient@example.invalid" }),
    document_id: null,
    sender_address: "sender@example.invalid",
    subject: "Frozen subject",
    text: "Exact reviewed message.",
    html: "<p>Exact reviewed message.</p>",
    options_json: "{}",
    status: "prepared",
    mode: "production",
    estimated_minor: 1,
    ceiling_minor: 500,
    known_minor: null,
    currency: "EUR",
    fingerprint: "a".repeat(64),
    quote_customer_nanoeur: 2_000_000,
    quote_expires_at: new Date(
      Date.now() + (options.expired ? -60_000 : 3_600_000),
    ).toISOString(),
    created_at: "2026-11-11T10:00:00.000Z",
    updated_at: "2026-11-11T10:00:00.000Z",
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
    if (
      path !== "/capabilities" &&
      !path.startsWith(`/dispatches/${dispatch.id}`)
    )
      return route.fallback();
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:8850",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers":
        "Content-Type, X-CSRF-Token, Idempotency-Key",
      "Access-Control-Allow-Methods": "GET, POST",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (path === "/capabilities")
      return route.fulfill({
        headers,
        json: {
          version: "synthetic-email-review",
          mode: "production",
          simulation: false,
          liveSending: true,
          channels: [
            {
              id: "email",
              liveSending: true,
              name: "Email",
              provider: "synthetic",
              status: "available",
            },
          ],
          registration: { enabled: true },
          secureDistribution: { available: false },
          scheduledDispatches: { enabled: false },
          billing: { configured: false },
          pdfValidation: { available: false },
          documents: { import: false, render: false },
        },
      });
    if (request.method() === "GET") {
      reads += 1;
      if (options.outcomeRefusal && writes.length)
        return route.fulfill({
          status: options.outcomeRefusal,
          headers,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "Synthetic delivery access revoked.",
            },
          },
        });
      if (outcomeReadFails) {
        outcomeReadFails = false;
        return route.fulfill({
          status: 503,
          headers,
          json: {
            error: {
              code: "FIXTURE_UNAVAILABLE",
              message: "Synthetic tracking read failed.",
            },
          },
        });
      }
      return route.fulfill({
        headers,
        json: { dispatch, events: [], attempts: [], approval: null },
      });
    }
    writes.push({
      path,
      body: request.postDataJSON(),
      key: request.headers()["idempotency-key"],
      csrf: request.headers()["x-csrf-token"],
    });
    if (path.endsWith("/approve") && options.holdApproval)
      await new Promise<void>((resolve) => {
        releaseApproval = resolve;
      });
    if (path.endsWith("/confirm")) {
      if (options.interrupted) {
        dispatch.status = "submission_unknown";
        outcomeReadFails = true;
        return route.abort("failed");
      }
      dispatch.status = "queued";
    }
    return route.fulfill({ headers, json: dispatch });
  });
  return {
    writes,
    dispatch,
    reads: () => reads,
    releaseApproval: () => releaseApproval?.(),
    approvalHeld: () => Boolean(releaseApproval),
  };
}

test("a text email requires exact review and attestation before a single approve/confirm intent", async ({
  page,
}) => {
  const fixture = await emailFixture(page);
  await page.goto(`/departures/${fixture.dispatch.id}`);
  await expect(
    page.getByText("Exact reviewed message.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("sender@example.invalid", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("recipient@example.invalid", { exact: true }),
  ).toBeVisible();
  const send = page.getByRole("button", { name: /^Approuver et envoyer/ });
  await expect(send).toBeDisabled();
  expect(fixture.writes).toEqual([]);
  await page.locator(".traffic-consent input").nth(0).check();
  await expect(send).toBeDisabled();
  await page.locator(".traffic-consent input").nth(1).check();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.locator("main .traffic-status")).toHaveText("En attente");
  expect(fixture.writes).toEqual([
    {
      path: `/dispatches/${fixture.dispatch.id}/approve`,
      body: { fingerprint: "a".repeat(64), recipientRequested: true },
      key: undefined,
      csrf: "fixture-csrf-A",
    },
    {
      path: `/dispatches/${fixture.dispatch.id}/confirm`,
      body: {},
      key: `web-confirm:${fixture.dispatch.id}`,
      csrf: "fixture-csrf-A",
    },
  ]);
  expect(fixture.reads()).toBeGreaterThanOrEqual(2);
});

test("an interrupted acceptance requires a successful status read and never resends an unknown outcome", async ({
  page,
}) => {
  const fixture = await emailFixture(page, { interrupted: true });
  await page.goto(`/departures/${fixture.dispatch.id}`);
  await page.locator(".traffic-consent input").nth(0).check();
  await page.locator(".traffic-consent input").nth(1).check();
  await page.getByRole("button", { name: /^Approuver et envoyer/ }).click();
  const checkStatus = page.getByRole("button", {
    name: "Vérifier l'état de cet envoi",
  });
  await expect(checkStatus).toBeEnabled();
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.reads()).toBe(2);
  await checkStatus.click();
  await expect(page.locator("main .traffic-status")).toHaveText(
    "Issue incertaine",
  );
  await expect(
    page.getByRole("button", { name: /^Approuver et envoyer/ }),
  ).toHaveCount(0);
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.reads()).toBe(3);
});

test("a stale prepared read cannot overwrite the accepted send outcome", async ({
  page,
}) => {
  const fixture = await emailFixture(page);
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const gate = {
      hold: false,
      release: undefined as (() => void) | undefined,
    };
    Reflect.set(window, "syntheticOutcomeGate", gate);
    window.fetch = async (input, init) => {
      const path = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        window.location.href,
      ).pathname;
      const hold =
        path === "/api/dispatches/dsp-fixture-email" &&
        (!init?.method || init.method === "GET") &&
        gate.hold;
      if (hold) gate.hold = false;
      // Delay delivery after the response snapshot exists, including when the
      // browser has already received bytes and cancellation comes too late.
      const response = await original(
        input,
        hold ? { ...init, signal: undefined } : init,
      );
      if (!hold) return response;
      await new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      return response;
    };
  });
  await page.goto(`/departures/${fixture.dispatch.id}`);
  await expect(page.locator(".traffic-consent input").nth(0)).toBeVisible();
  await page.evaluate(() => {
    Reflect.get(window, "syntheticOutcomeGate").hold = true;
  });
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await page.waitForFunction(() =>
    Boolean(Reflect.get(window, "syntheticOutcomeGate").release),
  );
  await page.locator(".traffic-consent input").nth(0).check();
  await page.locator(".traffic-consent input").nth(1).check();
  await page.getByRole("button", { name: /^Approuver et envoyer/ }).click();
  await expect(page.locator("main .traffic-status")).toHaveText("En attente");
  await page.evaluate(() => Reflect.get(window, "syntheticOutcomeGate").release());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator("main .traffic-status")).toHaveText("En attente");
  await expect(
    page.getByRole("button", { name: /^Approuver et envoyer/ }),
  ).toHaveCount(0);
  expect(fixture.writes).toHaveLength(2);
});

test("an expired quote cannot obtain consent or issue an approval", async ({
  page,
}) => {
  const fixture = await emailFixture(page, { expired: true });
  await page.goto(`/departures/${fixture.dispatch.id}`);
  await expect(page.locator(".traffic-consent input").nth(0)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /^Approuver et envoyer/ }),
  ).toBeDisabled();
  expect(fixture.writes).toEqual([]);
});

test("leaving the review while approval is pending prevents the confirm continuation", async ({
  page,
}) => {
  const fixture = await emailFixture(page, { holdApproval: true });
  await page.goto(`/departures/${fixture.dispatch.id}`);
  await page.locator(".traffic-consent input").nth(0).check();
  await page.locator(".traffic-consent input").nth(1).check();
  await page.getByRole("button", { name: /^Approuver et envoyer/ }).click();
  await expect.poll(fixture.approvalHeld).toBe(true);
  await page.locator('main a[href="/departures"]').first().click();
  const approvalResponse = page.waitForResponse((response) =>
    response.url().endsWith("/approve"),
  );
  fixture.releaseApproval();
  await approvalResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page).toHaveURL(/\/departures$/);
  expect(fixture.writes.map((write) => write.path)).toEqual([
    `/dispatches/${fixture.dispatch.id}/approve`,
  ]);
});

for (const status of [403, 404, 410]) {
  test(`an outcome read refusal (${status}) discards the entire private ticket`, async ({
    page,
  }) => {
    const fixture = await emailFixture(page, { outcomeRefusal: status });
    await page.goto(`/departures/${fixture.dispatch.id}`);
    await expect(
      page.getByText("Exact reviewed message.", { exact: true }),
    ).toBeVisible();
    await page.locator(".traffic-consent input").nth(0).check();
    await page.locator(".traffic-consent input").nth(1).check();
    await page.getByRole("button", { name: /^Approuver et envoyer/ }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    for (const text of [
      "Exact reviewed message.",
      "Frozen subject",
      "recipient@example.invalid",
      "sender@example.invalid",
    ])
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    await expect(page.locator(".traffic-consent input")).toHaveCount(0);
    expect(fixture.writes).toHaveLength(2);
    expect(fixture.reads()).toBe(2);
  });
}
