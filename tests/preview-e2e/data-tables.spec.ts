import { expect, test, type Locator, type Page } from "@playwright/test";
import { evidencePath } from "./evidence";

function observeBusinessRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      /^\/(api|auth|oauth|mcp)(\/|$)/.test(new URL(request.url()).pathname)
    )
      requests.push(`${request.method()} ${request.url()}`);
  });
  return requests;
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width);
}

function history(page: Page) {
  return page.locator("#main-content .data-table").first();
}

function rowValues(table: Locator, column: string) {
  return table.locator(
    `tbody [data-column="${column}"] .data-table__cell-value`,
  );
}

test("tablet tables retain columns and equal cell padding", async ({
  page,
}, info) => {
  const requests = observeBusinessRequests(page);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto("/?lang=en#/app");
  const table = history(page);
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await expect
    .poll(() =>
      table
        .locator("tbody tr")
        .first()
        .evaluate((row) => getComputedStyle(row).display),
    )
    .toBe("table-row");
  const insets = await table
    .locator("tbody tr")
    .first()
    .locator(":scope > :is(th, td)")
    .evaluateAll((cells) =>
      cells.map((cell) => ({
        left: parseFloat(getComputedStyle(cell).paddingLeft),
        right: parseFloat(getComputedStyle(cell).paddingRight),
      })),
    );
  expect(insets).toHaveLength(5);
  expect(insets.every((inset) => inset.left >= 16 && inset.right >= 16)).toBe(
    true,
  );
  expect(new Set(insets.map((inset) => inset.left)).size).toBe(1);
  expect(new Set(insets.map((inset) => inset.right)).size).toBe(1);
  await expect(table.locator(".data-table__mobile-sort")).toBeHidden();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: await evidencePath(`data-tables/tablet-${info.project.name}.png`),
    fullPage: true,
    scale: "css",
  });
  expect(requests).toEqual([]);
});

test("phone cards keep every field inset and support search, filters and reset", async ({
  page,
}, info) => {
  const requests = observeBusinessRequests(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=en#/app");
  const table = history(page);
  await expect(table.locator("tbody tr")).toHaveCount(5);
  const row = table.locator("tbody tr").first();
  // Clipped headers retain their names without leaving invisible Tab stops.
  for (const button of await table.locator("thead button").all())
    await expect(button).toBeHidden();
  await expect
    .poll(() => row.evaluate((element) => getComputedStyle(element).display))
    .toBe("grid");
  const insets = await row.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [
      ...element.querySelectorAll<HTMLElement>(":scope > :is(td, th)"),
    ].map((cell) => {
      const field = cell.getBoundingClientRect();
      return {
        left: field.left - bounds.left,
        right: bounds.right - field.right,
      };
    });
  });
  expect(insets.every((inset) => inset.left >= 16 && inset.right >= 16)).toBe(
    true,
  );
  await expect(
    row.locator('[data-column="recipient"] .data-table__cell-label'),
  ).toBeVisible();
  const search = table.getByRole("searchbox");
  await search.fill("CAMILLE");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(rowValues(table, "recipient")).toContainText(
    "camille@example.invalid",
  );
  await table.locator(".data-table__reset").click();
  await expect(search).toBeEmpty();
  await expect(table.locator("tbody tr")).toHaveCount(5);
  const channel = table.getByRole("combobox", { name: "Channel", exact: true });
  await channel.selectOption("email");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await search.fill("no-such-recipient");
  await expect(table.locator("tbody tr")).toHaveCount(0);
  await expect(table.locator(".data-table__empty")).toContainText(
    "No matching rows",
  );
  await table
    .locator(".data-table__empty")
    .getByRole("button", { name: "Clear filters" })
    .click();
  await expect(search).toBeEmpty();
  await expect(channel).toHaveValue("");
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: await evidencePath(`data-tables/mobile-${info.project.name}.png`),
    fullPage: true,
    scale: "css",
  });
  await page.setViewportSize({ width: 320, height: 812 });
  await expectNoPageOverflow(page);
  expect(requests).toEqual([]);
});

