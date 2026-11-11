import { expect, test } from "@playwright/test";
import { stationFixture } from "./fixtures";

for (const status of [403, 404, 410]) {
  test(`a document refresh refusal (${status}) purges previously visible private rows`, async ({
    page,
  }) => {
    const fixture = await stationFixture(page, { document: true });
    await page.goto("/documents");
    await expect(
      page.getByText("Private fixture A.pdf", { exact: true }),
    ).toBeVisible();
    await fixture.revokeDocuments(status);
    await page.locator("main .panel-head > button").click();
    await expect(
      page.getByText("Private fixture A.pdf", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toBeVisible();
    // The refusal is scoped to this collection; it does not sign out the account.
    await expect(page.locator('a[href*="/auth/login"]')).toHaveCount(0);
    fixture.assertReadOnly();
  });
}

for (const status of [200, 401, 403]) {
  test(`a late previous-account response (${status}) cannot replace the new account's document list`, async ({
    page,
  }) => {
    const fixture = await stationFixture(page, { document: true });
    await page.addInitScript(
      ({ status }) => {
        const original = window.fetch.bind(window);
        const gate = {
          hold: false,
          release: undefined as (() => void) | undefined,
        };
        Reflect.set(window, "syntheticAuthorityGate", gate);
        window.fetch = async (input, init) => {
          const path = new URL(
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
            window.location.href,
          ).pathname;
          const hold = path === "/api/documents" && gate.hold;
          if (hold) gate.hold = false;
          // Model bytes already received before the old view is cancelled.
          const response = await original(
            input,
            hold ? { ...init, signal: undefined } : init,
          );
          if (!hold) return response;
          await new Promise<void>((resolve) => {
            gate.release = resolve;
          });
          return status === 200
            ? response
            : Response.json(
                {
                  error: {
                    code: "OBSOLETE_ACCOUNT_ERROR",
                    message: "Obsolete account failure",
                  },
                },
                { status },
              );
        };
      },
      { status },
    );
    await page.goto("/documents");
    await expect(
      page.getByText("Private fixture A.pdf", { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      Reflect.get(window, "syntheticAuthorityGate").hold = true;
    });
    await page.locator("main .panel-head > button").click();
    await page.waitForFunction(() =>
      Boolean(Reflect.get(window, "syntheticAuthorityGate").release),
    );
    await fixture.replaceIdentity("B");
    await expect(
      page.getByText("Private fixture B.pdf", { exact: true }),
    ).toBeVisible();
    await page.evaluate(() =>
      Reflect.get(window, "syntheticAuthorityGate").release(),
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(
      page.getByText("Private fixture A.pdf", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Private fixture B.pdf", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Obsolete account failure", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('a[href*="/auth/login"]')).toHaveCount(0);
    fixture.assertReadOnly();
  });
}
