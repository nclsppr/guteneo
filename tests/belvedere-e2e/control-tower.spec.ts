import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixtureBase, fixtureResponse } from "../fixtures/belvedere";

async function navigate(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Navigation Belvédère" });
  if (!(await nav.isVisible()))
    await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  await nav.getByRole("link", { name, exact: true }).click();
}
async function ready(page: Page) {
  await page.goto(fixtureBase);
  await expect(
    page.getByRole("heading", { name: "Synthèse", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Démonstration locale — données fictives, aucun service réel.",
    ),
  ).toBeVisible();
}

test("a root-host shell keeps navigation and read-only data on its own origin", async ({
  page,
}, info) => {
  const failures: string[] = [];
  const reads: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("http://127.0.0.1:8794/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      `name="guteneo-belvedere" content="${fixtureBase}"`,
      'name="guteneo-belvedere" content=""',
    );
    await route.fulfill({ response, body });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    reads.push(url.pathname);
    url.pathname = fixtureBase + url.pathname;
    const data = fixtureResponse(url);
    await route.fulfill({ status: data ? 200 : 404, json: data ?? {} });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Synthèse", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Retour à guteneo", includeHidden: true }),
  ).toHaveAttribute("href", "https://guteneo.com/");
  await navigate(page, "Finances");
  await expect(
    page.getByRole("heading", {
      name: "Finances",
    }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(reads).toContain("/api/overview");
  expect(reads).toContain("/api/finance");
  expect(failures).toEqual([]);
  await mkdir("/tmp/guteneo-belvedere-host", { recursive: true });
  await page.screenshot({
    path: `/tmp/guteneo-belvedere-host/root-${info.project.name}.png`,
    fullPage: true,
  });
});

test("overview filters, accessible chart and every navigation destination work", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await ready(page);
  await page.getByRole("button", { name: "Consommation", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Consommation", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const period = page.waitForRequest(
    (r) =>
      r.url().includes("/api/overview?") &&
      new URL(r.url()).searchParams.get("mode") === "simulation",
  );
  await page
    .getByRole("combobox", { name: "Données", exact: true })
    .selectOption({ value: "simulation" });
  await period;
  await page
    .getByRole("combobox", { name: "Période", exact: true })
    .selectOption({ value: "7" });
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toBeVisible();
  for (const [name, heading] of [
    ["Espaces de travail", "Espaces de travail"],
    ["Envois", "Envois"],
    ["Membres", "Membres"],
    ["Connexions", "Connexions"],
    ["Finances", "Finances"],
    ["Infrastructure", "Infrastructure"],
  ]) {
    await navigate(page, name);
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("#belvedere-main")).not.toContainText(
      "Les données n’ont pas pu être chargées.",
    );
  }
  expect(failures).toEqual([]);
});

