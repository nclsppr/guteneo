import { expect, test, type Page } from "@playwright/test";
import messages from "../../apps/web/src/locales/messages-belvedere.json" with { type: "json" };
import type {
  BelvedereOverview,
  BelvederePage,
  BelvedereWorkshop,
  BelvedereWorkshopDetail,
} from "../../packages/contracts/src/belvedere";
import { fixtureBase, fixtureResponse } from "../fixtures/belvedere";

type Locale = "fr" | "en" | "de" | "lb";
const copy = (locale: Locale, source: keyof typeof messages) =>
  locale === "fr" ? source : messages[source][{ en: 0, de: 1, lb: 2 }[locale]];

async function setup(page: Page, locale: Locale | "automatic") {
  let preferredLocale: Locale | null = locale === "automatic" ? null : locale;
  let sessionReads = 0;
  await page.addInitScript(() => localStorage.setItem("guteneo.locale", "de"));
  await page.route(`**${fixtureBase}?**`, async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      "<head>",
      `<head><meta name="guteneo-account-locale" content="${locale}">`,
    );
    await route.fulfill({ response, body: html });
  });
  await page.route("**/api/session", (route) => {
    sessionReads += 1;
    return route.fulfill({ json: { user: { preferredLocale } } });
  });
  // Source-looking business names deliberately collide with interface keys.
  await page.route(`**${fixtureBase}/api/workshops?**`, (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q") ?? "";
    url.searchParams.delete("q");
    const data = fixtureResponse(url) as BelvederePage<BelvedereWorkshop>;
    if (data.items[0]) data.items[0].name = "Synthèse";
    if (query) {
      data.items = data.items.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase()),
      );
      data.total = data.items.length;
    }
    return route.fulfill({ json: data });
  });
  await page.route(`**${fixtureBase}/api/workshops/*?**`, (route) => {
    const data = fixtureResponse(
      new URL(route.request().url()),
    ) as BelvedereWorkshopDetail;
    data.workshop.name = "Synthèse";
    return route.fulfill({ json: data });
  });
  // A contradictory public URL and browser selection cannot replace account language.
  await page.goto(`${fixtureBase}?lang=de`);
  return {
    setPreference: (next: Locale | null) => {
      preferredLocale = next;
    },
    reads: () => sessionReads,
  };
}

async function navigate(
  page: Page,
  locale: Locale,
  name: keyof typeof messages,
) {
  await expect(page.locator("#belvedere-main")).toBeVisible();
  const nav = page.getByRole("navigation", {
    name: copy(locale, "Navigation Belvédère"),
  });
  if (!(await nav.isVisible()))
    await page
      .getByRole("button", { name: copy(locale, "Ouvrir la navigation") })
      .click();
  await nav
    .getByRole("link", { name: copy(locale, name), exact: true })
    .click();
}

