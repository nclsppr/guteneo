import { expect, test } from "@playwright/test";
import { publicLanguagePicker } from "../public-language";
import { publicFilmAsset } from "../../packages/contracts/src/public-videos";

test("the saved account language selects the public film ahead of the browser choice", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/session"
          ? {
              user: {
                id: "film-locale-user",
                role: "member",
                name: "Example",
                preferredLocale: "de",
              },
              organization: { id: "film-locale-org", name: "Example" },
              csrfToken: "local-fixture",
              simulation: true,
            }
          : {},
    }),
  );
  await page.goto("/?lang=en");
  const film = page.locator('[data-film="introduction"]');
  await expect(film).toHaveAttribute("data-locale", "de");
  await expect(film.locator("video")).toHaveAttribute("lang", "de");
  await expect(film.locator("video")).not.toHaveAttribute("src");
  await expect(film.locator(".homepage-film-poster img")).toHaveAttribute(
    "src",
    publicFilmAsset("introduction", "de").poster,
  );
  await page.goto("/roles/?lang=en");
  await expect(page.locator('[data-film="roles"]')).toHaveAttribute(
    "data-locale",
    "de",
  );
  await expect(
    page.locator('[data-film="roles"] .homepage-film-poster img'),
  ).toHaveAttribute("src", publicFilmAsset("roles", "de").poster);
});

test.use({ locale: "en-GB" });
test("home language is available in navigation, survives reload and works on mobile", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  let picker = await publicLanguagePicker(page);
  await expect(picker).toHaveValue("en");
  await expect(page.locator(".homepage-film-play")).toContainText(
    "Watch the film",
  );
  await expect(page.locator(".homepage-film-transcript summary")).toHaveText(
    "Read the film transcript",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await picker.selectOption("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator(".homepage-film-play")).toContainText(
    "Film ansehen",
  );
  await expect(page.locator(".homepage-film-transcript summary")).toHaveText(
    "Filmtext lesen",
  );
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText(
    "Votre assistant",
  );
  await page.reload();
  picker = await publicLanguagePicker(page);
  await expect(picker).toHaveValue("de");
  await picker.selectOption("lb");
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  await expect(page.locator(".homepage-film-play")).toContainText(
    "De Film kucken",
  );
  await expect(page.locator(".homepage-film-transcript summary")).toHaveText(
    "Den Text vum Film liesen",
  );
  await page.reload();
  picker = await publicLanguagePicker(page);
  await expect(picker).toHaveValue("lb");
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText(
    "Votre assistant",
  );
  await picker.focus();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `reports/locale-home-${test.info().project.name}.png`,
    fullPage: false,
  });
});

test("profile saves language for the account and keeps edited fields when switching the interface", async ({
  page,
}) => {
  let preferredLocale = "de";
  let userName = "Camille Exemple";
  const updates: Record<string, string>[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let response: unknown = {};
    if (path === "/api/session")
      response = {
        user: {
          id: "locale-user",
          role: "member",
          name: userName,
          preferredLocale,
        },
        organization: { id: "locale-org", name: "Atelier Exemple" },
        csrfToken: "local-test",
        simulation: true,
      };
    else if (path === "/api/account" && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      updates.push(body);
      preferredLocale = body.preferredLocale;
      userName = body.userName;
    } else if (path === "/api/account/workspaces")
      response = {
        items: [
          {
            id: "locale-org",
            name: "Atelier Exemple",
            role: "member",
            current: true,
          },
        ],
      };
    else if (path === "/api/account/sessions")
      response = { items: [], hasMore: false };
    else if (path === "/api/account/expert-approval")
      response = { connections: [], enabled: false };
    else if (path === "/api/capabilities")
      response = { scanner: "disabled_in_local_simulation" };
    await route.fulfill({ json: response });
  });
  await page.goto("/#/app/account");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.locator("#account-name").fill("Camille Updated");
  await page
    .locator('.workspace-language select[name="language"]')
    .selectOption("en");
  await expect(page.locator("#account-name")).toHaveValue("Camille Updated");
  await page
    .getByLabel("Preferred language", { exact: true })
    .selectOption("lb");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  expect(updates).toHaveLength(1);
  expect(updates[0]).toEqual({
    userName: "Camille Updated",
    preferredLocale: "lb",
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  await expect(page.locator(".language-preference select")).toHaveValue("lb");
});

test("failed profile save keeps the active account language and offers retry", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/account" && route.request().method() === "PATCH")
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "TEMPORARY_ERROR",
            message: "Service temporarily unavailable",
          },
        },
      });
    const response =
      path === "/api/session"
        ? {
            user: {
              id: "u",
              role: "member",
              name: "Camille",
              preferredLocale: "en",
            },
            organization: { id: "o", name: "Example" },
            csrfToken: "test",
            simulation: true,
          }
        : path === "/api/account/workspaces"
          ? {
              items: [
                { id: "o", name: "Example", role: "member", current: true },
              ],
            }
          : path === "/api/account/sessions"
            ? { items: [], hasMore: false }
            : path === "/api/account/expert-approval"
              ? { connections: [], enabled: false }
              : {};
    await route.fulfill({ json: response });
  });
  await page.goto("/#/app/account");
  await page
    .getByLabel("Preferred language", { exact: true })
    .selectOption("de");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.locator("#account-form-error").getByRole("alert"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
});