test("desktop header sorting and phone sorting use the same chronological order", async ({
  page,
}) => {
  const requests = observeBusinessRequests(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?lang=en#/app");
  const table = history(page);
  await expect(table.locator("tbody tr")).toHaveCount(5);
  const created = table.getByRole("columnheader", {
    name: "Created on",
    exact: true,
  });
  await created.getByRole("button").click();
  await expect(created).toHaveAttribute("aria-sort", "ascending");
  await expect(rowValues(table, "recipient").first()).toContainText(
    "preview_atelier_dispatch_5",
  );
  await created.getByRole("button").click();
  await expect(created).toHaveAttribute("aria-sort", "descending");
  await expect(rowValues(table, "recipient").first()).toContainText(
    "preview_atelier_dispatch_1",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const sort = table.getByRole("combobox", {
    name: "Sort by column",
    exact: true,
  });
  await expect(sort).toBeVisible();
  await expect(table.locator("thead .data-table__sort").first()).toBeHidden();
  await expect(sort).toHaveValue("created");
  await table
    .getByRole("button", { name: "Sort ascending", exact: true })
    .click();
  await expect(created).toHaveAttribute("aria-sort", "ascending");
  await expect(rowValues(table, "recipient").first()).toContainText(
    "preview_atelier_dispatch_5",
  );
  await sort.selectOption("recipient");
  await expect(table.locator('thead [aria-sort="ascending"]')).toContainText(
    "Recipient",
  );
  await expectNoPageOverflow(page);
  expect(requests).toEqual([]);
});

test("validated CSV rows paginate, resize and search across all loaded rows", async ({
  page,
}) => {
  const requests = observeBusinessRequests(page);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto("/?lang=en#/app/campaigns");
  const csv = [
    "channel,email",
    ...Array.from(
      { length: 31 },
      (_, index) =>
        `email,participant-${String(index + 1).padStart(2, "0")}@example.invalid`,
    ),
  ].join("\n");
  await page
    .getByLabel("Recipient list in CSV format", { exact: true })
    .fill(csv);
  await page
    .getByRole("button", { name: "Check the list", exact: true })
    .click();
  const table = page.locator(".csv-result .data-table");
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(table.locator(".data-table__count")).toContainText(
    "1–10 of 31 loaded rows",
  );
  const next = table.getByRole("button", { name: "Next page", exact: true });
  const previous = table.getByRole("button", {
    name: "Previous page",
    exact: true,
  });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(rowValues(table, "recipient").first()).toHaveText(
    "participant-11@example.invalid",
  );
  await next.click();
  await next.click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(rowValues(table, "recipient")).toHaveText(
    "participant-31@example.invalid",
  );
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(rowValues(table, "recipient").first()).toHaveText(
    "participant-21@example.invalid",
  );
  await table.getByRole("searchbox").fill("participant-31");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator(".data-table__pagination nav")).toContainText(
    "Page 1 of 1",
  );
  await table.locator(".data-table__reset").click();
  await expect(rowValues(table, "recipient").first()).toHaveText(
    "participant-01@example.invalid",
  );
  await table.getByLabel("Rows per page", { exact: true }).selectOption("25");
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await next.click();
  await expect(table.locator("tbody tr")).toHaveCount(6);
  await expect(rowValues(table, "recipient").last()).toHaveText(
    "participant-31@example.invalid",
  );
  await expectNoPageOverflow(page);
  // Validation stays in the browser fixture; no campaign or dispatch is created.
  expect(requests).toEqual([]);
});

test("table controls follow all four languages and dark appearance", async ({
  page,
}, info) => {
  const requests = observeBusinessRequests(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const copy = [
    {
      locale: "fr",
      search: "Rechercher dans les lignes chargées",
      rows: "Lignes par page",
      sort: "Trier par colonne",
      clear: "Effacer les filtres",
    },
    {
      locale: "en",
      search: "Search loaded rows",
      rows: "Rows per page",
      sort: "Sort by column",
      clear: "Clear filters",
    },
    {
      locale: "de",
      search: "Geladene Zeilen durchsuchen",
      rows: "Zeilen pro Seite",
      sort: "Nach Spalte sortieren",
      clear: "Filter zurücksetzen",
    },
    {
      locale: "lb",
      search: "An de geluedenen Zeile sichen",
      rows: "Zeile pro Säit",
      sort: "No Kolonn sortéieren",
      clear: "Filter zerécksetzen",
    },
  ];
  for (const language of copy) {
    await page.goto(`/?lang=${language.locale}#/app`);
    await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const table = history(page);
    await expect(
      table.getByPlaceholder(language.search, { exact: true }),
    ).toBeVisible();
    await expect(
      table.getByLabel(language.rows, { exact: true }),
    ).toBeVisible();
    await expect(
      table.getByRole("combobox", { name: language.sort, exact: true }),
    ).toBeVisible();
    await table.getByRole("searchbox").fill("camille");
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(
      table.getByRole("button", { name: language.clear, exact: true }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
  }
  await page.screenshot({
    path: await evidencePath(
      `data-tables/dark-luxembourgish-${info.project.name}.png`,
    ),
    fullPage: true,
    scale: "css",
  });
  expect(requests).toEqual([]);
});
