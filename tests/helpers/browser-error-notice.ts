import { expect, type Locator } from "@playwright/test";

/** Exercise reviewed fallback copy and the intentionally folded support code. */
export async function expectUnreviewedServerError(
  notice: Locator,
  code: string,
  unreviewedMessage: string,
  locale: "en" | "fr" = "en",
) {
  const [title, detailsLabel] =
    locale === "fr"
      ? ["L’opération n’a pas pu aboutir", "Détails"]
      : ["The operation could not be completed", "Details"];
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(title);
  await expect(notice).not.toContainText(unreviewedMessage);
  const details = notice.locator("details.error-details");
  const technicalCode = details.getByText(code, { exact: true });
  await expect(details).not.toHaveAttribute("open");
  await expect(technicalCode).toBeHidden();
  await details.getByText(detailsLabel, { exact: true }).click();
  await expect(technicalCode).toBeVisible();
  await details.getByText(detailsLabel, { exact: true }).click();
  await expect(technicalCode).toBeHidden();
}