test("workshop search, detail and paginated consumption keep recipient content private", async ({
  page,
}) => {
  await ready(page);
  await navigate(page, "Espaces de travail");
  await page.getByLabel("Rechercher un espace de travail").fill("Rives");
  await expect(
    page.getByRole("button", { name: "Atelier des Rives", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Atelier des Rives", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Atelier des Rives", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Envois de l’espace de travail" }),
  ).toBeVisible();
  await expect(
    page.getByText("Non vérifié", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Page suivante" }).first().click();
  await expect(
    page.getByRole("button", { name: "Page précédente" }).first(),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Atelier des Rives", exact: true }),
  ).toBeVisible();
});

test("shared column sorting reorders only the current server page without new reads", async ({
  page,
}) => {
  const reads: string[] = [];
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/")) return;
    if (["GET", "HEAD"].includes(request.method())) reads.push(request.url());
    else writes.push(request.url());
  });
  await ready(page);
  await navigate(page, "Espaces de travail");
  const table = page.locator(".bv-data-table").first();
  const names = table.locator('tbody [data-column="workshop"] .bv-table-link');
  await expect(names).toHaveCount(6);
  await expect(table.getByRole("searchbox")).toHaveCount(0);
  await expect(table.locator(".data-table__pagination")).toHaveCount(0);
  const expected = (await names.allTextContents()).sort((a, b) =>
    a.localeCompare(b, "fr-FR", { numeric: true, sensitivity: "base" }),
  );
  const readsBefore = [...reads];
  const mobileSort = table.locator(".data-table__mobile-sort");
  const header = table.locator("thead th").first();
  if (await mobileSort.isVisible()) {
    await mobileSort.getByRole("combobox").selectOption("workshop");
  } else {
    await header.getByRole("button").click();
  }
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(names).toHaveText(expected);
  if (await mobileSort.isVisible()) {
    await mobileSort.getByRole("button").click();
  } else {
    await header.getByRole("button").click();
  }
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(names).toHaveText([...expected].reverse());
  expect(reads).toEqual(readsBefore);
  expect(writes).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("exact provider decimals sort numerically and retain their source text", async ({
  page,
}) => {
  await page.route("**/api/infrastructure/billing", (route) => {
    const data = fixtureResponse(new URL(route.request().url())) as Record<
      string,
      unknown
    >;
    return route.fulfill({
      json: {
        ...data,
        status: "ok",
        lineCount: 3,
        totals: [
          {
            currency: "USD",
            amountMinor: 110,
            reportedAmountDecimal: "1.10000000000000001",
          },
        ],
        services: ["0.9", "0.10000000000000001", "0.10"].map(
          (value, index) => ({
            service: "Synthetic service " + index,
            currency: "USD",
            amountMinor: index === 0 ? 90 : 10,
            reportedAmountDecimal: value,
            chargePeriods: 1,
          }),
        ),
      },
    });
  });
  const reads: string[] = [];
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/")) return;
    if (["GET", "HEAD"].includes(request.method())) reads.push(request.url());
    else writes.push(request.url());
  });
  await ready(page);
  await navigate(page, "Infrastructure");
  const table = page.locator(".bv-data-table").first();
  const values = table.locator('tbody [data-column="source"] code');
  await expect(values).toHaveText([
    "0.9 USD",
    "0.10000000000000001 USD",
    "0.10 USD",
  ]);
  const readsBefore = [...reads];
  const mobileSort = table.locator(".data-table__mobile-sort");
  const header = table.locator("thead th").nth(3);
  if (await mobileSort.isVisible()) {
    await mobileSort.getByRole("combobox").selectOption("source");
  } else {
    await header.getByRole("button").click();
  }
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(values).toHaveText([
    "0.10 USD",
    "0.10000000000000001 USD",
    "0.9 USD",
  ]);
  if (await mobileSort.isVisible()) {
    await mobileSort.getByRole("button").click();
  } else {
    await header.getByRole("button").click();
  }
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(values).toHaveText([
    "0.9 USD",
    "0.10000000000000001 USD",
    "0.10 USD",
  ]);
  await table.getByRole("searchbox").fill("0.10000000000000001");
  await expect(values).toHaveText(["0.10000000000000001 USD"]);
  expect(reads).toEqual(readsBefore);
  expect(writes).toEqual([]);
});

test("one appearance icon follows the system and preserves filters without business reads or writes", async ({
  page,
}) => {
  const reads: string[] = [];
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/")) return;
    if (["GET", "HEAD"].includes(request.method())) reads.push(request.url());
    else writes.push(request.url());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Reflect.set(window, "belvedereThemeChanges", 0);
    window.addEventListener("guteneo-theme-change", () => {
      Reflect.set(
        window,
        "belvedereThemeChanges",
        Number(Reflect.get(window, "belvedereThemeChanges")) + 1,
      );
    });
  });
  await ready(page);
  await navigate(page, "Espaces de travail");
  const search = page.getByLabel("Rechercher un espace de travail");
  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `${fixtureBase}/api/workshops` &&
      url.searchParams.get("q") === "Rives"
    );
  });
  await search.fill("Rives");
  expect((await searchResponse).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "Atelier des Rives", exact: true }),
  ).toBeVisible();
  const root = page.locator("html");
  const button = page.locator("button[data-theme-toggle]");
  await expect(button).toHaveCount(1);
  await expect(button).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Apparence", exact: true }),
  ).toHaveCount(0);
  await expect(root).toHaveAttribute("data-theme-preference", "system");
  await expect(root).toHaveAttribute("data-theme", "dark");
  const size = await button.boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(44);
  expect(size?.height).toBeGreaterThanOrEqual(44);
  const readsBefore = [...reads];
  const changesBefore = await page.evaluate(() =>
    Number(Reflect.get(window, "belvedereThemeChanges")),
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("data-theme-preference", "system");
  await button.click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(button).toHaveAccessibleName("Passer au mode clair");
  await button.press("Enter");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(button).toHaveAccessibleName("Passer au mode sombre");
  expect(
    await page.evaluate(() =>
      Number(Reflect.get(window, "belvedereThemeChanges")),
    ),
  ).toBe(changesBefore + 3);
  await expect(search).toHaveValue("Rives");
  expect(reads).toEqual(readsBefore);
  expect(writes).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Espaces de travail", exact: true }),
  ).toBeVisible();
  await expect(root).toHaveAttribute("data-theme-preference", "light");
  await expect(root).toHaveAttribute("data-theme", "light");
  expect(writes).toEqual([]);
});

