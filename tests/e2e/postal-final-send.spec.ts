import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page, expiresIn = 900_000) {
  const now = Date.parse("2026-09-21T12:00:00.000Z");
  await page.clock.install({ time: new Date(now - 60_000) });
  await page.clock.pauseAt(new Date(now));
  const writes: { path: string; body: unknown; key: string | undefined }[] = [];
  const dispatch = {
    id: "postal_final",
    channel: "postal",
    mode: "production",
    status: "prepared",
    recipient_json: {
      name: "Atelier Exemple",
      addressLine1: "12 rue du Test",
      postalCode: "L-1234",
      city: "Luxembourg",
      country: "LU",
    },
    sender_address: "Maison Exemple, 8 rue du Test, L-1234 Luxembourg",
    options_json: JSON.stringify({
      printMode: "duplex",
      printSpectrum: "color",
      deliveryProduct: "fast",
      addressPosition: "right",
    }) as string | Record<string, unknown> | undefined,
    estimated_minor: 247,
    ceiling_minor: 500,
    quote_customer_nanoeur: 2_461_500_000 as number | null,
    quote_pricing_basis: "public_list_price_ex_tax",
    quote_expires_at: new Date(now + expiresIn).toISOString(),
    currency: "EUR",
    fingerprint: "a".repeat(64),
    created_at: new Date(now - 1000).toISOString(),
    updated_at: new Date(now - 1000).toISOString(),
  };
  const control = {
    result: "queued" as
      "queued" | "lost-queued" | "lost-prepared" | "unknown" | "invalid",
    failReads: false,
  };
  let approved = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET")
      writes.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()["idempotency-key"],
      });
    if (
      path === "/api/dispatches/postal_final" &&
      request.method() === "GET" &&
      control.failReads
    ) {
      await route.abort("failed");
      return;
    }
    if (path.endsWith("/approve")) approved = true;
    if (path.endsWith("/confirm")) {
      if (control.result === "invalid") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "LIVE_QUOTE_INVALID",
              message: "Le devis n’est plus valable.",
            },
          }),
        });
        return;
      }
      if (control.result !== "lost-prepared")
        dispatch.status =
          control.result === "unknown" ? "submission_unknown" : "queued";
      if (control.result.startsWith("lost-")) {
        await route.abort("failed");
        return;
      }
    }
    const result =
      path === "/api/session"
        ? {
            organization: { id: "org_postal_fixture", name: "Atelier Exemple" },
            user: { id: "user_postal_fixture", name: "Camille", role: "admin" },
            csrfToken: "fixture-only",
            simulation: false,
          }
        : path === "/api/capabilities"
          ? {}
          : request.method() === "GET"
            ? {
                dispatch,
                attempts:
                  dispatch.status === "submission_unknown"
                    ? [
                        {
                          id: "attempt_fixture",
                          provider: "pingen",
                          status: "unknown",
                          created_at: dispatch.created_at,
                        },
                      ]
                    : [],
                events: [],
                approval: approved
                  ? {
                      fingerprint: dispatch.fingerprint,
                      expires_at: dispatch.quote_expires_at,
                      approval_kind: "browser",
                    }
                  : null,
              }
            : dispatch;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  return { dispatch, control, writes };
}

test("one explicit postal click approves the immutable version and sends at its exact price", async ({
  page,
}, testInfo) => {
  const f = await fixture(page);
  await page.goto("/#/app/dispatch/postal_final");
  const send = page.getByRole("button", {
    name: "Envoyer pour 2,4615 € HT",
    exact: true,
  });
  await expect(send).toBeEnabled();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator(".dispatch-facts")).toContainText(
    "Atelier Exemple",
  );
  await expect(page.locator(".dispatch-facts")).toContainText(
    "Recto verso · Couleur · Distribution rapide · Fenêtre à droite",
  );
  await page.screenshot({
    path: testInfo.outputPath("postal-final-review.png"),
    fullPage: true,
  });
  // An accidental repeated click must not run parallel approval/send chains.
  await send.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator(".dispatch-reference")).toContainText("En file");
  expect(f.writes).toEqual([
    {
      path: "/api/dispatches/postal_final/approve",
      body: { fingerprint: f.dispatch.fingerprint },
      key: undefined,
    },
    {
      path: "/api/dispatches/postal_final/confirm",
      body: {},
      key: "web-confirm:postal_final",
    },
  ]);
  await expect(send).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("postal quote expiry disables sending and offers preparation without calling fax renewal", async ({
  page,
}) => {
  const f = await fixture(page, 2000);
  await page.goto("/#/app/dispatch/postal_final");
  const send = page.getByRole("button", { name: /Envoyer pour/ });
  await expect(send).toBeEnabled();
  await page.clock.fastForward(3000);
  await expect(send).toBeDisabled();
  await expect(
    page.getByText("Ce devis a expiré.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Préparer un nouveau devis" }),
  ).toHaveAttribute("href", "#/app/prepare?channel=postal");
  await expect(
    page.getByRole("button", { name: "Renouveler le devis", exact: true }),
  ).toHaveCount(0);
  expect(f.writes).toEqual([]);
});

