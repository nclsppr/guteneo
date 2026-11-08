import type { SecureDistributionStatus } from "../../../packages/contracts/src/secure-distribution";

/** Rendering and attaching its immutable dispatch are separate durable steps. */
export function secureDistributionStatus(
  share: {
    status: SecureDistributionStatus;
    dispatch_id: string | null;
    expires_at: string | null;
  },
  observedAt: string,
): SecureDistributionStatus {
  if (
    share.status === "active" &&
    share.expires_at !== null &&
    share.expires_at <= observedAt
  )
    return "expired";
  if (share.status === "prepared" && !share.dispatch_id) return "preparing";
  return share.status;
}

/** A cursor is progress, not proof of publication or current authority. */
export function personalDepositNextStep(
  copy: { original_ready: number; next_page: number },
  sourcePages: number,
): "copy_original" | "copy_pages" | "publish" {
  if (!copy.original_ready) return "copy_original";
  return copy.next_page <= sourcePages ? "copy_pages" : "publish";
}
