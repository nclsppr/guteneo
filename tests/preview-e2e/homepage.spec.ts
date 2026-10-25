import { evidencePath } from "./evidence";
import { test, expect } from "@playwright/test";
import publicFooter from "../../packages/contracts/src/public-footer.json" with { type: "json" };

const headline = "Préparez vos documents. Choisissez leur destination.";

test("homepage connects concise product information to complete public pages", async ({
  page,
}) => {
  const serviceRequests: string[] = [];
  const mediaRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/(api|mcp|auth|oauth)(\/|$)/.test(path)) serviceRequests.push(path);
    if (/\.(mp4|webm|pdf)$/.test(path)) mediaRequests.push(path);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: headline })).toBeVisible();
  const hero = page.locator(".public-home-hero");
  await expect(
    hero.getByRole("link", { name: "Commencer", exact: true }),
  ).toHaveAttribute("href", "/getting-started/");
  await expect(
    hero.getByRole("link", { name: "Voir le fonctionnement", exact: true }),
  ).toHaveAttribute("href", "/how-it-works/");
  await expect(
    page
      .locator("#installation")
      .getByRole("link", { name: "Utiliser mon assistant", exact: true }),
  ).toHaveAttribute("href", "/assistants/");
  await expect(
    page
      .locator("#installation")
      .getByRole("link", { name: "Envoyer depuis Guteneo", exact: true }),
  ).toHaveAttribute("href", "/app/prepare?entry=direct");
  await expect(page.locator("#pricing")).toContainText("50 €");
  await expect(page.locator("#pricing")).toContainText("une seule fois");
  await expect(page.locator("#faq")).toContainText("désactivée par défaut");
  await expect(page.locator("#faq")).toContainText("date de fin");
  await expect(page.locator(".public-home-beta")).toContainText(
    "aucune vente n’est ouverte",
  );
  expect(serviceRequests).toEqual([]);
  expect(mediaRequests).toEqual([]);
  expect(errors).toEqual([]);
  await hero.getByRole("link", { name: "Commencer", exact: true }).click();
  await expect(page).toHaveURL(/\/getting-started\/$/);
  await expect(page.locator("main h1")).toHaveText("Premiers pas");
});

test("the same public footer connects product, help, resources and legal information", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/pricing/",
    "/how-it-works/",
    "/getting-started/",
    "/pdf-checks/",
    "/journal/",
    "/about/",
    "/support/",
    "/developers/",
    "/legal/",
  ]) {
    await page.goto(path);
    const footer = page.locator("footer.public-site-footer");
    await expect(footer).toHaveCount(1);
    await expect(footer.getByRole("navigation")).toHaveAccessibleName(
      publicFooter.navigationLabel.fr,
    );
    for (const group of publicFooter.groups) {
      await expect(
        footer.getByRole("heading", { name: group.labels.fr, exact: true }),
      ).toHaveCount(1);
      for (const link of group.links)
        await expect(
          footer.getByRole("link", { name: link.labels.fr, exact: true }),
        ).toHaveAttribute(
          "href",
          link.href === "https://status.guteneo.com/"
            ? `${link.href}?lang=fr`
            : link.href,
        );
    }
    await expect(
      footer.getByRole("link", { name: "Nicolas Pieper", exact: true }),
    ).toHaveAttribute("href", "https://nicolaspieper.com");
    await expect(page.locator(".luxembourg-footer")).toHaveCount(0);
  }
});

