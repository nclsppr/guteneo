import type { PersonalDocumentItem } from "../../../packages/contracts/src/secure-distribution";
import { ApiError } from "./api";
import { msg } from "./messages";

export function personalDocumentStatus(status: PersonalDocumentItem["status"]) {
  return {
    active: msg("Access available"),
    pending: msg("Association pending"),
    expired: msg("Access expired"),
    revoked: msg("Access revoked"),
  }[status];
}

export function needsAuthentication(error: Error | undefined) {
  return (
    error instanceof ApiError &&
    [
      "STRONG_AUTHENTICATION_REQUIRED",
      "DOCUMENT_AUTHENTICATION_REQUIRED",
      "FRESH_AUTHENTICATION_REQUIRED",
      "AUTHENTICATION_FRESHNESS_REQUIRED",
      "MFA_REQUIRED",
    ].includes(error.code)
  );
}
