import { z } from "zod";

export const assistantRecoverySchema = z
  .object({
    action: z.enum([
      "check_document",
      "check_document_upload",
      "check_pdf_validation",
      "check_dispatch",
      "check_mandate",
      "check_postal_setup",
      "check_postal_preflight",
      "reconnect",
      "review_same_dispatch",
      "read_same_document",
      "replace_file",
      "contact_support",
    ]),
    message: z.string(),
    tool: z
      .enum([
        "get_document",
        "get_document_upload",
        "get_pdf_validation",
        "get_dispatch_status",
        "get_expert_status",
        "get_postal_setup",
        "get_postal_preflight",
        "review_dispatch",
        "read_document_pages",
      ])
      .nullable(),
    retry: z.enum(["read_only", "after_change", "never_resend"]),
  })
  .strict();
export type AssistantRecovery = z.infer<typeof assistantRecoverySchema>;

export type AssistantRecoveryContext =
  | "read_document_pages"
  | "postal_setup"
  | "postal_preflight"
  | "private_document_upload"
  | "mcp_app_document_upload";

function recoverMcpAppUpload(code: string): AssistantRecovery {
  if (["MCP_DOCUMENT_UPLOAD_UNAVAILABLE", "APP_UPLOAD_DISABLED", "UPLOAD_AUTHORITY_CHANGED", "CONNECTION_REVOKED", "INSUFFICIENT_SCOPE", "TOKEN_EXPIRED", "TOKEN_INVALID"].includes(code))
    return {
      action: "check_document_upload",
      tool: null,
      retry: "after_change",
      message: "Restore current document-write authority and availability before returning to the existing Guteneo PDF App. Keep the same upload and original metadata; this does not activate a mandate or authorize a new import. Use its Check status control after recovery, not a binary-upload tool.",
    };
  return {
    action: "check_document_upload",
    tool: null,
    retry: "read_only",
    message: "Use Check status in the existing Guteneo PDF App for the same upload. If the begin reply contained no ID, that control recovers only the same frozen key, filename, size and SHA-256. Resume content only after conclusive App status explicitly permits it and the person requests Resume. Never invoke App-only tools from the model, expose file bytes, use a new key, switch transport, reconstruct the PDF or create a dispatch. An unknown final pipeline remains status-only.",
  };
}

function recoverPrivateUpload(code: string): AssistantRecovery {
  if (
    [
      "CONNECTION_REVOKED",
      "INSUFFICIENT_SCOPE",
      "TOKEN_EXPIRED",
      "TOKEN_INVALID",
      "POSTAL_AUTHORITY_CHANGED",
      "UPLOAD_AUTHORITY_CHANGED",
    ].includes(code)
  )
    return {
      action: "reconnect",
      tool: null,
      retry: "after_change",
      message:
        "Restore this connection's current document-write authority before reading the same upload. Keep the original and its existing key/metadata. Do not automatically import again, create another key or prepare a dispatch.",
    };
  if (code.startsWith("INLINE_PDF_"))
    return {
      action: "check_document_upload",
      tool: null,
      retry: "after_change",
      message:
        "The inline original was refused before a reservation. Check the selected original's exact bytes, size, SHA-256 and canonical base64 locally with the person, within64KiB. Preserve the original and key; do not repair, reconstruct, split or automatically import it again. This creates no dispatch.",
    };
  return {
    action: "check_document_upload",
    tool: "get_document_upload",
    retry: "never_resend",
    message:
      "The import outcome may already be recorded. If uploadId is known, read only that same ID through get_document_upload. If no ID was received, call begin_document_upload with strictly the same idempotencyKey, fileName, size and SHA-256 to recover its ID, then get_document_upload. Never put base64 or a capability in recovery arguments, automatically call import_inline_pdf again, resend bytes, rescan, use a new key or create a dispatch. Unknown/rejected requires explanation, not another import.",
  };
}

function readSameDocument(): AssistantRecovery {
  return {
    action: "read_same_document",
    tool: "read_document_pages",
    retry: "after_change",
    message:
      "Keep the same PDF. After resolving the reader issue, resume read_document_pages with the same documentId and page. Do not repeat a failing read. This read requires neither a prepared dispatch nor an expert mandate: do not create a dispatch or request a mandate to resume it.",
  };
}

