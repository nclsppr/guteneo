import { msg } from "./messages";

export function pdfCheckErrorMessage(code: string): string | undefined {
  const errors: Record<string, string> = {
    PDF_VALIDATION_PURCHASE_REQUIRED: msg(
      "Confirm the displayed price of this check before starting it.",
    ),
    PDF_VALIDATION_PRICE_CHANGED: msg(
      "The check price or terms have changed. Refresh the price and confirm again.",
    ),
    PDF_VALIDATION_CREDIT_INSUFFICIENT: msg(
      "The account does not have enough credit. Refresh the balance before trying again.",
    ),
    INSUFFICIENT_CREDIT: msg(
      "The account does not have enough credit. Refresh the balance before trying again.",
    ),
    PDF_VALIDATION_ADMIN_REQUIRED: msg(
      "You can read existing reports. Only a browser administrator can confirm a paid check.",
    ),
    PDF_VALIDATION_BROWSER_PURCHASE_REQUIRED: msg(
      "You can read existing reports. Only a browser administrator can confirm a paid check.",
    ),
    PDF_VALIDATION_UNAVAILABLE: msg(
      "PDF checks are currently unavailable. Existing reports remain readable.",
    ),
    PDF_VALIDATOR_CONFIGURATION_REQUIRED: msg(
      "The PDF validation service is not activated yet. Your document is retained and no compliance result has been produced.",
    ),
    PDF_VALIDATION_BUSY: msg(
      "A check of this PDF is already running. Refresh its reports before trying again.",
    ),
    PDF_VALIDATION_QUOTA_EXCEEDED: msg(
      "The PDF check limit for this period has been reached. Try again later.",
    ),
    PDF_VALIDATION_FAILED: msg(
      "The check did not complete. No compliance result was produced; you can request a new check.",
    ),
    DOCUMENT_NOT_READY: msg(
      "The PDF must first finish its security check before accessibility or archival validation.",
    ),
  };
  return errors[code];
}