test("a missing exact production postal price cannot authorize sending", async ({
  page,
}) => {
  const f = await fixture(page);
  f.dispatch.quote_customer_nanoeur = null;
  f.dispatch.options_json = undefined;
  await page.goto("/#/app/dispatch/postal_final");
  await expect(
    page.getByRole("button", { name: "Prix indisponible" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Options du courrier", { exact: true }),
  ).toHaveCount(0);
  expect(f.writes).toEqual([]);
});

test("a lost acceptance response reads the committed status without resending", async ({
  page,
}) => {
  const f = await fixture(page);
  f.control.result = "lost-queued";
  await page.goto("/#/app/dispatch/postal_final");
  await page.getByRole("button", { name: /Envoyer pour/ }).click();
  await expect(page.locator(".dispatch-reference")).toContainText("En file");
  await expect(page.getByRole("button", { name: /Envoyer pour/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.clock.fastForward(10_000);
  expect(f.writes.map((write) => write.path)).toEqual([
    "/api/dispatches/postal_final/approve",
    "/api/dispatches/postal_final/confirm",
  ]);
});

test("unreadable outcome blocks sending until a read succeeds, then explicit retry keeps its key", async ({
  page,
}) => {
  const f = await fixture(page);
  f.control.result = "lost-prepared";
  await page.goto("/#/app/dispatch/postal_final");
  const send = page.getByRole("button", { name: /Envoyer pour/ });
  await expect(send).toBeEnabled();
  f.control.failReads = true;
  await send.click();
  await expect(
    page.getByRole("button", { name: "Vérifier le suivi", exact: true }),
  ).toBeEnabled();
  await expect(send).toBeDisabled();
  await page.clock.fastForward(10_000);
  expect(f.writes).toHaveLength(2);
  f.control.failReads = false;
  await page
    .getByRole("button", { name: "Vérifier le suivi", exact: true })
    .click();
  await expect(send).toBeEnabled();
  expect(f.writes).toHaveLength(2);
  f.control.result = "queued";
  await send.click();
  await expect(page.locator(".dispatch-reference")).toContainText("En file");
  expect(f.writes.map((write) => [write.path, write.key])).toEqual([
    ["/api/dispatches/postal_final/approve", undefined],
    ["/api/dispatches/postal_final/confirm", "web-confirm:postal_final"],
    ["/api/dispatches/postal_final/confirm", "web-confirm:postal_final"],
  ]);
});

test("a provider unknown outcome is never retried and the postal follow-up names Guteneo", async ({
  page,
}) => {
  const f = await fixture(page);
  f.control.result = "unknown";
  await page.goto("/#/app/dispatch/postal_final");
  await page.getByRole("button", { name: /Envoyer pour/ }).click();
  await expect(page.getByRole("button", { name: /Envoyer pour/ })).toHaveCount(
    0,
  );
  await page
    .locator("details")
    .filter({ has: page.locator(".attempts") })
    .locator("summary")
    .click();
  await expect(
    page.getByText("Service courrier Guteneo", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/pingen/i)).toHaveCount(0);
  await page.clock.fastForward(10_000);
  expect(f.writes).toHaveLength(2);
});

test("a quote invalidated between approval and acceptance stays blocked", async ({
  page,
}) => {
  const f = await fixture(page);
  f.control.result = "invalid";
  await page.goto("/#/app/dispatch/postal_final");
  await page.getByRole("button", { name: /Envoyer pour/ }).click();
  await expect(
    page.getByText("Ce devis n’est plus valable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Envoyer pour/ }),
  ).toBeDisabled();
  expect(f.writes).toHaveLength(2);
});
