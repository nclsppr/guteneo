import type { Dispatch } from "./api";

/** Presentation only. The server rechecks the exact source and authority. */
export function scheduleSourceSupported(source: Dispatch): boolean {
  let options: unknown;
  try {
    options =
      typeof source.options_json === "string"
        ? JSON.parse(source.options_json)
        : source.options_json;
  } catch {
    return false;
  }
  if (!options || typeof options !== "object" || Array.isArray(options))
    return false;
  const value = options as Record<string, unknown>;
  return (
    ["fax", "email"].includes(source.channel) &&
    !(source.channel === "email" && source.document_id) &&
    !value.secureDistribution &&
    !value.protectedDocument &&
    value.emailDeliveryMode !== "protected_link" &&
    source.faxPricing?.executionScope !== "review_prepare_only"
  );
}
