import { expect, test } from "@playwright/test";

test("real email approval requires a deliberate recipient attestation and resets for a new document", async ({
  page,
}) => {
  const writes: unknown[] = [];
  let fingerprint = "a".repeat(64);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      writes.push(route.request().postDataJSON());
    }
    const body =
      path === "/api/session"
        ? {
            organization: {
              id: "org_attestation",
              name: "Atelier de contrôle",
            },
            user: { id: "user_attestation", name: "Camille", role: "admin" },
            csrfToken: "fixture-only",
            simulation: false,
          }
        : path === "/api/capabilities"
          ? {}
          : {
              dispatch: {
                id: "dispatch_attestation",
                channel: "email",
                mode: "production",
                recipient_json: { email: "recipient@example.invalid" },
                sender_address: "sender@example.invalid",
                subject: "Document demandé",
                html: "<p>Document de contrôle sans transmission.</p>",
                text: "Document de contrôle sans transmission.",
                status: "prepared",
                estimated_minor: 1,
                ceiling_minor: 1,
                currency: "EUR",
                fingerprint,
                created_at: "2026-09-17T10:00:00Z",
                updated_at: "2026-09-17T10:00:00Z",
              },
              attempts: [],
              events: [],
              approval: null,
            };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/#/app/dispatch/dispatch_attestation");
  const approve = page.getByRole("button", { name: "Approuver cette version" });
  const recipient = page.getByRole("checkbox", {
    name: /ce destinataire a demandé/,
  });
  const content = page.getByRole("checkbox", {
    name: /J’ai vérifié le contenu/,
  });
  await expect(approve).toBeDisabled();
  await content.check();
  await expect(approve).toBeDisabled();
  await recipient.check();
  await expect(approve).toBeEnabled();
  await approve.click();
  expect(writes).toEqual([
    { fingerprint: "a".repeat(64), recipientRequested: true },
  ]);
  fingerprint = "b".repeat(64);
  await page.getByRole("button", { name: /Actualiser/ }).click();
  await expect(recipient).not.toBeChecked();
  await expect(content).not.toBeChecked();
  await expect(approve).toBeDisabled();
  expect(writes).toHaveLength(1);
});
