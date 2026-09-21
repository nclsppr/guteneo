import { evidencePath } from "./evidence";
import { test, expect } from "@playwright/test";

const headline = "Votre assistant prépare. Guteneo transmet.";

test("homepage connects the main actions to installation and the guided example", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: headline })).toBeVisible();
  const prepare = page.locator(".hero").getByRole("link", {
    name: "Préparer mon premier envoi",
    exact: true,
  });
  await expect(prepare).toHaveAttribute("href", /#installation$/);
  await prepare.click();
  await expect(page.locator("#installation")).toBeFocused();
  const example = page.getByRole("link", {
    name: "Voir un exemple",
    exact: true,
  });
  await expect(example).toHaveAttribute("href", /#how$/);
  await example.click();
  await expect(page.locator("#how")).toBeFocused();
  await page.locator(".guided-example-next").getByRole("link").click();
  await expect(page.locator("#installation")).toBeFocused();
  const footerStart = page.locator(".footer-invitation").getByRole("link");
  await expect(footerStart).toHaveAttribute("href", /#installation$/);
  await footerStart.click();
  await expect(page.locator("#installation")).toBeFocused();
});

test("the journal footer opens and focuses homepage installation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/journal/");
  const start = page.locator(".footer-invitation").getByRole("link", {
    name: "Préparer mon premier envoi",
    exact: true,
  });
  await expect(start).toHaveAttribute("href", "/#installation");
  await start.click();
  await expect(page).toHaveURL(/\/#installation$/);
  await expect(page.getByRole("heading", { name: headline })).toHaveCount(1);
  const installation = page.locator("#installation");
  await expect(installation).toBeFocused();
  await expect
    .poll(() =>
      installation.evaluate((element) =>
        Math.abs(element.getBoundingClientRect().top),
      ),
    )
    .toBeLessThan(100);
});

