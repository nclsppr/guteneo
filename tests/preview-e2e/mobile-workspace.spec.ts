import { evidencePath } from "./evidence";
import { expect, test, type Page } from "@playwright/test";

async function fits(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  for (const table of await page.locator("main .table-scroll").all()) {
    expect(
      await table.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
}

test("mobile navigation exposes every destination and returns focus to the opened page", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "iphone",
    "iPhone WebKit interaction coverage",
  );
  await page.goto("/#/app");
  const menu = page.locator(".workspace-navigation");
  const toggle = menu.locator("summary");
  const nav = page.getByRole("navigation", { name: "Navigation de l’atelier" });
  await expect(nav).toBeHidden();
  await toggle.click();
  await expect(nav).toBeVisible();
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(10);
  for (const link of await links.all()) {
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await link.boundingBox())?.width).toBeGreaterThanOrEqual(44);
  }
  await nav.getByRole("link", { name: "Facturation", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Facturation");
  await expect(nav).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Documents", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("mobile navigation preserves restored summary focus after deferred route frames", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "iphone",
    "iPhone WebKit keyboard and route-focus ordering coverage",
  );
  await page.goto("/#/app");
  const toggle = page.locator(".workspace-navigation summary");
  const nav = page.getByRole("navigation", { name: "Navigation de l’atelier" });
  await toggle.click();
  await expect(nav).toBeVisible();

  type DeferredFrames = {
    settleEffects(): Promise<void>;
    runFirst(): boolean;
    runRemaining(): void;
    restore(): void;
  };
  await page.evaluate(() => {
    const host = window as Window & {
      guteneoDeferredFocusFrames?: DeferredFrames;
    };
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = -1;
    window.requestAnimationFrame = (callback) => {
      const id = nextId--;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (!pending.delete(id)) nativeCancel(id);
    };
    const runFirst = () => {
      const first = pending.entries().next();
      if (first.done) return false;
      const [id, callback] = first.value;
      pending.delete(id);
      callback(performance.now());
      return true;
    };
    host.guteneoDeferredFocusFrames = {
      // Real frames let React commit and schedule passive effects while only
      // application callbacks remain deferred. No elapsed-time assumption.
      settleEffects: () =>
        new Promise<void>((resolve) => {
          nativeRequest(() => nativeRequest(() => resolve()));
        }),
      runFirst,
      runRemaining: () => {
        for (const id of [...pending.keys()]) {
          const callback = pending.get(id);
          pending.delete(id);
          callback?.(performance.now());
        }
      },
      restore: () => {
        window.requestAnimationFrame = nativeRequest;
        window.cancelAnimationFrame = nativeCancel;
        delete host.guteneoDeferredFocusFrames;
      },
    };
  });
  try {
    await nav.getByRole("link", { name: "Facturation", exact: true }).click();
    await expect(page.locator("main h1")).toHaveText("Facturation");
    await expect(nav).toBeHidden();
    await page.evaluate(() =>
      (
        window as Window & {
          guteneoDeferredFocusFrames?: DeferredFrames;
        }
      ).guteneoDeferredFocusFrames!.settleEffects(),
    );
    expect(
      await page.evaluate(() =>
        (
          window as Window & {
            guteneoDeferredFocusFrames?: DeferredFrames;
          }
        ).guteneoDeferredFocusFrames!.runFirst(),
      ),
    ).toBe(true);
    await expect(page.locator("main")).toBeFocused();
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.evaluate(() =>
      (
        window as Window & {
          guteneoDeferredFocusFrames?: DeferredFrames;
        }
      ).guteneoDeferredFocusFrames!.runRemaining(),
    );
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(nav).toBeVisible();
  } finally {
    await page.evaluate(() =>
      (
        window as Window & {
          guteneoDeferredFocusFrames?: DeferredFrames;
        }
      ).guteneoDeferredFocusFrames?.restore(),
    );
  }

  // Selecting the already-open destination still closes the menu and moves
  // focus into the page, even though no route-change effect will run.
  await nav.getByRole("link", { name: "Facturation", exact: true }).click();
  await expect(nav).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(nav).toBeVisible();
});

test("mobile tables retain all fields without horizontal scrolling at 320px and in landscape", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "iphone", "iPhone WebKit reflow coverage");
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of [
      "",
      "/documents",
      "/dispatches",
      "/campaigns",
      "/connection",
      "/senders",
      "/usage",
      "/billing",
      "/account",
      "/admin",
      "/prepare",
    ]) {
      await page.goto(`/#/app${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      await fits(page);
      for (const row of await page
        .locator(".responsive-table tbody tr")
        .all()) {
        for (const cell of await row
          .locator(":scope > td, :scope > th")
          .all()) {
          await expect(cell).toBeVisible();
          await expect(cell.locator(".mobile-cell-label")).toBeVisible();
        }
      }
      for (const select of await page.locator("main select").all()) {
        expect((await select.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
});

test("mobile PDF selection, download control and close retain their focus and page bounds", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "iphone",
    "iPhone WebKit PDF interaction coverage",
  );
  await page.goto("/#/app/documents");
  const document = page.locator("tbody .row-link").first();
  await document.click();
  await expect(page.locator(".document-detail h2")).toBeFocused();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".pdf-canvas-wrap")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const download = page.getByRole("button", {
    name: "Télécharger le PDF d’exemple",
  });
  expect((await download.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await fits(page);
  await page.screenshot({
    path: await evidencePath("mobile/iphone-document.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(document).toBeFocused();
  await expect(page.locator(".document-detail")).toHaveCount(0);
});

test("mobile forms expose native validation, review and errors without a provider request", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "iphone",
    "iPhone WebKit form interaction coverage",
  );
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.goto("/#/app/prepare");
  await expect(
    page.getByRole("button", { name: "Vérifier et préparer" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Choisissez un document pour pouvoir préparer cet envoi."),
  ).toBeVisible();
  await page.getByLabel("Document", { exact: true }).selectOption({ index: 1 });
  const phone = page.getByLabel("Numéro de fax international");
  await phone.fill("123");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(phone).toBeFocused();
  expect(
    await phone.evaluate(
      (input: HTMLInputElement) => input.validity.patternMismatch,
    ),
  ).toBe(true);
  await expect(phone).toHaveAttribute("aria-describedby", /help/);
  await page
    .getByRole("radio", { name: "Courrier postal", exact: true })
    .check();
  await fits(page);
  await page.getByRole("radio", { name: "E-mail", exact: true }).check();
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("mobile@example.invalid");
  await page.getByLabel("Objet", { exact: true }).fill("Relecture mobile");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Une correspondance relue sur téléphone.");
  await page.getByRole("button", { name: "Vérifier et préparer" }).click();
  await expect(
    page.getByRole("heading", { name: "Le bon à envoyer." }),
  ).toBeVisible();
  await fits(page);
  await expect(
    page.getByRole("button", { name: "Approuver et simuler l’envoi" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Approuver et simuler l’envoi" })
    .click();
  await expect(page.locator(".dispatch-reference .status")).toContainText(
    /Remis|Accepté|livré|remis/,
  );
  await page.goto("/#/app/dispatch/mobile-missing");
  await expect(page.getByRole("alert")).toBeFocused();
  await fits(page);
  expect(writes).toEqual([]);
});
