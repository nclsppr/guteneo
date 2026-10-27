import { expect, test, type Page } from "@playwright/test";
import type { PersonalSession } from "../../apps/web/src/personal-api";
import type { DashboardAppearance } from "../../packages/contracts/src/dashboard-appearance";
import type { SupportedLocale } from "../../packages/contracts/src/locale";

// Account writes and document reads stay inside these synthetic browser fixtures.
async function fixture(
  page: Page,
  appearance: DashboardAppearance = "v2",
  locale: SupportedLocale = "en",
) {
  let session: PersonalSession = {
    user: {
      id: "personal-appearance-a",
      name: "Synthetic reader",
      email: "personal-appearance-a@example.invalid",
      preferredLocale: locale,
      preferredDashboardAppearance: appearance,
    },
    csrfToken: "synthetic-personal-appearance",
    simulation: true,
    mfa: false,
    strongAuthentication: false,
    documentAccessAllowed: true,
    documentAccessMode: "verified_account",
    authenticationPolicyVersion: "synthetic",
    amr: [],
    acr: null,
    verifiedAccount: true,
    authenticatedAt: Date.now(),
    workspaces: [],
  };
  const reads: string[] = [];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const scripts: string[] = [];
  let rejectSave = false;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith(".js")) scripts.push(path);
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") reads.push(path);
    else writes.push({ path, body: request.postDataJSON() });
    if (path === "/api/personal/session")
      return route.fulfill({ json: session });
    if (path === "/api/personal/account" && request.method() === "PATCH") {
      if (rejectSave)
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "TEMPORARILY_UNAVAILABLE",
              message: "Synthetic profile service unavailable",
            },
          },
        });
      session = {
        ...session,
        user: { ...session.user, ...request.postDataJSON() },
      };
      return route.fulfill({ json: session });
    }
    if (path === "/api/personal/documents")
      return route.fulfill({
        json: {
          items: [
            {
              id: "synthetic-document",
              title: "Synthetic personal document",
              sender: "Synthetic workshop",
              kind: "shared",
              status: "active",
              expiresAt: "2026-12-01T00:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      });
    if (path === "/api/personal/account/sessions")
      return route.fulfill({
        json: {
          items: [
            {
              id: "synthetic-current-session",
              createdAt: "2026-10-25T08:00:00.000Z",
              expiresAt: "2026-10-25T09:00:00.000Z",
              current: true,
              mfa: false,
              authenticatedAt: Date.now(),
            },
          ],
        },
      });
    return route.fulfill({
      status: 401,
      json: { error: { code: "UNAUTHENTICATED", message: "No workshop" } },
    });
  });
  return {
    reads,
    writes,
    scripts,
    rejectSave(value: boolean) {
      rejectSave = value;
    },
    switchAccount() {
      session = {
        ...session,
        user: {
          ...session.user,
          id: "personal-appearance-b",
          name: "Second synthetic reader",
          email: "personal-appearance-b@example.invalid",
          preferredLocale: "de",
          preferredDashboardAppearance: "classic",
        },
      };
    },
  };
}

test("ordinary application entry offers workspace setup before service cards", async ({
  page,
}, info) => {
  const state = await fixture(page);
  await page.goto("/#/app");
  await expect(page).toHaveURL(/#\/app\/services\?next=%2Fapp$/);
  const heading = page.getByRole("heading", {
    name: "Create or join a workspace",
  });
  await expect(heading).toBeVisible();
  await expect(page.locator(".personal-space")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  await expect(page.getByLabel("Your workspace name")).toBeVisible();
  expect(
    await page
      .locator(".secure-document-form")
      .evaluate((form) =>
        Boolean(
          form.compareDocumentPosition(
            document.querySelector(".personal-space-service-grid")!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
  expect(state.writes).toEqual([]);
  expect(state.reads).not.toContain("/api/personal/documents");
  await info.attach("workspace-entry-loading", {
    contentType: "application/json",
    body: JSON.stringify(
      await page.evaluate(() => ({
        resources: performance.getEntriesByType("resource").length,
        transferredBytes: performance
          .getEntriesByType("resource")
          .reduce(
            (sum, entry) =>
              sum + (entry as PerformanceResourceTiming).transferSize,
            0,
          ),
        firstContentfulPaintMs:
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime ?? null,
      })),
    ),
  });
});

for (const [locale, setup, invitationLabel, review, error] of [
  [
    "en",
    "Workspace setup",
    "Workspace invitation link",
    "Review invitation",
    "Paste the complete Guteneo workspace invitation link.",
  ],
  [
    "fr",
    "Choix de l’atelier",
    "Lien d’invitation à l’atelier",
    "Examiner l’invitation",
    "Collez le lien complet d’invitation à l’atelier Guteneo.",
  ],
  [
    "de",
    "Arbeitsbereich einrichten",
    "Einladungslink zum Arbeitsbereich",
    "Einladung prüfen",
    "Fügen Sie den vollständigen Einladungslink zum Guteneo-Arbeitsbereich ein.",
  ],
  [
    "lb",
    "Atelier ariichten",
    "Invitatiounslink fir den Atelier",
    "Invitatioun iwwerpréiwen",
    "Setzt de kompletten Invitatiounslink fir de Guteneo-Atelier an.",
  ],
] as const) {
  test(`workspace join validates the invitation and retains recovery in ${locale}`, async ({
    page,
  }) => {
    const state = await fixture(page, "v2", locale);
    await page.goto("/#/app/services");
    await page.getByLabel(setup).selectOption("join");
    const input = page.getByLabel(invitationLabel);
    const token = "b".repeat(64);
    await input.fill(`https://other.example/invitation/#token=${token}`);
    await page.getByRole("button", { name: review, exact: true }).click();
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    await expect(input).toHaveValue(
      `https://other.example/invitation/#token=${token}`,
    );
    expect(state.writes).toEqual([]);
    await page.route("**/invitation/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<main>Invitation destination fixture</main>",
      }),
    );
    const destination = `${new URL(page.url()).origin}/invitation/#token=${token}`;
    await input.fill(destination);
    await page.getByRole("button", { name: review, exact: true }).click();
    await expect(page).toHaveURL(destination);
    await expect(
      page.getByText("Invitation destination fixture"),
    ).toBeVisible();
    expect(state.writes).toEqual([]);
  });
}

test("a personal account selects its saved layout without workshop reads or account bundles", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.addInitScript(() => {
    localStorage.setItem("guteneo.dashboard.appearance", "classic");
  });
  await page.goto("/#/app/my-documents");
  await expect(page.locator(".personal-space")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  await expect(
    page.getByRole("heading", { name: "Synthetic personal document" }),
  ).toBeVisible();
  await expect(
    page.locator(".personal-space-header [data-theme-toggle]"),
  ).toHaveCount(1);
  await expect(page.locator(".personal-space-header select")).toHaveCount(0);
  expect(state.reads).toEqual([
    "/api/personal/session",
    "/api/personal/documents",
  ]);
  expect(
    state.scripts.filter((path) =>
      /account-page|workspace-contacts|pdf-viewer|template-designer|document-studio/.test(
        path,
      ),
    ),
  ).toEqual([]);
  expect(state.writes).toEqual([]);
  state.switchAccount();
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".personal-space")).toHaveAttribute(
      "data-appearance",
      "classic",
      { timeout: 250 },
    );
  }).toPass();
  await expect(
    page.getByText("personal-appearance-a@example.invalid", { exact: false }),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("a late profile save cannot restore a previous personal account or its preferences", async ({
  page,
}) => {
  const state = await fixture(page, "classic");
  await page.addInitScript(() => {
    const original = fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await original(input, {
        ...init,
        ...(new URL(String(input), location.href).pathname ===
        "/api/personal/account"
          ? { signal: undefined }
          : {}),
      });
      if (
        new URL(String(input), location.href).pathname ===
        "/api/personal/account"
      )
        await new Promise<void>((resolve) => {
          Reflect.set(window, "releasePreviousPersonalSave", resolve);
        });
      return response;
    };
  });
  await page.goto("/#/app/personal-account");
  await page.locator("#dashboard-appearance").selectOption("v2");
  await page
    .locator(".personal-account-profile select")
    .nth(1)
    .selectOption("fr");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await page.waitForFunction(() =>
    Boolean(Reflect.get(window, "releasePreviousPersonalSave")),
  );
  state.switchAccount();
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.locator(".personal-account-identity-details"),
    ).toContainText("personal-appearance-b@example.invalid", { timeout: 250 });
  }).toPass();
  await page.evaluate(() => {
    Reflect.get(window, "releasePreviousPersonalSave")();
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".personal-space")).toHaveAttribute(
    "data-appearance",
    "classic",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(
    page.locator(".personal-account-identity-details"),
  ).toContainText("personal-appearance-b@example.invalid");
  await expect(
    page.getByText("personal-appearance-a@example.invalid", { exact: false }),
  ).toHaveCount(0);
});

test("an older focus session read cannot overwrite a successful profile save", async ({
  page,
}) => {
  await fixture(page, "classic");
  await page.addInitScript(() => {
    const original = fetch.bind(window);
    let sessionReads = 0;
    window.fetch = async (input, init) => {
      if (
        new URL(String(input), location.href).pathname ===
          "/api/personal/session" &&
        ++sessionReads === 2
      ) {
        const response = await original(input, { ...init, signal: undefined });
        await new Promise<void>((resolve) => {
          Reflect.set(window, "releasePreviousPersonalRead", resolve);
        });
        return response;
      }
      return original(input, init);
    };
  });
  await page.goto("/#/app/personal-account");
  await expect(page.locator(".personal-space")).toHaveAttribute(
    "data-appearance",
    "classic",
  );
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Boolean(Reflect.get(window, "releasePreviousPersonalRead")),
          ),
        { timeout: 250 },
      )
      .toBe(true);
  }).toPass();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Updated synthetic reader");
  await page.locator("#dashboard-appearance").selectOption("v2");
  await page
    .locator(".personal-account-profile select")
    .nth(1)
    .selectOption("fr");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.locator(".personal-space")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.evaluate(() => {
    Reflect.get(window, "releasePreviousPersonalRead")();
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".personal-space")).toHaveAttribute(
    "data-appearance",
    "v2",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.locator(".personal-account-identity-details"),
  ).toContainText("Updated synthetic reader");
});