test("members search and geography distinguish unknown country from a fabricated value", async ({
  page,
}) => {
  await ready(page);
  await navigate(page, "Membres");
  await page.getByLabel("Rechercher un membre").fill("Camille");
  await expect(
    page.getByRole("region", { name: "Membres et accès" }),
  ).toContainText("Camille Martin");
  await expect(
    page.getByRole("region", { name: "Membres et accès" }),
  ).not.toContainText("Alex Bernard");
  await page.getByLabel("Rechercher un membre").fill("Personne absente");
  await expect(
    page.getByRole("heading", { name: "Aucun membre ne correspond." }),
  ).toBeVisible();
  await navigate(page, "Connexions");
  await expect(page.getByText("Pays non renseigné").first()).toBeVisible();
  await page.getByRole("button", { name: /Historique des connexions/ }).click();
  await expect(
    page.getByRole("region", { name: "Historique des connexions" }),
  ).toContainText("Luxembourg");
});

test("expired or failed reads remove previous data and allow recovery", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/overview?**", (route) =>
    route.fulfill({ status: 403, json: { error: { code: "FORBIDDEN" } } }),
  );
  await page.getByRole("button", { name: "Actualiser les données" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Votre accès doit être vérifié.",
  );
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Vérifier mon accès/ }),
  ).toHaveAttribute("href", fixtureBase);
  await page.unroute("**/api/overview?**");
  await page.getByRole("link", { name: /Vérifier mon accès/ }).click();
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toBeVisible();
  await page.route("**/api/overview?**", (route) =>
    route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } }),
  );
  await page.getByRole("button", { name: "Actualiser les données" }).click();
  await expect(
    page.getByRole("button", { name: "Réessayer", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/overview?**");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toBeVisible();
});

test("returning to a restored tab revalidates access and removes sensitive data", async ({
  page,
}) => {
  await ready(page);
  let reads = 0;
  await page.route("**/api/overview?**", (route) => {
    reads += 1;
    return route.fulfill({
      status: 403,
      json: { error: { code: "FORBIDDEN" } },
    });
  });
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("alert")).toContainText(
    "Votre accès doit être vérifié.",
  );
  await expect(
    page.getByRole("heading", { name: "Le monde de guteneo." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Vérifier mon accès/ }),
  ).toHaveAttribute("href", fixtureBase);
  expect(reads).toBe(1);
});

