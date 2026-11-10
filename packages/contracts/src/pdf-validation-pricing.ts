/** Public pricing metadata has no validation-runtime dependency. */
export const PDF_VALIDATION_PRICE_MINOR = 10;
export const PDF_VALIDATION_TERMS_VERSION = "pdf-check-2026-10-25-v1";
export type PdfValidationPricing = {
  enabled: boolean;
  priceMinor: typeof PDF_VALIDATION_PRICE_MINOR;
  currency: "EUR";
  taxBasis: "excluding_tax";
  termsVersion: typeof PDF_VALIDATION_TERMS_VERSION;
  paymentSource: "account_credits";
  purchaseAllowed: boolean;
  creditAvailableMinor: number | null;
  evidence: "production" | "simulation";
};
