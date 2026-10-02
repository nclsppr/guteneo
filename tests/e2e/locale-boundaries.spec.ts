import { expect, test, type Page } from "@playwright/test";
import type { SupportedLocale } from "../../packages/contracts/src/locale";
import publicSite from "../../packages/contracts/src/public-site.json" with { type: "json" };

test.use({ locale: "en-GB" });

type AccountFixture = {
  name: string;
  preferredLocale: SupportedLocale | null;
};

async function mockAccount(
  page: Page,
  account: AccountFixture,
  options: {
    failSave?: () => boolean;
    beforeSession?: () => Promise<void>;
  } = {},
) {
  const updates: Record<string, unknown>[] = [];
  const writes: string[] = [];
  let signedIn = true;
  const session = () => ({
    user: {
      id: "locale-boundary-user",
      role: "member",
      name: account.name,
      preferredLocale: account.preferredLocale,
    },
    organization: { id: "locale-boundary-org", name: "Courrier postal" },
    csrfToken: "mock-csrf",
    simulation: true,
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!["GET", "HEAD"].includes(request.method()))
      writes.push(`${request.method()} ${path}`);
    if (path === "/api/session") {
      await options.beforeSession?.();
      return route.fulfill(
        signedIn
          ? { json: session() }
          : {
              status: 401,
              json: { error: { code: "AUTHENTICATION_REQUIRED" } },
            },
      );
    }
    if (path === "/api/account" && request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      updates.push(body);
      if (options.failSave?.())
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "TEMPORARY_ERROR",
              message: "Service temporarily unavailable",
            },
          },
        });
      if (typeof body.userName === "string") account.name = body.userName;
      if (typeof body.preferredLocale === "string")
        account.preferredLocale = body.preferredLocale as SupportedLocale;
      return route.fulfill({ json: session() });
    }
    if (path === "/api/logout") {
      signedIn = false;
      return route.fulfill({ json: { signedOut: true } });
    }
    if (path === "/api/account/sessions")
      return route.fulfill({ json: { items: [], hasMore: false } });
    if (path === "/api/account/expert-approval")
      return route.fulfill({ json: { connections: [], canManage: false } });
    if (path === "/api/documents")
      return route.fulfill({
        json: {
          items: [
            {
              id: "document-locale-fixture",
              name: "Préparer le courrier",
              status: "ready",
              source: "import",
              pages: 1,
              size: 2048,
              sha256: "a".repeat(64),
              created_at: "2026-09-22T09:00:00Z",
            },
          ],
          nextCursor: null,
        },
      });
    if (path === "/api/capabilities")
      return route.fulfill({
        json: {
          scanner: "disabled_in_local_simulation",
          registration: { enabled: true },
        },
      });
    return route.fulfill({ json: {} });
  });
  return { updates, writes };
}

async function guestLanguage(page: Page, locale: SupportedLocale) {
  await page.addInitScript((value) => {
    if (localStorage.getItem("guteneo.locale") === null)
      localStorage.setItem("guteneo.locale", value);
  }, locale);
}

test("legacy name-only saves leave the language unset and preserve customer names", async ({
  page,
}) => {
  const account: AccountFixture = { name: "PDF prêt", preferredLocale: null };
  const { updates, writes } = await mockAccount(page, account);
  await page.goto("/#/app/account");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#account-name")).toHaveValue("PDF prêt");
  await expect(page.locator("#account-organization")).toHaveValue(
    "Courrier postal",
  );
  await expect(page.locator(".language-preference select")).toHaveValue("");
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  await expect(save).toBeDisabled();
  await page.locator("#account-name").fill("Enregistrer les modifications");
  await save.click();
  await expect(save).toBeDisabled();
  expect(updates).toEqual([{ userName: "Enregistrer les modifications" }]);
  expect(account.preferredLocale).toBeNull();
  await page.reload();
  await expect(page.locator("#account-name")).toHaveValue(
    "Enregistrer les modifications",
  );
  await page.evaluate(() => {
    window.location.hash = "/app/documents";
  });
  const document = page.locator(".row-link.text-button");
  await expect(document).toContainText("Préparer le courrier");
  await expect(document).not.toContainText("Prepare the letter");
  expect(writes).toEqual(["PATCH /api/account"]);
});

test("an unset account preference can explicitly save the current browser language", async ({
  page,
}) => {
  const account: AccountFixture = { name: "Camille", preferredLocale: null };
  const { updates, writes } = await mockAccount(page, account);
  await page.goto("/#/app/account");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const picker = page.getByLabel("Preferred language", { exact: true });
  const placeholder = picker.locator('option[value=""]');
  await expect(picker).toHaveValue("");
  await expect(placeholder).toHaveText("Choose a language");
  await expect(placeholder).toBeDisabled();
  const interfacePicker = page.locator(
    '.workspace-language select[name="language"]',
  );
  await expect(interfacePicker).toHaveValue("en");
  await expect(interfacePicker.locator('option[value=""]')).toHaveCount(0);
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  await expect(save).toBeDisabled();
  await picker.selectOption("en");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled();
  expect(updates).toEqual([{ userName: "Camille", preferredLocale: "en" }]);
  expect(account.preferredLocale).toBe("en");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBeNull();
  await page.reload();
  await expect(picker).toHaveValue("en");
  await expect(placeholder).toHaveCount(0);
  expect(writes).toEqual(["PATCH /api/account"]);
});

