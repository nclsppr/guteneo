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
    page.getByRole("heading", { name: "Tout voir, à la bonne hauteur." }),
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
    ["Ateliers", "Les ateliers, dans le détail."],
    ["Envois", "Chaque envoi, à portée de vue."],
    ["Membres", "Les personnes derrière l’activité."],
    ["Connexions", "Chaque connexion a une origine."],
    ["Finances", "Des chiffres qui disent ce qu’ils sont."],
    ["Infrastructure", "Sous le capot de guteneo."],
  ]) {
    await navigate(page, name);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
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
  await navigate(page, "Ateliers");
  await page.getByLabel("Rechercher un atelier").fill("Rives");
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
    page.getByRole("region", { name: "Envois de l’atelier" }),
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
    page.getByRole("heading", { name: "Tout voir, à la bonne hauteur." }),
  ).toBeVisible();
  await expect(page.locator("#belvedere-main")).not.toContainText("NaN");
  await navigate(page, "Finances");
  await expect(page.getByText("Non calculable", { exact: true })).toBeVisible();
  await expect(page.getByText("Non configurés", { exact: true })).toBeVisible();
});

test("finance separates Horizon consumption from delivery channels and counts", async ({
  page,
}) => {
  await ready(page);
  await navigate(page, "Finances");
  await expect(
    page.getByText("Abonnement Horizon", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#belvedere-main")).toContainText(
    "1 débit d’abonnement comptabilisé sur la période, inclus dans la consommation totale.",
  );
  const monthly = page.getByRole("region", { name: "Consommation mensuelle" });
  await expect(
    monthly.getByRole("columnheader", { name: "Horizon", exact: true }),
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
    ["Ateliers", "workshops"],
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
