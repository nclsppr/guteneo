/** Safe, shared recovery contract. No raw engine findings or document content. */
export type DocumentAnalysis = {
  state: "processing" | "ready" | "retryable" | "blocked";
  code: string;
  title: string;
  message: string;
  nextAction:
    "wait" | "rescan" | "replace_document" | "contact_support" | "continue";
  retryAfterSeconds: number | null;
};

export function documentAnalysis(
  status: string,
  state: DocumentAnalysis["state"] = "retryable",
  code = "not_started",
): DocumentAnalysis {
  if (status === "ready")
    return {
      state: "ready",
      code: "verified",
      title: "PDF ready",
      message: "Your PDF has been verified. You can prepare your delivery.",
      nextAction: "continue",
      retryAfterSeconds: null,
    };
  if (status === "purged" || status === "rejected")
    return {
      state: "blocked",
      code: status,
      title: "PDF unavailable",
      message: "This document cannot be used. Choose another PDF.",
      nextAction: "replace_document",
      retryAfterSeconds: null,
    };
  if (state === "processing")
    return {
      state,
      code,
      title: "PDF verification in progress",
      message:
        "Your PDF has been saved. Guteneo is continuing its verification automatically; this may take a few minutes. You do not need to upload it again.",
      nextAction: "wait",
      retryAfterSeconds: 15,
    };
  if (code === "security_rejected")
    return {
      state: "blocked",
      code,
      title: "PDF blocked by the security check",
      message:
        "The security check rejected this PDF. Check the original file or choose another PDF to continue.",
      nextAction: "replace_document",
      retryAfterSeconds: null,
    };
  if (code === "pdf_rejected")
    return {
      state: "blocked",
      code,
      title: "This PDF cannot be used",
      message:
        "The PDF did not pass the format check. Check that it opens correctly and is not password-protected, then upload a compatible version.",
      nextAction: "replace_document",
      retryAfterSeconds: null,
    };
  if (code === "service_not_configured" || code === "signatures_stale")
    return {
      state: "blocked",
      code,
      title: "Verification service unavailable",
      message:
        "Your PDF is preserved. Guteneo needs to intervene to restore verification. Contact support to resume your delivery.",
      nextAction: "contact_support",
      retryAfterSeconds: null,
    };
  if (code === "access_revoked")
    return {
      state: "blocked",
      code,
      title: "Verification paused after an access change",
      message:
        "The permissions of the account that started verification have changed. Ask an administrator in your organisation to resume analysis from their account.",
      nextAction: "contact_support",
      retryAfterSeconds: null,
    };
  if (state === "blocked")
    return {
      state,
      code,
      title: "PDF verification interrupted",
      message:
        "Guteneo cannot finish verifying this document. Contact support from your Guteneo workspace to resume your delivery.",
      nextAction: "contact_support",
      retryAfterSeconds: null,
    };
  return {
    state: "retryable",
    code,
    title:
      code === "not_started"
        ? "PDF needs checking"
        : "Verification is taking longer than expected",
    message:
      code === "not_started"
        ? "Your PDF has been saved. Start verification to prepare your delivery; no new upload is needed."
        : "Guteneo could not finish verification. Your PDF is preserved: restart the analysis here without uploading it again. If the problem persists, contact support.",
    nextAction: "rescan",
    retryAfterSeconds: null,
  };
}