test("empty data remains explicit without invented income or activity", async ({
  page,
}) => {
  await page.route("**/api/overview?**", (route) => {
    const source = fixtureResponse(new URL(route.request().url())) as Record<
      string,
      unknown
    >;
    return route.fulfill({
      json: {
        ...source,
        totals: Object.fromEntries(
          Object.keys(source.totals as object).map((k) => [k, 0]),
        ),
        trend: [],
        distributionCountries: [],
        statuses: [],
        countries: [],
        channels: [],
        incidents: [],
      },
    });
  });
  await page.goto(fixtureBase);
  await expect(
    page.getByRole("heading", { name: "Synthèse", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("#belvedere-main")).not.toContainText("NaN");
  await navigate(page, "Finances");
  await expect(page.getByText("Non calculable", { exact: true })).toBeVisible();
  await expect(page.getByText("Non configurés", { exact: true })).toBeVisible();
});

test("finance separates retained legacy PDF plan consumption from delivery channels and counts", async ({
  page,
}) => {
  await ready(page);
  await navigate(page, "Finances");
  await expect(
    page.getByRole("term").filter({ hasText: /^Anciens forfaits PDF$/ }),
  ).toBeVisible();
  await expect(page.locator("#belvedere-main")).toContainText(
    "1 débit d’abonnement comptabilisé sur la période, inclus dans la consommation totale. Il n’est pas compté comme un envoi.",
  );
  const monthly = page.getByRole("region", { name: "Consommation mensuelle" });
  await expect(
    monthly.getByRole("columnheader", {
      name: "Anciens forfaits PDF",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    monthly.getByRole("columnheader", { name: "Envois débités", exact: true }),
  ).toBeVisible();
  await expect(
    monthly.getByRole("columnheader", {
      name: "Consommation totale",
      exact: true,
    }),
  ).toBeVisible();
});

test("capture design evidence across the operational views without page overflow", async ({
  page,
}, info) => {
  await ready(page);
  const dir =
    process.env.GUTENEO_BELVEDERE_EVIDENCE || "test-results/belvedere/design";
  await mkdir(dir, { recursive: true });
  for (const [name, id] of [
    ["Synthèse", "overview"],
    ["Espaces de travail", "workspaces"],
    ["Envois", "jobs"],
    ["Membres", "members"],
    ["Connexions", "connections"],
    ["Finances", "finance"],
    ["Infrastructure", "infrastructure"],
  ]) {
    if (id !== "overview") await navigate(page, name);
    await expect(
      page.getByRole("status", { name: "Chargement des données" }),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${dir}/${info.project.name}-${id}.png`,
      fullPage: true,
      animations: "disabled",
    });
    if (id === "overview") {
      await page.screenshot({
        path: `${dir}/${info.project.name}-viewport.png`,
        fullPage: false,
        animations: "disabled",
      });
    }
  }
});

test("globe country selection opens the exact distribution jobs", async ({
  page,
}) => {
  await ready(page);
  const globe = page.getByRole("region", { name: "Le monde de guteneo." });
  await expect(globe.locator("canvas")).toBeVisible();
  const coordinates = await globe.locator(".bv-globe-coordinate").textContent();
  await globe
    .getByRole("button", { name: "Tourner le globe vers l’est" })
    .click();
  await expect(globe.locator(".bv-globe-coordinate")).not.toHaveText(
    coordinates || "",
  );
  await globe.locator("canvas").focus();
  await page.keyboard.press("ArrowLeft");
  await globe
    .getByRole("button", { name: "Distribution", exact: true })
    .click();
  await globe.getByRole("button", { name: /France/ }).click();
  await expect(globe.getByRole("button", { name: /France/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await globe
    .getByRole("button", { name: /Voir l’activité de ce pays/ })
    .click();
  await expect(page).toHaveURL(/#jobs\?country=FR$/);
  await expect(
    page.getByRole("combobox", { name: "Pays de destination" }),
  ).toHaveValue("FR");
  await expect(
    page.getByRole("region", { name: "Tous les envois et leurs coûts" }),
  ).toContainText("France");
});

test("global jobs filters and attention drilldown operate without business mutations", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await ready(page);
  await navigate(page, "Envois");
  await page
    .getByRole("combobox", { name: "Canal", exact: true })
    .selectOption({ value: "postal" });
  await page
    .getByRole("combobox", { name: "État", exact: true })
    .selectOption({ value: "delivered" });
  const table = page.getByRole("region", {
    name: "Tous les envois et leurs coûts",
  });
  await expect(table).toBeVisible();
  await expect(table).toContainText("Courrier postal");
  await expect(table).not.toContainText("Résultat inconnu");
  await page
    .getByRole("combobox", { name: "Canal", exact: true })
    .selectOption({ value: "" });
  await page
    .getByRole("combobox", { name: "État", exact: true })
    .selectOption({ value: "group:attention" });
  await expect(table).toContainText("Résultat inconnu");
  await expect(table).not.toContainText("Livré");
  expect(writes).toEqual([]);
});
