import type { PostalReview } from "../../../packages/contracts/src/postal-review";

export function postalReviewProjection(
  row: {
    status: PostalReview["status"];
    processing_until: string;
    expires_at: string;
    transfer_status: PostalReview["transferStatus"];
    transfer_started_at: string | null;
  },
  time: string,
  superseded: boolean,
) {
  const timedOut = row.status === "processing" && row.processing_until <= time;
  const expired = row.expires_at <= time;
  const transferStatus: PostalReview["transferStatus"] =
    row.transfer_status === "preparing" &&
    row.transfer_started_at !== null &&
    Date.parse(row.transfer_started_at) + 120_000 <= Date.parse(time)
      ? "unknown"
      : row.transfer_status;
  return {
    timedOut,
    expired,
    status: superseded
      ? ("blocked" as const)
      : timedOut
        ? ("failed" as const)
        : row.status,
    transferStatus,
  };
}

/** Transfer is a distinct external effect; an existing/unknown transfer is observation only. */
export function postalTransferDecision(input: {
  status: PostalReview["status"];
  transferStatus: PostalReview["transferStatus"];
  complete: boolean;
  addressMatches: boolean;
  expired?: boolean;
  superseded?: boolean;
}): "start" | "observe" | "refuse" {
  if (input.transferStatus !== "not_started") return "observe";
  return input.status === "review_required" &&
    input.complete &&
    input.addressMatches &&
    !input.expired &&
    !input.superseded
    ? "start"
    : "refuse";
}

export function addressPageRecovery(
  row: {
    generated_document_id: string | null;
    expires_at: string;
    lease_until: string;
    attempts: number;
  },
  time: string,
): "complete" | "expired" | "busy" | "exhausted" | "claim" {
  if (row.generated_document_id) return "complete";
  if (row.expires_at <= time) return "expired";
  if (row.lease_until > time) return "busy";
  return row.attempts >= 3 ? "exhausted" : "claim";
}
