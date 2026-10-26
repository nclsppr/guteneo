import { msg } from "./messages";

export function secureAuditLabel(type: string) {
  const labels: Record<string, string> = {
    prepared: msg("Share prepared"),
    recipient_email_unsubscribed: msg("Unsubscribed"),
    recipient_email_reported: msg("Email reported"),
    recipient_verified_email_bound: msg(
      "Verified address associated with the document",
    ),
    approved: msg("Share approved"),
    activated: msg("Share activated and term charged"),
    invitation_sent: msg("Invitation submitted to provider"),
    claim_pending: msg("Recipient association pending"),
    recipient_bound: msg("Recipient association confirmed"),
    access_authorized: msg("Access authorized by server"),
    page_served: msg("Page delivered by server"),
    page_displayed: msg("Page display reported by browser"),
    download_requested: msg("PDF download requested"),
    download_started: msg("PDF delivery started"),
    personal_copy_deposited: msg("Personal copy delivered"),
    revoked: msg("Shared access revoked"),
    preparation_started: msg("Preparation in progress"),
    preparation_completed: msg("Share prepared"),
    preparation_failed: msg("Preparation failed"),
    recipient_association_requested: msg("Recipient association pending"),
    recipient_binding_confirmed: msg("Recipient association confirmed"),
    distribution_activated: msg("Share activated and term charged"),
    page_access_authorized: msg("Page access authorized"),
    accessible_text_access_authorized: msg("Accessible text access authorized"),
    original_download_requested: msg("PDF download requested"),
    original_transfer_started: msg("PDF delivery started"),
    personal_copy_delivered: msg("Personal copy delivered"),
    access_revoked: msg("Shared access revoked"),
    personal_copy_received: msg("Personal copy received"),
    personal_copy_deleted: msg("Personal copy deleted"),
    workshop_page_access_authorized: msg(
      "Page preview access authorized in the workspace",
    ),
    workshop_accessible_text_access_authorized: msg(
      "Accessible text access authorized in the workspace",
    ),
  };
  return labels[type] ?? msg("Share event");
}