test("personal layout changes persist across reload and a failed save retains the draft", async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await page.goto("/#/app/personal-account");
  const shell = page.locator(".personal-space");
  const version = page.locator("#dashboard-appearance");
  await expect(shell).toHaveAttribute("data-appearance", "v2");
  for (const appearance of ["classic", "v2"] as const) {
    await version.selectOption(appearance);
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Preferences saved.");
    await expect(shell).toHaveAttribute("data-appearance", appearance);
    await page.reload();
    await expect(shell).toHaveAttribute("data-appearance", appearance);
    await expect(version).toHaveValue(appearance);
    await page.setViewportSize({ width: 3440, height: 960 });
    expect(
      (await page.locator(".personal-account-profile > .field").boundingBox())
        ?.width,
    ).toBeLessThanOrEqual(780);
    await page.locator('a[href="#/app/my-documents"]').click();
    await expect(
      page.getByRole("heading", { name: "Synthetic personal document" }),
    ).toBeVisible();
    for (const width of [1920, 3440, 320, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const theme of ["light", "dark"]) {
        if ((await page.locator("html").getAttribute("data-theme")) !== theme)
          await page
            .locator(".personal-space-header [data-theme-toggle]")
            .click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const geometry = await shell.evaluate((element) => {
          const frame = element.getBoundingClientRect();
          const main = element.querySelector("main")!.getBoundingClientRect();
          const mainStyle = getComputedStyle(element.querySelector("main")!);
          const documents = element
            .querySelector(".secure-document-list")!
            .getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: frame.left,
            width: frame.width,
            viewport: innerWidth,
            mainRight: main.right,
            documentsRight: documents.right,
            contentRightGutter: Number.parseFloat(mainStyle.paddingRight),
            rightGutter: Number.parseFloat(style.paddingRight),
            pageWidth: document.documentElement.scrollWidth,
          };
        });
        expect(geometry.left).toBeCloseTo(0);
        expect(geometry.width).toBeCloseTo(geometry.viewport);
        expect(geometry.mainRight).toBeCloseTo(
          geometry.viewport - geometry.rightGutter,
        );
        expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.documentsRight).toBeCloseTo(
          geometry.mainRight - geometry.contentRightGutter,
        );
        if (testInfo.project.name === "chromium")
          await page.screenshot({
            path: testInfo.outputPath(
              `personal-full-width-${appearance}-${theme}-${width}.png`,
            ),
          });
      }
    }
    await page.locator('a[href="#/app/personal-account"]').click();
    await expect(version).toHaveValue(appearance);
    expect(
      (await page.locator(".personal-account-profile > .field").boundingBox())
        ?.width,
    ).toBeLessThanOrEqual(780);
  }
  expect(
    state.writes.map((write) => write.body.preferredDashboardAppearance),
  ).toEqual(["classic", "v2"]);
  state.rejectSave(true);
  await version.selectOption("classic");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic profile service unavailable",
  );
  await expect(shell).toHaveAttribute("data-appearance", "v2");
  await expect(version).toHaveValue("classic");
  expect(state.reads.every((path) => path.startsWith("/api/personal/"))).toBe(
    true,
  );
  expect(
    state.writes.every((write) => write.path === "/api/personal/account"),
  ).toBe(true);
});

