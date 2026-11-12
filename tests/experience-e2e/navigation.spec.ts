import { expect, test, type Page } from "@playwright/test";
import { stationFixture } from "./fixtures";

const draft = {
  recipient: "unsaved@example.invalid",
  subject: "Un brouillon à conserver",
  message: "Ces modifications ne doivent pas disparaître sans accord.",
};

async function enterDraft(page: Page) {
  await page.locator('a[href="/counter"]:visible').first().click();
  await expect(page).toHaveURL(/\/counter$/);
  await page
    .getByLabel("E-mail du destinataire", { exact: true })
    .fill(draft.recipient);
  await page.getByLabel("Objet", { exact: true }).fill(draft.subject);
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill(draft.message);
}

async function expectDraft(page: Page) {
  await expect(page).toHaveURL(/\/counter$/);
  await expect(
    page.getByLabel("E-mail du destinataire", { exact: true }),
  ).toHaveValue(draft.recipient);
  await expect(page.getByLabel("Objet", { exact: true })).toHaveValue(
    draft.subject,
  );
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue(draft.message);
}

async function discardPrompt(
  page: Page,
  accept: boolean,
  action: () => Promise<unknown>,
) {
  const response = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(
      "Quitter ce brouillon et perdre les modifications non préparées ?",
    );
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  });
  await Promise.all([response, action()]);
}

test("an internal link preserves a dirty draft until its discard is accepted", async ({
  page,
}) => {
  const fixture = await stationFixture(page);
  await page.goto("/");
  await enterDraft(page);

  const leave = () =>
    page.locator('a[href="/departures"]:visible').first().click();
  await discardPrompt(page, false, leave);
  await expectDraft(page);
  await discardPrompt(page, true, leave);
  await expect(page).toHaveURL(/\/departures$/);
  await expect(page.getByLabel("Objet", { exact: true })).toHaveCount(0);
  expect(fixture.missing).toEqual([]);
  fixture.assertReadOnly();
});

test("canceling browser Back restores the current URL and draft before a later accepted Back", async ({
  page,
}) => {
  const fixture = await stationFixture(page);
  await page.goto("/departures");
  // Enter through the application's link so both entries belong to its history.
  await enterDraft(page);

  const back = () => page.evaluate(() => window.history.back());
  await discardPrompt(page, false, back);
  await expectDraft(page);
  await discardPrompt(page, true, back);
  await expect(page).toHaveURL(/\/departures$/);
  await expect(page.getByLabel("Objet", { exact: true })).toHaveCount(0);
  expect(fixture.missing).toEqual([]);
  fixture.assertReadOnly();
});
