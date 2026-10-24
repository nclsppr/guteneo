import { msg } from "./messages";

export function horizonErrorMessage(code: string): string | undefined {
  const errors: Record<string, string> = {
    HORIZON_PLAN_REQUIRED: msg(
      "An active Horizon plan is required for this check. The administrator can view the offer in the workspace.",
    ),
    HORIZON_DISABLED: msg(
      "The Horizon plan is being prepared. Subscriptions are not open yet.",
    ),
    HORIZON_UNAVAILABLE: msg(
      "The Horizon service is currently unavailable. Refresh the offer in your workspace before trying again.",
    ),
    HORIZON_TERMS_CHANGED: msg(
      "The plan terms have changed. Refresh the offer before confirming.",
    ),
    HORIZON_CONSENT_REQUIRED: msg(
      "The plan terms have changed. Refresh the offer before confirming.",
    ),
    INSUFFICIENT_CREDIT: msg(
      "The account does not have enough credit. Refresh the balance before trying again.",
    ),
    HORIZON_CREDIT_INSUFFICIENT: msg(
      "The account does not have enough credit. Refresh the balance before trying again.",
    ),
    HORIZON_MODE_MISMATCH: msg("This workspace’s mode is incompatible."),
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
