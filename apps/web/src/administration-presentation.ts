import { msg } from "./messages";

/** Only known action codes become prose; never interpolate audit detail payloads. */
export function auditActionLabel(action: string): string {
  switch (action) {
    case "dispatch.approved":
      return msg("Dispatch approved");
    case "dispatch.expert_approved":
      return msg("Dispatch approved by delegation");
    case "dispatch.cancelled":
      return msg("Dispatch cancelled");
    case "document.scan_verified":
      return msg("Document scan verified");
    case "member.role_changed":
      return msg("Member role changed");
    case "member.access_revoked":
      return msg("Member access revoked");
    case "account.updated":
      return msg("Account settings updated");
    case "account.session_revoked":
      return msg("Session revoked");
    case "expert_policy.enabled":
      return msg("Delegation enabled");
    case "expert_policy.revoked":
      return msg("Delegation revoked");
    case "report.exported":
      return msg("Report exported");
    default:
      return msg("Recorded action");
  }
}
