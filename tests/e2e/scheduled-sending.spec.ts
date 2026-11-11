import { test, expect, type Page } from "./fixtures";

const origin = "http://localhost:8787";

async function login(page: Page) {
  await page.goto("/#/app");
  await page
    .getByRole("button", { name: "Entrer dans l’espace de travail" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vue d’ensemble", exact: true }),
  ).toBeVisible();
}

async function prepareEmail(page: Page) {
  const session = (await (await page.request.get("/api/session")).json()) as {
    csrfToken: string;
  };
  const response = await page.request.post("/api/dispatches", {
    headers: {
      Origin: origin,
      "X-CSRF-Token": session.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      channel: "email",
      recipient: { email: `scheduled-${crypto.randomUUID()}@example.invalid` },
      subject: "Envoi programmé",
      html: "<p>Simulation.</p>",
      text: "Simulation.",
      ceilingMinor: 500,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

/** A datetime-local value one hour ahead, in the browser's time zone. */
function inAnHour() {
  const time = Date.now() + 60 * 60_000;
  return new Date(time - new Date(time).getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

test("an approver schedules an email for later, sees it and cancels it without sending anything", async ({
  page,
}) => {
  await login(page);
  const dispatch = await prepareEmail(page);
  await page.goto(`/#/app/dispatch/${dispatch.id}`);
  const schedule = page.getByRole("button", {
    name: "Approuver et programmer",
    exact: true,
  });
  await page.locator("details.dispatch-schedule > summary").click();
  await page.getByLabel("Date et heure", { exact: true }).fill(inAnHour());
  // The same consent as an immediate approval is required.
  await expect(schedule).toBeDisabled();
  await page.getByRole("checkbox", { name: /J’ai vérifié le contenu/ }).check();
  await expect(schedule).toBeEnabled();
  await schedule.click();
  const notice = page.getByRole("status").filter({ hasText: "Programmé pour" });
  await expect(notice).toBeVisible();
  const stored = (await (
    await page.request.get(`/api/dispatches/${dispatch.id}/schedule`)
  ).json()) as { schedule: { state: string } };
  expect(stored.schedule.state).toBe("scheduled");
  const detail = (await (
    await page.request.get(`/api/dispatches/${dispatch.id}`)
  ).json()) as { dispatch: { status: string } };
  expect(detail.dispatch.status).toBe("prepared");

  await notice
    .getByRole("button", { name: "Annuler la programmation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Annuler la programmation", exact: true })
    .last()
    .click();
  await expect(notice).toHaveCount(0);
  const cancelled = (await (
    await page.request.get(`/api/dispatches/${dispatch.id}/schedule`)
  ).json()) as { schedule: { state: string } };
  expect(cancelled.schedule.state).toBe("cancelled");
});