for (const locale of ["fr", "en", "de", "lb"] as const) {
  test(`account ${locale} localises all Belvédère views and keeps business names exact`, async ({
    page,
  }, info) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await setup(page, locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(
      page.getByRole("heading", {
        name: copy(locale, "Tout voir, à la bonne hauteur."),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: copy(locale, "Le monde de guteneo.") }),
    ).toBeVisible();
    const overview = fixtureResponse(
      new URL(`${fixtureBase}/api/overview`, "http://127.0.0.1"),
    ) as BelvedereOverview;
    const formatted = await page.evaluate(
      ({ locale, minor }) => {
        const tag =
          locale === "lb" &&
          (!Intl.NumberFormat.supportedLocalesOf(["lb-LU"]).length ||
            !Intl.DateTimeFormat.supportedLocalesOf(["lb-LU"]).length)
            ? "de-LU"
            : { fr: "fr-FR", en: "en-GB", de: "de-DE", lb: "lb-LU" }[locale];
        return {
          country: new Intl.DisplayNames([tag], { type: "region" }).of("DE")!,
          money: new Intl.NumberFormat(tag, {
            style: "currency",
            currency: "EUR",
          }).format(minor / 100),
        };
      },
      { locale, minor: overview.totals.customerConsumptionMinor },
    );
    await expect(page.locator(".bv-globe-ranking")).toContainText(
      formatted.country,
    );
    await expect(
      page.locator(".bv-stats .bv-stat").nth(1).locator("strong"),
    ).toHaveText(formatted.money);
    await page.screenshot({
      path: info.outputPath(`${locale}-overview.png`),
      animations: "disabled",
    });
    await expect(
      page.getByRole("img", {
        name: new RegExp(
          copy(
            locale,
            "Globe interactif : {0} {1}. Les mêmes données et la sélection des pays sont disponibles dans la liste.",
          ).split("{0}")[0],
        ),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: copy(locale, "Consommation"),
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: copy(locale, "Consommation"), exact: true })
      .click();
    await expect(
      page.getByRole("group", {
        name: copy(locale, "Évolution quotidienne : {0}").replace(
          "{0}",
          copy(locale, "consommation client en euros"),
        ),
      }),
    ).toBeVisible();
    await page
      .getByText(copy(locale, "Afficher les valeurs du graphique"), {
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", { name: copy(locale, "Valeurs quotidiennes") }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", {
        name: /^(Langue|Language|Sprache|Sprooch)$/,
      }),
    ).toHaveCount(0);
    for (const [name, heading] of [
      ["Ateliers", "Les ateliers, dans le détail."],
      ["Envois", "Chaque envoi, à portée de vue."],
      ["Membres", "Les personnes derrière l’activité."],
      ["Connexions", "Chaque connexion a une origine."],
      ["Finances", "Des chiffres qui disent ce qu’ils sont."],
      ["Infrastructure", "Sous le capot de guteneo."],
    ] as const) {
      await navigate(page, locale, name);
      await expect(
        page.getByRole("heading", { name: copy(locale, heading) }),
      ).toBeVisible();
      await expect(page.locator("#belvedere-main")).not.toContainText(
        copy(locale, "Les données n’ont pas pu être chargées."),
      );
      await expect(page.locator("#belvedere-main .bv-loading")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      if (name === "Membres")
        await expect(
          page.getByText("Camille Martin", { exact: true }),
        ).toBeVisible();
      if (name === "Membres" || name === "Infrastructure")
        await page.screenshot({
          path: info.outputPath(
            `${locale}-${name === "Membres" ? "members" : "infrastructure"}.png`,
          ),
          animations: "disabled",
          fullPage: true,
        });
      if (name === "Infrastructure")
        await expect(
          page.getByRole("heading", {
            name: copy(locale, "Usage facturable du compte Cloudflare"),
          }),
        ).toBeVisible();
    }
    await navigate(page, locale, "Ateliers");
    await page.getByRole("button", { name: "Synthèse", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Synthèse", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: copy(locale, "Envois de l’atelier") }),
    ).toBeVisible();
    await expect(
      page.getByText("fixture-dispatch-001", { exact: true }),
    ).toBeVisible();
    expect(failures).toEqual([]);
  });
}

test("returning to Belvédère rereads the account language and preserves inputs", async ({
  page,
}) => {
  const state = await setup(page, "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await navigate(page, "en", "Ateliers");
  await page.getByLabel(copy("en", "Rechercher un atelier")).fill("Synthèse");
  state.setPreference("lb");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  await expect(
    page.getByLabel(copy("lb", "Rechercher un atelier")),
  ).toHaveValue("Synthèse");
  await expect(
    page.getByRole("button", { name: "Synthèse", exact: true }),
  ).toBeVisible();
  const previousReads = state.reads();
  state.setPreference("de");
  await page.waitForTimeout(1100);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: false }),
    ),
  );
  expect(state.reads()).toBe(previousReads);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  expect(state.reads()).toBeGreaterThan(previousReads);
  await expect(
    page.getByLabel(copy("de", "Rechercher un atelier")),
  ).toHaveValue("Synthèse");
});

test("automatic account language and denied reads use client-owned messages", async ({
  page,
}) => {
  const browserLanguage = await page
    .evaluate(() => navigator.language)
    .catch(() => "fr-FR");
  // The runner uses fr-FR; neither stored de nor ?lang=de is an account preference.
  expect(browserLanguage).toBe("fr-FR");
  const state = await setup(page, "automatic");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  state.setPreference("en");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.route(`**${fixtureBase}/api/overview?**`, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: "FORBIDDEN", message: "Synthèse" } },
    }),
  );
  await page
    .getByRole("button", { name: copy("en", "Actualiser les données") })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    copy("en", "Votre accès à Belvédère a expiré ou n’est plus autorisé."),
  );
  await expect(page.getByRole("alert")).not.toContainText("Synthèse");
  await expect(
    page.getByRole("heading", { name: copy("en", "Le monde de guteneo.") }),
  ).toHaveCount(0);
});

test("a second return invalidates a slow old language response and queues one fresh read", async ({
  page,
}) => {
  await setup(page, "fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.waitForTimeout(1100);
  await page.unroute("**/api/session");
  let releaseOld: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let reads = 0;
  await page.route("**/api/session", async (route) => {
    reads += 1;
    if (reads === 1) {
      await held;
      return route.fulfill({ json: { user: { preferredLocale: "de" } } });
    }
    return route.fulfill({ json: { user: { preferredLocale: "en" } } });
  });
  await page.evaluate(() => {
    const changes: string[] = [];
    Reflect.set(window, "belvedereTestLangChanges", changes);
    new MutationObserver(() =>
      changes.push(document.documentElement.lang),
    ).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => reads).toBe(1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  releaseOld();
  await expect.poll(() => reads).toBe(2);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const changes = await page.evaluate(
    () => Reflect.get(window, "belvedereTestLangChanges") as string[],
  );
  expect(changes).not.toContain("de");
  expect(reads).toBe(2);
});