test("saving name and language does not persist a temporary layout link", async ({
  page,
}) => {
  const state = await fixture(page, "classic");
  await page.goto("/?appearance=v2#/app/personal-account");
  const shell = page.locator(".personal-space");
  await expect(shell).toHaveAttribute("data-appearance", "v2");
  await expect(page.locator("#dashboard-appearance")).toHaveValue("classic");
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Updated synthetic reader");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Preferences saved.");
  expect(state.writes[0].body).not.toHaveProperty(
    "preferredDashboardAppearance",
  );
  await expect(shell).toHaveAttribute("data-appearance", "v2");
  await page
    .locator(".personal-account-profile select")
    .nth(1)
    .selectOption("de");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  expect(state.writes[1].body).toEqual({
    name: "Updated synthetic reader",
    preferredLocale: "de",
  });
  await page.locator("#dashboard-appearance").selectOption("classic");
  await page.locator(".personal-account-profile button[type=submit]").click();
  await expect(shell).toHaveAttribute("data-appearance", "classic");
  expect(new URL(page.url()).searchParams.has("appearance")).toBe(false);
  await page.reload();
  await expect(shell).toHaveAttribute("data-appearance", "classic");
});

const titles = {
  fr: {
    account: "Compte et sécurité",
    version: "Version de l’interface",
    documents: "Mes documents",
  },
  en: {
    account: "Account and security",
    version: "Interface version",
    documents: "My documents",
  },
  de: {
    account: "Konto und Sicherheit",
    version: "Version der Oberfläche",
    documents: "Meine Dokumente",
  },
  lb: {
    account: "Kont a Sécherheet",
    version: "Versioun vun der Uewerfläch",
    documents: "Meng Dokumenter",
  },
};