test("a failed language save keeps the server preference and supports an explicit retry", async ({
  page,
}) => {
  let failSave = true;
  const account: AccountFixture = { name: "Camille", preferredLocale: "en" };
  await guestLanguage(page, "lb");
  const { updates, writes } = await mockAccount(page, account, {
    failSave: () => failSave,
  });
  await page.goto("/#/app/account");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.locator(".language-preference select").selectOption("de");
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  await save.click();
  await expect(page.locator("#account-form-error [role=alert]")).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".language-preference select")).toHaveValue("de");
  expect(account.preferredLocale).toBe("en");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBe("lb");
  failSave = false;
  await save.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  expect(account.preferredLocale).toBe("de");
  expect(updates).toEqual([
    { userName: "Camille", preferredLocale: "de" },
    { userName: "Camille", preferredLocale: "de" },
  ]);
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBe("lb");
  expect(writes).toEqual(["PATCH /api/account", "PATCH /api/account"]);
});

test("a late initial session cannot replace a language just chosen on the homepage", async ({
  page,
}) => {
  let releaseSession!: () => void;
  const sessionGate = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  let sessionRequests = 0;
  await mockAccount(
    page,
    { name: "Late account", preferredLocale: "lb" },
    {
      beforeSession: async () => {
        sessionRequests += 1;
        await sessionGate;
      },
    },
  );
  try {
    await page.goto("/");
    const picker = page.locator('header select[name="language"]');
    await expect(picker).toHaveValue("en");
    await expect.poll(() => sessionRequests).toBeGreaterThan(0);
    await picker.selectOption("de");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    releaseSession();
    await page.evaluate(() => {
      window.location.hash = "/app/account";
    });
    await expect(page.locator("#account-name")).toHaveValue("Late account");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    expect(
      await page.evaluate(() => localStorage.getItem("guteneo.locale")),
    ).toBe("de");
  } finally {
    releaseSession();
  }
});

test("the connected account language never replaces the saved anonymous language", async ({
  page,
}) => {
  await guestLanguage(page, "lb");
  const { writes } = await mockAccount(page, {
    name: "Personal account",
    preferredLocale: "en",
  });
  await page.goto("/#/app/account");
  await expect(page.locator("#account-name")).toHaveValue("Personal account");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBe("lb");
  const navigation = page.locator(".workspace-navigation");
  const summary = navigation.locator("summary");
  if (await summary.isVisible()) {
    await summary.click();
    await navigation
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
  } else {
    await page
      .locator(".sidebar-footer")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  expect(
    await page.evaluate(() => localStorage.getItem("guteneo.locale")),
  ).toBe("lb");
  expect(writes).toEqual(["POST /api/logout"]);
});

test("translated public and account navigation keep the literal ARIA page value", async ({
  page,
}) => {
  await mockAccount(page, { name: "Camille", preferredLocale: null });
  await page.goto("/assistants/");
  const publicLink = page.locator('header nav a[href="/assistants/"]');
  for (const locale of ["en", "de", "lb"]) {
    await page.locator('header select[name="language"]').selectOption(locale);
    await expect(publicLink).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/#/app/account");
  await expect(page.locator("#account-name")).toHaveValue("Camille");
  const accountLink = page.locator('.sidebar a[href="#/app/account"]');
  for (const locale of ["en", "de", "lb"]) {
    await page
      .locator('.workspace-language select[name="language"]')
      .selectOption(locale);
    await expect(accountLink).toHaveAttribute("aria-current", "page");
  }
});

test("saved account language hydrates every standalone public route without replacing the guest choice", async ({
  page,
}) => {
  await guestLanguage(page, "lb");
  let sessionRequests = 0;
  await mockAccount(
    page,
    { name: "Public account", preferredLocale: "en" },
    {
      beforeSession: () => {
        sessionRequests += 1;
        return Promise.resolve();
      },
    },
  );
  const paths = [...publicSite.paths, "/#/app/account"];
  for (const [index, path] of paths.entries()) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect.poll(() => sessionRequests).toBe(index + 1);
    expect(
      await page.evaluate(() => localStorage.getItem("guteneo.locale")),
    ).toBe("lb");
  }
  await expect(page.locator("#account-name")).toHaveValue("Public account");
});

test("saving a name preserves the temporary interface language and the saved account preference", async ({
  page,
}) => {
  const account: AccountFixture = { name: "Camille", preferredLocale: "en" };
  const { updates } = await mockAccount(page, account);
  await page.goto("/#/app/account");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page
    .locator('.workspace-language select[name="language"]')
    .selectOption("de");
  await page.locator("#account-name").fill("Camille Example");
  await page.locator('form.form-panel button[type="submit"]').click();
  await expect(
    page.locator('form.form-panel button[type="submit"]'),
  ).toBeDisabled();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator(".language-preference select")).toHaveValue("en");
  expect(updates).toEqual([{ userName: "Camille Example" }]);
  expect(account.preferredLocale).toBe("en");
});
