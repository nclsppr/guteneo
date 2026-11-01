import { expect, test } from "@playwright/test";
import { evidencePath } from "./evidence";

for (const recipient of [
  {
    country: "HK",
    lines: [
      "Fictional Recipient",
      "12 Example Road, Kowloon",
      "HONG KONG",
    ],
  },
  {
    country: "US",
    lines: [
      "FICTIONAL RECIPIENT",
      "Example Company & Partners",
      "Department 2, Floor 3",
      "123 Test Street",
      "New York NY 10001",
      "UNITED STATES",
    ],
  },
]) {
  test(`reviews the complete ${recipient.country} address and simulates the letter only in the preview tab`, async ({
    page,
  }, info) => {
    const businessRequests: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() !== "GET" ||
        /^\/(api|auth|oauth|mcp)(\/|$)/.test(url.pathname) ||
        /(^|\.)(pingen|resend|telnyx)\.com$/i.test(url.hostname)
      )
        businessRequests.push(`${request.method()} ${url}`);
    });
    await page.goto("/?lang=fr#/app/prepare");
    await page
      .getByRole("radio", { name: "Courrier postal", exact: true })
      .check();
    await page.getByLabel("Document", { exact: true }).selectOption({ index: 1 });
    await page
      .getByLabel("Pays", { exact: true })
      .selectOption(recipient.country);
    await expect(
      page.getByLabel("Format de l’adresse", { exact: true }),
    ).toHaveValue("address_block");
    const printedAddress = page.getByLabel("Adresse complète à imprimer", {
      exact: true,
    });
    await printedAddress.fill(recipient.lines.join("\n"));
    await expect(printedAddress).toHaveValue(recipient.lines.join("\n"));
    await expect(page.locator("#main-content")).toContainText(
      "Cet exemple utilise des prix simulés et n’envoie aucune lettre.",
    );
    await page.getByRole("button", { name: "Vérifier et préparer" }).click();
    await expect(
      page.getByRole("heading", { name: "Le bon à envoyer." }),
    ).toBeVisible();
    await expect(page.locator(".dispatch-facts address span")).toHaveText(
      recipient.lines,
    );
    await expect(page.locator(".simulation-banner")).toContainText(
      "Aucun fax, e-mail ou courrier réel",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".pdf-canvas-wrap canvas").first()).toBeVisible();
    await page.screenshot({
      path: await evidencePath(
        `preview/postal-${recipient.country.toLowerCase()}-${info.project.name}.png`,
      ),
      fullPage: true,
      scale: "css",
    });
    await page
      .getByRole("button", { name: /^Simuler l’envoi pour/ })
      .click();
    await expect(page.locator(".status").first()).toContainText(/Transmis|Accepté/);
    await expect(page.locator(".dispatch-facts address span")).toHaveText(
      recipient.lines,
    );
    expect(errors).toEqual([]);
    expect(businessRequests).toEqual([]);
  });
}