for (const locale of ["fr", "en", "de", "lb"] as const) {
  test(`personal V2 documents and account remain usable in ${locale}`, async ({
    page,
  }, testInfo) => {
    const state = await fixture(page, "v2", locale);
    await page.goto("/#/app/my-documents");
    await expect(
      page.getByRole("heading", {
        name: titles[locale].documents,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".personal-space")).toHaveAttribute(
      "data-appearance",
      "v2",
    );
    await expect(
      page.getByRole("heading", { name: "Synthetic personal document" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`personal-v2-documents-${locale}.png`),
      fullPage: true,
    });
    await page.locator('a[href="#/app/personal-account"]').click();
    await expect(
      page.getByRole("heading", { name: titles[locale].account, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(titles[locale].version, { exact: true }),
    ).toHaveValue("v2");
    await expect(
      page.locator(".personal-account-identity-details"),
    ).toContainText("personal-appearance-a@example.invalid");
    await expect(
      page.locator(".account-display-preferences select"),
    ).toHaveCount(3);
    for (const select of await page
      .locator(".account-display-preferences select")
      .all()) {
      expect((await select.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const style = await select.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          appearance: computed.appearance,
          backgroundImage: computed.backgroundImage,
          endPadding: Number.parseFloat(computed.paddingInlineEnd),
        };
      });
      expect(style.appearance).toBe("none");
      expect(style.backgroundImage).not.toBe("none");
      expect(style.endPadding).toBeGreaterThanOrEqual(40);
    }
    const theme = page.locator(
      ".account-display-preferences .theme-control select",
    );
    expect(
      await theme.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingInlineStart),
      ),
    ).toBeGreaterThanOrEqual(38);
    await theme.selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`personal-v2-account-dark-${locale}.png`),
      fullPage: true,
    });
    await theme.selectOption("system");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-preference",
      "system",
    );
    for (const anchor of await page
      .locator(".personal-space-header nav a")
      .all()) {
      expect((await anchor.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    expect(state.writes).toEqual([]);
    expect(state.reads.every((path) => path.startsWith("/api/personal/"))).toBe(
      true,
    );
  });
}
