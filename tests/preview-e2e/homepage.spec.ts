import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("homepage explains installation, welcome credit, pricing and Luxembourg provenance", async ({
  page,
  request,
}, info) => {
  const calls: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (/^\/(api|mcp|auth)(\/|$)/.test(new URL(r.url()).pathname))
      calls.push(r.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          document.documentElement.dataset.copied = value;
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".assistant-brandstrip li")).toHaveCount(5);
  await expect(page.locator(".assistant-brandstrip")).toContainText("Grok");
  await expect(
    page.locator(".assistant-brandstrip li").filter({ hasText: "Grok" }),
  ).toContainText("Intégration non disponible");
  for (const logo of await page.locator(".assistant-brandstrip img").all()) {
    await logo.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        logo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  await expect(
    page.getByRole("heading", {
      name: "Votre assistant. Votre correspondance.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await expect(page.locator("#host-instructions")).toContainText(
    "propriétaire de l’espace",
  );
  await expect(
    page.getByRole("button", { name: "Connecter à Claude", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Identifiant public à coller dans Claude"),
  ).toHaveValue("IhJieRsvZBAnl1uJO125X2SPoIHxT8ed");
  await page
    .getByRole("button", { name: "Copier l’identifiant", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    "IhJieRsvZBAnl1uJO125X2SPoIHxT8ed",
  );
  await expect(
    page.locator(".claude-connect").getByRole("status"),
  ).toContainText("Identifiant copié.");
  await expect(page.locator("#host-instructions")).toContainText(
    "Client secret » vide",
  );
  await page
    .getByRole("button", { name: "Copier l’adresse", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    "https://guteneo.com/mcp",
  );
  await page.getByRole("button", { name: "Cursor", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Télécharger la configuration Cursor" }),
  ).toBeVisible();
  const config = await request.get("/guides/cursor-mcp.json");
  expect(await config.json()).toEqual({
    mcpServers: { guteneo: { url: "https://guteneo.com/mcp" } },
  });
  await page
    .getByRole("button", { name: "GitHub Copilot", exact: true })
    .click();
  await expect(page.locator("#host-instructions")).toContainText(
    "Microsoft Copilot grand public n’est pas couvert",
  );
  await expect(page.locator("#host-instructions")).toContainText(
    "restent à qualifier",
  );
  await expect(
    page.getByRole("link", { name: "Configuration VS Code", exact: true }),
  ).toHaveAttribute("href", "/guides/copilot-vscode-mcp.json");
  await expect(
    page.getByRole("link", { name: "Configuration Copilot CLI", exact: true }),
  ).toHaveAttribute("href", "/guides/copilot-cli-mcp.json");
  expect(
    await (await request.get("/guides/copilot-vscode-mcp.json")).json(),
  ).toEqual({
    servers: { guteneo: { type: "http", url: "https://guteneo.com/mcp" } },
  });
  expect(
    await (await request.get("/guides/copilot-cli-mcp.json")).json(),
  ).toEqual({
    mcpServers: {
      guteneo: { type: "http", url: "https://guteneo.com/mcp", tools: ["*"] },
    },
  });
  await mkdir("reports/screenshots/homepage", { recursive: true });
  await page.locator(".installation-section").screenshot({
    path: `reports/screenshots/homepage/copilot-${info.project.name}.png`,
  });
  const guide = await request.get("/guides/installer-guteneo.md");
  expect(guide.status()).toBe(200);
  const guideText = await guide.text();
  expect(guideText).toContain("Ce message ne peut pas installer un connecteur");
  expect(guideText).toContain("IhJieRsvZBAnl1uJO125X2SPoIHxT8ed");
  expect(guideText).toContain(
    "modal=add-custom-connector&connectorName=Guteneo&connectorUrl=https%3A%2F%2Fguteneo.com%2Fmcp",
  );
  expect(guideText).not.toMatch(/deux fois|2\s*[×x]|coût prestataire|marge/i);
  await page.getByRole("button", { name: "Copier ce premier message" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    /N’effectue aucun envoi sans cette validation/,
  );
  await expect(page.locator(".welcome-amount")).toHaveText("50€");
  await expect(page.locator(".welcome-copy")).toContainText(
    "À l’ouverture du service",
  );
  await expect(
    page.getByRole("button", { name: "Ajouter du crédit" }),
  ).toBeDisabled();
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
  await page
    .getByText("Que se passe-t-il quand mon crédit est épuisé ?", {
      exact: true,
    })
    .click();
  await expect(page.locator(".faq-questions details[open]")).toContainText(
    "ni débit automatique ni solde négatif",
  );
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
  await mkdir("reports/screenshots/homepage", { recursive: true });
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
    path: `reports/screenshots/homepage/footer-${info.project.name}.png`,
  });
  await page.getByRole("button", { name: "ChatGPT", exact: true }).click();
  await page.locator(".installation-section").screenshot({
    path: `reports/screenshots/homepage/installation-${info.project.name}.png`,
  });
  await page.locator(".pricing-section").screenshot({
    path: `reports/screenshots/homepage/pricing-${info.project.name}.png`,
  });
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

test("Claude installation keeps a selectable fallback when clipboard access fails", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (/^\/(api|mcp|auth)(\/|$)/.test(new URL(request.url()).pathname))
      calls.push(request.url());
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Clipboard unavailable");
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await page
    .getByRole("button", { name: "Copier l’identifiant", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "La copie automatique est indisponible" }),
  ).toBeVisible();
  const client = page.getByLabel("Identifiant public à coller dans Claude");
  await client.focus();
  await expect(client).toBeFocused();
  expect(
    await client.evaluate((input: HTMLInputElement) =>
      input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0),
    ),
  ).toBe("IhJieRsvZBAnl1uJO125X2SPoIHxT8ed");
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("button", { name: "Connecter à Claude", exact: true }),
    ).toBeDisabled();
    expect(
      (await page
        .getByRole("button", { name: "Copier l’identifiant", exact: true })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
  }
  expect(calls).toEqual([]);
});

test("Copilot setup remains usable from narrow phones to desktop", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "GitHub Copilot", exact: true })
    .click();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 768, 844, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const button of await page.locator(".host-selector button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(
      page.getByRole("button", { name: "GitHub Copilot", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("link", {
        name: "Configuration Copilot CLI",
        exact: true,
      }),
    ).toBeVisible();
  }
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
    path: `reports/screenshots/homepage/footer-reduced-${isMobile ? "iphone" : "desktop"}.png`,
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
