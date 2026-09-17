import { expect, test } from "@playwright/test";

// Intercepted transport facts only. These are not AWS acceptance/rejection proofs.
test("mobile email refusals explain capacity and AWS restrictions while uncertainty forbids a duplicate", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile status copy with local API fixtures");
  const scenarios = [
    {
      code: "SES_RECIPIENT_NOT_QUALIFIED",
      status: "failed",
      phrase: "Ce destinataire n’est pas encore autorisé",
    },
    {
      code: "SES_ACCOUNT_DAILY_LIMIT",
      status: "failed",
      phrase: "capacité d’envoi d’e-mails de Guteneo est atteinte",
    },
    {
      code: "SES_ACCOUNT_RATE_LIMIT",
      status: "failed",
      phrase: "Cet envoi n’a pas été transmis",
    },
    {
      code: "SES_IDENTITY_NOT_VERIFIED",
      status: "failed",
      phrase: "les destinataires doivent aussi être vérifiés",
    },
    {
      code: "SES_CONFIGURATION_MISSING",
      status: "failed",
      phrase: "corrigé par l’équipe Guteneo",
    },
    {
      code: "SES_RESPONSE_UNKNOWN",
      status: "submission_unknown",
      phrase: "Ne recréez pas cet envoi",
    },
  ];
  let scenario = scenarios[0];
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes.push(path);
    const body =
      path === "/api/session"
        ? {
            organization: { id: "org_ui", name: "Atelier de test" },
            user: { id: "user_ui", name: "Camille", role: "admin" },
            csrfToken: "test-only",
            simulation: true,
          }
        : path === "/api/capabilities"
          ? {}
          : {
              dispatch: {
                id: "dispatch_ui",
                channel: "email",
                recipient_json: { email: "recipient@example.invalid" },
                sender_address: "sender@example.invalid",
                subject: "Courrier de contrôle",
                html: "<p>Exemple sans envoi.</p>",
                text: "Exemple sans envoi.",
                status: scenario.status,
                mode: "simulation",
                estimated_minor: 1,
                ceiling_minor: 500,
                currency: "EUR",
                fingerprint: "a".repeat(64),
                created_at: "2026-09-17T10:00:00Z",
                updated_at: "2026-09-17T10:00:00Z",
              },
              attempts: [
                {
                  id: "attempt_ui",
                  provider: "ses",
                  status: scenario.status === "failed" ? "rejected" : "unknown",
                  error_code: scenario.code,
                  created_at: "2026-09-17T10:00:00Z",
                },
              ],
              events: [],
              approval: null,
            };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  for (const current of scenarios) {
    scenario = current;
    await page.goto(`/#/app/dispatch/${current.code}`);
    await expect(page.getByRole("status")).toContainText(current.phrase);
    await expect(
      page.getByRole("button", {
        name: /Confirmer l’envoi|Approuver cette version/,
      }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (current.status === "submission_unknown")
      await expect(page.getByRole("status")).toContainText(
        "crédit reste réservé",
      );
  }
  expect(writes).toEqual([]);
});