test("pricing and PDF pages preserve exact rates, credit and purchase conditions", async ({
  page,
}) => {
  await page.goto("/pricing/");
  await expect(page.locator(".welcome-amount")).toHaveText("50€");
  await expect(page.locator(".welcome-copy")).toContainText(
    "Votre organisation reçoit 50 €",
  );
  await expect(page.locator(".welcome-copy")).toContainText("une seule fois");
  await expect(page.locator(".pricing-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".price-qualification")).toContainText(
    "Montants indicatifs hors taxes",
  );
  await expect(page.locator(".pricing-table")).toContainText("≈ 1,56 €");
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
  await page.goto("/pdf-checks/");
  const pdfChecks = page.locator("#pdf-checks");
  await expect(pdfChecks.locator(".pdf-check-price")).toContainText(/0,10\s*€/);
  await expect(pdfChecks.locator(".pdf-check-price")).toContainText(
    "HT, par PDF et par profil",
  );
  await expect(pdfChecks).toContainText(
    "Sans abonnement ni renouvellement automatique.",
  );
  await expect(
    pdfChecks.getByRole("link", { name: "Découvrir les contrôles PDF" }),
  ).toHaveAttribute("href", "/app/pdf-checks");
});

test("support keeps all essential answers and keyboard disclosure", async ({
  page,
}) => {
  await page.goto("/support/#faq");
  const questions = page.locator(".faq-questions details");
  await expect(questions.locator("summary")).toHaveText([
    "Mon PDF original est-il modifié ?",
    "Puis-je partager un PDF protégé par mot de passe ?",
    "Mon assistant peut-il envoyer sans mon accord ?",
    "Comment connaître le prix de mon envoi ?",
    "Comment savoir si mon envoi est arrivé ?",
    "À quelle heure faut-il confirmer un courrier pour qu’il soit traité ?",
    "La loi européenne impose-t-elle des PDF accessibles ?",
    "Un PDF/A ou un contrôle PDF/UA suffit-il à prouver l’accessibilité ?",
  ]);
  await expect(
    page.locator(".faq-questions #postal-cutoff-faq summary"),
  ).toHaveText(
    "À quelle heure faut-il confirmer un courrier pour qu’il soit traité ?",
  );
  const firstQuestion = questions.first();
  await firstQuestion.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(firstQuestion).toHaveAttribute("open", "");
  await expect(firstQuestion.locator("p")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(firstQuestion).not.toHaveAttribute("open", "");
});

test("getting started keeps all six assistant guides usable from narrow phones to desktop", async ({
  page,
}) => {
  await page.goto("/getting-started/");
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 768, 844, 1100, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const choices = await page.locator(".start-choice > div").all();
    const firstChoice = (await choices[0].boundingBox())!;
    const secondChoice = (await choices[1].boundingBox())!;
    if (width >= 768) {
      expect(Math.abs(firstChoice.y - secondChoice.y)).toBeLessThanOrEqual(1);
      expect(secondChoice.x).toBeGreaterThan(firstChoice.x + firstChoice.width);
    } else
      expect(secondChoice.y).toBeGreaterThanOrEqual(
        firstChoice.y + firstChoice.height + 28,
      );
    for (const [id, name] of [
      ["chatgpt", "ChatGPT"],
      ["claude", "Claude"],
      ["grok", "Grok"],
      ["copilot", "GitHub Copilot"],
      ["microsoft365", "Microsoft 365 Copilot"],
      ["cursor", "Cursor"],
    ]) {
      const link = page
        .locator("#installation")
        .getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", `/assistants/${id}/`);
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
  await page.goto("/how-it-works/");
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
  await expect(page.locator(".public-header")).toHaveAttribute(
    "data-render-state",
    "interactive",
  );
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const navigation = page.getByRole("navigation", {
    name: "Navigation mobile",
  });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "Tarifs", exact: true }).click();
  await expect(page).toHaveURL(/\/pricing\/$/);
  await expect(page.locator("main h1")).toHaveText("Tarifs");
  await expect(page.locator(".public-header")).toHaveAttribute(
    "data-render-state",
    "interactive",
  );
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
  await page.waitForLoadState("load");
  await expect(page.locator("main h1")).toBeVisible();
  // The server-rendered heading can be visible before the stylesheet arrives.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});

test("legacy homepage fragments remain meaningful and restore focus", async ({
  page,
}) => {
  for (const id of [
    "how",
    "installation",
    "pricing",
    "pdf-checks",
    "faq",
    "postal-cutoff-faq",
  ]) {
    await page.goto(`/#${id}`);
    const target = page.locator(`#${id}`);
    await expect(target).toBeFocused();
    await expect(target).toBeVisible();
    const destination = target.getByRole("link").first();
    if (await destination.count())
      await expect(destination).toHaveAttribute(
        "href",
        /^\/(how-it-works|getting-started|pricing|pdf-checks|support|roles)/,
      );
  }
});

test("homepage product and help links remain in the keyboard sequence", async ({
  page,
  browserName,
}) => {
  await page.goto("/?lang=en");
  await page.locator(".skip-link").focus();
  const reached = new Set<string>();
  for (let step = 0; step < 60; step++) {
    await page.keyboard.press(
      browserName === "webkit" && process.platform === "darwin"
        ? "Alt+Tab"
        : "Tab",
    );
    const id = await page.evaluate(() => document.activeElement?.id ?? "");
    reached.add(id);
    if (reached.has("pdf-checks") && reached.has("postal-cutoff-faq")) break;
  }
  expect([...reached]).toEqual(
    expect.arrayContaining(["pdf-checks", "postal-cutoff-faq"]),
  );
});

for (const locale of ["fr", "en", "de", "lb"] as const) {
  test(`public detail pages retain language, appearance and usable layout in ${locale}`, async ({
    page,
  }, info) => {
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const path of [
        "/pricing/",
        "/getting-started/",
        "/how-it-works/",
        "/pdf-checks/",
      ]) {
        await page.goto(`${path}?lang=${locale}`);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("main h1")).toHaveCount(1);
        await expect(page.locator("main h1")).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(page.viewportSize()!.width);
        await expect(
          page.locator("footer").getByRole("link", {
            name: publicFooter.groups[0].links[1].labels[locale],
            exact: true,
          }),
        ).toBeVisible();
        if (
          (locale === "fr" && theme === "light") ||
          (locale === "de" && theme === "dark")
        ) {
          await page.locator(".public-site-footer").scrollIntoViewIfNeeded();
          await page
            .locator(".homepage-film-poster img")
            .evaluateAll(async (images) => {
              await Promise.all(
                images.map((image) => (image as HTMLImageElement).decode()),
              );
            });
          await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
          await page.screenshot({
            path: await evidencePath(
              `public-site/${info.project.name}-${path.split("/")[1]}-${locale}-${theme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
  });
  for (const theme of ["light", "dark"] as const) {
    test(`homepage is readable without overflow in ${locale} ${theme}`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(`/?lang=${locale}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator(".public-home-closing h2")).toHaveText(
        {
          fr: "Les idées voyagent.Les nôtres partent d’ici.",
          en: "Ideas travel.Ours start here.",
          de: "Ideen reisen.Unsere starten hier.",
          lb: "Iddie reesen.Eis fänken hei un.",
        }[locale],
      );
      const closingCenters = await page
        .locator(".footer-invitation-copy")
        .evaluate((copy) => {
          const center = (element: Element) => {
            const box = element.getBoundingClientRect();
            return box.x + box.width / 2;
          };
          return [
            center(copy),
            center(copy.querySelector("h2")!),
            center(copy.querySelector("a")!),
          ];
        });
      expect(
        Math.max(...closingCenters) - Math.min(...closingCenters),
      ).toBeLessThanOrEqual(1);
      await expect(page.locator(".public-home-channels li").last()).toHaveText(
        {
          fr: "Courrier postal",
          en: "Postal mail",
          de: "Briefpost",
          lb: "Bréifpost",
        }[locale],
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      const header = page.locator(".public-header");
      for (const link of await header.getByRole("link").all()) {
        if (!(await link.isVisible())) continue;
        const bounds = await link.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
          page.viewportSize()!.width + 1,
        );
      }
      const footer = page.locator(".public-site-footer");
      await expect(
        footer.locator('a[href^="https://status.guteneo.com/"]'),
      ).toHaveAttribute("href", `https://status.guteneo.com/?lang=${locale}`);
      for (const group of publicFooter.groups)
        for (const link of group.links)
          await expect(
            footer.getByRole("link", {
              name: link.labels[locale],
              exact: true,
            }),
          ).toBeVisible();
      await page.locator(".public-home-journal").scrollIntoViewIfNeeded();
      await page
        .locator(".public-home-journal img")
        .evaluateAll(async (images) => {
          await Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          );
        });
      await page.locator(".public-home-closing").scrollIntoViewIfNeeded();
      await page
        .locator(".public-home-closing img")
        .evaluateAll(async (images) => {
          await Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          );
        });
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({
        path: await evidencePath(
          `public-site/${info.project.name}-${locale}-${theme}.png`,
        ),
        fullPage: true,
      });
    });
  }
}
