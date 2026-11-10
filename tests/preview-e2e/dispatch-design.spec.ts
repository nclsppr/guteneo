import { expect, test } from "@playwright/test";

for (const locale of [
  {
    code: "fr",
    email: "E-mail",
    postal: "Courrier postal",
    search: "Rechercher un pays",
    country: "Pays",
    required: "Remplissez ce champ.",
  },
  {
    code: "en",
    email: "Email",
    postal: "Postal mail",
    search: "Search countries",
    country: "Country",
    required: "Fill in this field.",
  },
  {
    code: "de",
    email: "E-Mail",
    postal: "Briefpost",
    search: "Länder suchen",
    country: "Land",
    required: "Füllen Sie dieses Feld aus.",
  },
  {
    code: "lb",
    email: "E-Mail",
    postal: "Bréifpost",
    search: "Länner sichen",
    country: "Land",
    required: "Fëllt dëst Feld aus.",
  },
]) {
  test(`${locale.code}: country search retains the selected address and invalid input cannot prepare`, async ({
    page,
  }) => {
    const businessRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() !== "GET" ||
        /^\/(api|auth|oauth|mcp)(\/|$)/.test(new URL(request.url()).pathname)
      )
        businessRequests.push(request.url());
    });
    await page.goto(`/?lang=${locale.code}#/app/prepare`);
    // Primary channel names stay short; the indicative rate is their description.
    await page.getByRole("radio", { name: locale.postal, exact: true }).check();
    const country = page.getByLabel(locale.country, { exact: true });
    await country.selectOption("HK");
    const address = page.locator("textarea").first();
    await address.fill("Fictional Person\n12 Example Road\nHONG KONG");
    const search = page.getByRole("searchbox", {
      name: locale.search,
      exact: true,
    });
    await search.fill("US");
    await expect(country).toHaveValue("HK");
    await expect(country.locator('option[value="US"]')).toHaveCount(1);
    await expect(country.locator('option[value="HK"]')).toHaveCount(1);
    await expect(country.locator('option[value="DE"]')).toHaveCount(0);
    await expect(address).toHaveValue(
      "Fictional Person\n12 Example Road\nHONG KONG",
    );
    await search.fill("");
    await expect(country.locator("option")).toHaveCount(250);
    await page.getByRole("radio", { name: locale.email, exact: true }).check();
    const email = page.locator('input[type="email"]');
    await email.fill("");
    await page
      .locator(
        ".prepare-fields > button[type=submit], .prepare-fields > button:not([type])",
      )
      .last()
      .click();
    await expect(page.locator("#prepare-validation-error")).toContainText(
      locale.required,
    );
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/#\/app\/prepare$/);
    expect(businessRequests).toEqual([]);
  });
}