test("homepage offers assistant and direct paths with pricing and Luxembourg provenance", async ({
  page,
}, info) => {
  const calls: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (/^\/(api|mcp|auth)(\/|$)/.test(new URL(r.url()).pathname))
      calls.push(r.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const installation = page.locator("#installation");
  await expect(
    installation.getByRole("link", {
      name: "Utiliser mon assistant",
      exact: true,
    }),
  ).toHaveAttribute("href", "/assistants/");
  await expect(
    installation.getByRole("link", {
      name: "Envoyer depuis Guteneo",
      exact: true,
    }),
  ).toHaveAttribute("href", "/#/app/prepare?entry=direct");
  for (const [id, name] of [
    ["chatgpt", "ChatGPT"],
    ["claude", "Claude"],
    ["grok", "Grok"],
    ["copilot", "GitHub Copilot"],
    ["microsoft365", "Microsoft 365 Copilot"],
    ["cursor", "Cursor"],
  ]) {
    await expect(
      installation.getByRole("link", { name, exact: true }),
    ).toHaveAttribute("href", `/assistants/${id}/`);
  }
  await expect(installation.locator("#host-setup")).toHaveCount(0);
  await expect(page.locator(".welcome-amount")).toHaveText("50€");
  await expect(page.locator(".welcome-copy")).toContainText(
    "Votre organisation reçoit 50 €",
  );
  await expect(page.locator(".welcome-copy")).toContainText("une seule fois");
  await expect(page.locator(".pricing-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".price-qualification")).toContainText(
    "Montants indicatifs hors taxes",
  );
  await expect(page.locator(".pricing-table")).toContainText("≈ 0,28 €");
  await expect(page.locator(".pricing-table")).toContainText("≈ 0,05–0,17 €");
  await expect(page.locator(".pricing-table")).toContainText(
    "depuis notre numéro luxembourgeois",
  );
  await expect(page.locator(".pricing-table")).toContainText(
    "estimation de 1 à 4 minutes facturées",
  );
  await expect(page.locator(".pricing-table")).toContainText("Dès 2,50 €");
  await expect(page.locator(".pricing-table")).toContainText(
    "pas un plafond garanti",
  );
  await expect(page.locator("body")).not.toContainText(
    /deux fois|2\s*[×x]|coût prestataire|marge/i,
  );
  const questions = page.locator(".faq-questions details");
  await expect(questions).toHaveCount(4);
  const firstQuestion = questions.first();
  await firstQuestion.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(firstQuestion).toHaveAttribute("open", "");
  await expect(firstQuestion.locator("p")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(firstQuestion).not.toHaveAttribute("open", "");
  const author = page.getByRole("link", { name: "Nicolas Pieper" });
  await expect(author).toHaveAttribute("href", "https://nicolaspieper.com");
  await expect(
    page.getByRole("link", { name: "Mentions légales" }),
  ).toHaveAttribute("href", "/mentions-legales/");
  await page.locator(".luxembourg-footer").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator(".luxembourg-panorama")
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBe(2172);
  const bird = page.locator(".bird-one");
  expect(
    await bird.evaluate(
      (element) => getComputedStyle(element).animationPlayState,
    ),
  ).toBe("running");
  const position = await bird.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await expect
    .poll(() => bird.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(position);
  const wings = page.locator(".bird-one .swallow-wingbeat");
  const wingFrame = await wings.evaluate(
    (element) => getComputedStyle(element).backgroundPosition,
  );
  await expect
    .poll(() =>
      wings.evaluate((element) => getComputedStyle(element).backgroundPosition),
    )
    .not.toBe(wingFrame);
  await expect(
    page.locator(".luxembourg-footer").getByRole("button"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".luxembourg-footer").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator(".luxembourg-panorama")
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBe(2172);
  await page
    .locator(".luxembourg-panorama")
    .evaluate((img) => (img as HTMLImageElement).decode());
  await page.locator(".luxembourg-footer").screenshot({
    path: await evidencePath(`homepage/footer-${info.project.name}.png`),
  });
  await page.locator(".installation-section").scrollIntoViewIfNeeded();
  await page
    .locator(".installation-section img")
    .evaluateAll(async (images) => {
      await Promise.all(
        images.map((image) => (image as HTMLImageElement).decode()),
      );
    });
  await page.locator(".installation-section").screenshot({
    path: await evidencePath(`homepage/installation-${info.project.name}.png`),
  });
  await page.locator(".pricing-section").screenshot({
    path: await evidencePath(`homepage/pricing-${info.project.name}.png`),
  });
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

test("assistant choices remain usable from narrow phones to desktop", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 768, 844, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const name of [
      "ChatGPT",
      "Claude",
      "Grok",
      "GitHub Copilot",
      "Microsoft 365 Copilot",
      "Cursor",
    ]) {
      const link = page
        .locator("#installation")
        .getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test("the example supports keyboard steps and only simulates validation", async ({
  page,
}) => {
  const serviceRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      /^\/(api|mcp|auth)(\/|$)/.test(new URL(request.url()).pathname)
    )
      serviceRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const example = page.locator("#how");
  const steps = example.getByRole("tablist", {
    name: "Étapes de la démonstration",
  });
  const verification = steps.getByRole("tab", {
    name: "Vérification",
    exact: true,
  });
  await expect(verification).toHaveAttribute("aria-selected", "true");
  await expect(example.getByRole("tabpanel")).toHaveCount(1);
  await verification.focus();
  await page.keyboard.press("ArrowLeft");
  const request = steps.getByRole("tab", { name: "Demande", exact: true });
  await expect(request).toBeFocused();
  await expect(request).toHaveAttribute("aria-selected", "true");
  await expect(
    example.getByRole("tabpanel", { name: "Demande" }),
  ).toBeVisible();
  await example.getByRole("button", { name: "Voir la vérification" }).click();
  await expect(verification).toHaveAttribute("aria-selected", "true");
  await verification.focus();
  await page.keyboard.press("End");
  const tracking = steps.getByRole("tab", { name: "Suivi", exact: true });
  await expect(tracking).toBeFocused();
  await expect(tracking).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(request).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(verification).toBeFocused();
  const channels = example.getByRole("group", {
    name: "Canal de démonstration",
  });
  await channels.getByRole("button", { name: "E-mail", exact: true }).click();
  await expect(
    channels.getByRole("button", { name: "E-mail", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await example.getByRole("button", { name: "Simuler la validation" }).click();
  await expect(tracking).toBeFocused();
  await expect(tracking).toHaveAttribute("aria-selected", "true");
  await expect(example.getByRole("tabpanel", { name: "Suivi" })).toContainText(
    "Suivi fictif",
  );
  await expect(example.getByRole("tabpanel")).toContainText(
    "Message remis au serveur",
  );
  await channels.getByRole("button", { name: "Courrier", exact: true }).click();
  await expect(tracking).toHaveAttribute("aria-selected", "true");
  await expect(example.getByRole("tabpanel")).toContainText(
    "Remise à la poste",
  );
  await expect(example.getByRole("tabpanel")).toContainText(
    "Livraison non confirmée",
  );
  await expect(example.getByRole("tabpanel")).not.toContainText(
    "Message remis au serveur",
  );
  await channels.getByRole("button", { name: "Fax", exact: true }).click();
  await expect(example.getByRole("tabpanel")).toContainText(
    "Réception technique confirmée",
  );
  await expect(example.getByRole("tabpanel")).not.toContainText(
    "Remise à la poste",
  );
  await expect(example.getByRole("tabpanel")).toHaveCount(1);
  expect(serviceRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("mobile menu reaches pricing and assistants, then returns focus on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const navigation = page.getByRole("navigation", {
    name: "Navigation mobile",
  });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "Tarifs", exact: true }).click();
  await expect(page.locator("#tarifs")).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).not.toBeVisible();
  await menu.click();
  await navigation
    .getByRole("link", { name: "Assistants", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await expect(navigation).not.toBeVisible();
  await menu.click();
  await navigation
    .getByRole("link", { name: "Assistants", exact: true })
    .click();
  await expect(page).toHaveURL(/\/assistants\/$/);
  await expect(page.locator("main h1")).toBeVisible();
  // The server-rendered heading can be visible before the stylesheet arrives.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});

test("decorative birds stop when reduced motion is requested", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  if (isMobile)
    await page.getByRole("link", { name: "Aller au contenu" }).focus();
  else await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toHaveCSS(
    "clip-path",
    "none",
  );
  await expect(
    page.locator(".luxembourg-footer").getByRole("button"),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".bird-one")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".bird-one .swallow-wingbeat")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.locator(".luxembourg-footer").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator(".luxembourg-panorama")
        .evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBe(2172);
  await page
    .locator(".luxembourg-panorama")
    .evaluate((element: HTMLImageElement) => element.decode());
  await page.locator(".luxembourg-footer").screenshot({
    path: await evidencePath(
      `homepage/footer-reduced-${isMobile ? "iphone" : "desktop"}.png`,
    ),
  });
  await page
    .locator(".footer-colophon")
    .getByRole("link", { name: "FAQ", exact: true })
    .click();
  await expect(page.locator("#faq")).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator("#faq")
        .evaluate((element) => Math.abs(element.getBoundingClientRect().top)),
    )
    .toBeLessThan(100);
});