const linkedFaxRenewal =
  "If the quote is expired or invalid, only a fax explicitly reporting status=prepared and attemptCount=0 may be renewed; a missing field does not mean zero. Use prepare_fax with renewalOf=the previous dispatchId and the exact same documentId, E.164 phone and ceilingMinor. Never freely prepare another dispatch. Present the new quote, then obtain fresh approval or repeat the full expert review on the new identifier under current authority; no previous agreement or review token carries over.";

/** Closed, content-free actions. Error categories never authorize a send. */
export function assistantRecovery(
  code: string,
  context?: AssistantRecoveryContext,
): AssistantRecovery {
  if (context === "mcp_app_document_upload") return recoverMcpAppUpload(code);
  if (context === "private_document_upload") return recoverPrivateUpload(code);
  if (["PDF_VALIDATION_BUSY", "PDF_VALIDATION_FAILED"].includes(code))
    return {
      action: "check_pdf_validation",
      tool: "get_pdf_validation",
      retry: "read_only",
      message:
        "Keep the same PDF and check key. View the saved reports without automatically rerunning or importing again. Service failure is not an accessibility verdict on the PDF.",
    };
  if (
    [
      "PDF_VALIDATION_BROWSER_PURCHASE_REQUIRED",
      "PDF_VALIDATION_ADMIN_REQUIRED",
      "PDF_VALIDATION_PURCHASE_REQUIRED",
      "PDF_VALIDATION_PRICE_CHANGED",
      "PDF_VALIDATION_CREDIT_INSUFFICIENT",
      "PDF_VALIDATION_UNAVAILABLE",
      "PDF_VALIDATOR_CONFIGURATION_REQUIRED",
    ].includes(code)
  )
    return {
      action: "contact_support",
      tool: null,
      retry: "after_change",
      message:
        "Open the supplied Guteneo document link for a current browser administrator to review the exact PDF, selected profile and unit price. An assistant cannot approve a purchase or change credits or billing settings. Do not retry automatically or describe this refusal as a completed PDF check.",
    };
  if (code === "CONNECTION_REVOKED")
    return {
      action: "reconnect",
      tool: null,
      retry: "after_change",
      message:
        "An administrator must reauthorize this connection before resuming here. This does not activate or renew the expert mandate.",
    };
  if (
    [
      "INSUFFICIENT_SCOPE",
      "TOKEN_EXPIRED",
      "TOKEN_INVALID",
      "POSTAL_AUTHORITY_CHANGED",
      "EXPERT_STATUS_AUTHORITY_CHANGED",
    ].includes(code)
  )
    return {
      action: "reconnect",
      tool: null,
      retry: "after_change",
      message:
        "Reconnect Guteneo in the assistant with the required permissions, then resume here. Reconnecting does not renew the expert mandate.",
    };
  if (
    [
      "EXPERT_OPT_IN_REQUIRED",
      "EXPERT_CHANNEL_DISABLED",
      "EXPERT_LIMIT_EXCEEDED",
      "EXPERT_BUDGET_EXCEEDED",
      "EXPERT_AUTHORITY_CHANGED",
    ].includes(code)
  )
    return {
      action: "check_mandate",
      tool: "get_expert_status",
      retry: "read_only",
      message:
        "Read this connection’s mandate and limits before continuing. The assistant cannot activate it or raise its ceilings.",
    };
  if (
    [
      "POSTAL_SENDER_ADMIN_REQUIRED",
      "POSTAL_SENDER_EXISTS",
      "POSTAL_SETUP_REVIEW_REQUIRED",
      "POSTAL_SETUP_UNAVAILABLE",
      "POSTAL_PROFILE_UNQUALIFIED",
      "POSTAL_DRAFT_TRANSFER_DISABLED",
    ].includes(code) ||
    (context === "postal_setup" && code === "FORBIDDEN") ||
    ((context === "postal_setup" || context === "postal_preflight") &&
      code === "SENDER_NOT_CONFIGURED")
  )
    return {
      action: "check_postal_setup",
      tool: "get_postal_setup",
      retry: "read_only",
      message:
        "Read the same account's postal setup and explain reason and canManage. If the sender is missing, collect only their name and address in this conversation; an authorized administrator may request configure_postal_sender with those values. If only pricing has expired, explain revalidation and explicitly repeat the same setup with the same sender. Do not replace an existing sender, restore any suspension or create a mandate. Keep the imported PDF; setup authorizes neither transfer nor sending.",
    };
  if (code === "POSTAL_DRAFT_NOT_READY")
    return {
      action: "check_postal_preflight",
      tool: "get_postal_preflight",
      retry: "read_only",
      message:
        "The existing letter is still being analyzed. Keep preflightId and the quote key; inspect this preflight, then wait before resuming quote_postal_draft with exactly the same values. Do not transfer the PDF again or create another preflight or key. This refusal has not created a dispatch.",
    };
  if (code === "POSTAL_PREFLIGHT_NOT_FOUND")
    return {
      action: "contact_support",
      tool: null,
      retry: "after_change",
      message:
        "This postal preflight was not found in the connected account. Check the saved identifier and account with the person; do not assume another preflight is correct or recreate a transfer to bypass this refusal.",
    };
  if (
    [
      "POSTAL_PREFLIGHT_EXPIRED",
      "POSTAL_PREFLIGHT_VERSION_CHANGED",
      "POSTAL_PREFLIGHT_STALE",
      "POSTAL_PROFILE_CHANGED",
      "POSTAL_PREFLIGHT_REQUIRED",
      "POSTAL_PREPARED_DRAFT_REQUIRED",
    ].includes(code) ||
    (context === "postal_preflight" && code === "LIVE_QUOTE_INVALID")
  )
    return {
      action: "check_postal_preflight",
      tool: "get_postal_preflight",
      retry: "never_resend",
      message:
        "Reread the same postal preflight and its transfer before any further action. An unknown transfer requires reconciliation, never a new key or upload. An expired, changed or blocked review does not authorize transmission. Keep the PDF, options and identifiers; explain the required correction and resume review under current authority without inventing approval.",
    };
  if (
    [
      "LIVE_QUOTE_INVALID",
      "EXPERT_REVIEW_INVALID",
      "EXPERT_REVIEW_EXPIRED",
    ].includes(code)
  )
    return context === "read_document_pages"
      ? readSameDocument()
      : {
          action: "check_dispatch",
          tool: "get_dispatch_status",
          retry: "never_resend",
          message:
            "Reread the same dispatch's status. If it remains prepared and its quote is valid, resume its review. " +
            linkedFaxRenewal,
        };
  if (["FAX_QUOTE_RENEWAL_UNSAFE", "RENEWAL_CONTENT_MISMATCH"].includes(code))
    return context === "read_document_pages"
      ? readSameDocument()
      : {
          action: "check_dispatch",
          tool: "get_dispatch_status",
          retry: "never_resend",
          message:
            "Stop renewal and read the same dispatch's status to explain the refusal. Do not bypass this block with a fresh preparation, another PDF, number, ceiling or key. Never resend an uncertain transmission.",
        };
  if (code === "QUOTE_STILL_VALID")
    return context === "read_document_pages"
      ? readSameDocument()
      : {
          action: "check_dispatch",
          tool: "get_dispatch_status",
          retry: "never_resend",
          message:
            "Read the same dispatch's status. If its quote remains valid and its status is prepared, resume review and approval of that existing quote; no renewal or new dispatch is needed.",
        };
  if (code === "EXPERT_REVIEW_SEQUENCE_REQUIRED")
    return {
      action: "review_same_dispatch",
      tool: "review_dispatch",
      retry: "after_change",
      message:
        "Resume reading the same dispatch at page 1, then follow nextPage without skipping pages.",
    };
  if (
    [
      "DOCUMENT_QUARANTINED",
      "DOCUMENT_NOT_READY",
      "VERIFIED_SCAN_REQUIRED",
      "SCAN_IN_PROGRESS",
      "SCAN_QUOTA_EXCEEDED",
    ].includes(code)
  )
    return {
      action: "check_document",
      tool: "get_document",
      retry: "read_only",
      message:
        "Read the same PDF's verification and follow its proposed action; no new import is needed.",
    };
  if (
    [
      "REVIEW_RENDER_FAILED",
      "REVIEW_RENDER_TIMEOUT",
      "RENDERER_NOT_CONFIGURED",
      "EXPERT_DOCUMENT_UNAVAILABLE",
      "EXPERT_DOCUMENT_TOO_LARGE",
      "REVIEW_IMAGE_BUDGET",
      "REVIEW_RESULT_SIZE",
    ].includes(code)
  )
    return context === "read_document_pages"
      ? readSameDocument()
      : {
          action: "review_same_dispatch",
          tool: "review_dispatch",
          retry: "after_change",
          message:
            "Keep the same dispatch. Image review accepts PDFs up to 10 MiB; an embedded PDF up to 1 MiB is an alternative only if the host can read it. Do not repeat a failing read or approve an unreadable page.",
        };
  if (
    ["DOWNLOAD_FAILED", "DOWNLOAD_TIMEOUT", "DOWNLOAD_EXPIRED"].includes(code)
  )
    return {
      action: "replace_file",
      tool: null,
      retry: "after_change",
      message:
        "Attach the original PDF again in this conversation to renew access. Do not reconstruct it from its text.",
    };
  if (code === "REVIEW_UNSUPPORTED_CONTENT")
    return {
      action: "contact_support",
      tool: null,
      retry: "after_change",
      message:
        "The document cannot be faithfully reread for this dispatch. Explain this limitation here; human review remains an alternative chosen by the user, without opening the site automatically.",
    };
  if (
    ["DOCUMENT_INTEGRITY_ERROR", "DOCUMENT_INTEGRITY_MISMATCH"].includes(code)
  )
    return {
      action: "contact_support",
      tool: null,
      retry: "after_change",
      message:
        "Stop this review and contact support: the PDF's integrity or verification evidence must be restored before any approval. Changing format or opening the site does not resolve this block.",
    };
  if (code.startsWith("POSTAL_ADDRESS_PAGE_"))
    return {
      action: "check_document",
      tool: "get_document",
      retry: "after_change",
      message:
        "Keep the source PDF and generation key. If a new document was returned, inspect its verification without regenerating it. After a temporary interruption, resume create_postal_address_page with exactly the same key and parameters. A rejected address, format or limit must be explicitly corrected with the person before a new request; do not truncate the address or create a dispatch to bypass this refusal.",
    };
  if (
    [
      "INVALID_PDF",
      "REVIEW_PDF_INVALID",
      "FILE_TOO_LARGE",
      "PDF_SIZE",
      "NOT_PDF",
      "CORRUPT_PDF",
      "UNSUPPORTED_PDF",
      "ENCRYPTED_PDF",
      "PAGE_LIMIT",
      "COMPLEX_PDF",
      "ACTIVE_PDF",
    ].includes(code)
  )
    return {
      action: "replace_file",
      tool: null,
      retry: "after_change",
      message:
        "A valid compatible PDF is required within the 10 MiB and 100-page limits. Ask the user for a corrected version; do not change the original without their request or repeat import of the same invalid file.",
    };
  if (code === "SOURCE_NOT_ALLOWED")
    return {
      action: "contact_support",
      tool: null,
      retry: "after_change",
      message:
        "Guteneo must authorize the file source. Keep the domain diagnostic for support without sharing its temporary URL; do not multiply imports or invent another URL.",
    };
  if (["CREDIT_EXHAUSTED", "QUOTA_EXCEEDED"].includes(code))
    return context === "postal_preflight"
      ? {
          action: "check_postal_preflight",
          tool: "get_postal_preflight",
          retry: "after_change",
          message:
            "Account credits and quotas remain required. Keep the PDF, preflight and quote key; inspect the same preflight if it exists, then wait until the limit is resolved. Do not create a duplicate or promise available top-ups.",
        }
      : {
          action: "check_dispatch",
          tool: "get_dispatch_status",
          retry: "after_change",
          message:
            "The mandate budget does not replace account credits and quotas. Keep the same dispatch and wait until this limit is resolved; do not create a duplicate or promise available top-ups.",
        };
  if (context === "read_document_pages") return readSameDocument();
  if (context === "postal_setup")
    return {
      action: "check_postal_setup",
      tool: "get_postal_setup",
      retry: "read_only",
      message:
        "Read the same account's sender and setup. After a lost response, keep the supplied values and check that state before resuming configure_postal_sender with exactly the same name and address; do not replace the identity, restore any suspension or renew anything through a read. Collect missing fields in this conversation.",
    };
  if (context === "postal_preflight")
    return {
      action: "check_postal_preflight",
      tool: "get_postal_preflight",
      retry: "never_resend",
      message:
        "Keep the same PDF and postal preflight. If preflightId was returned, inspect it before any action. If only the preflight creation response was lost, resume preflight_postal_pdf with exactly the same parameters and key, without importing again. Never retry an unknown transfer or uncertain dispatch; no failure authorizes another upload or dispatch.",
    };
  return {
    action: "check_dispatch",
    tool: "get_dispatch_status",
    retry: "never_resend",
    message:
      "If a dispatch already exists, read its status before any further action. Do not create a duplicate or resend a dispatch with an uncertain outcome.",
  };
}
