/** Decisions describe existing transitions; conditional D1 writes still own authority. */
export type DispatchChannel = "fax" | "email" | "postal";
export type DispatchStatus =
  | "prepared"
  | "queued"
  | "submitting"
  | "submission_unknown"
  | "accepted"
  | "delivered"
  | "failed"
  | "cancelled"
  | "bounced"
  | "complained"
  | "printed"
  | "handed_to_post";
export type ProviderEventKind =
  | "accepted"
  | "delivered"
  | "failed"
  | "bounced"
  | "complained"
  | "printed"
  | "handed_to_post";
export type DispatchCommand = "approve" | "accept" | "cancel" | "claim";

const commandSources: Record<DispatchCommand, readonly DispatchStatus[]> = {
  approve: ["prepared"],
  accept: ["prepared"],
  cancel: ["prepared", "queued"],
  claim: ["queued"],
};
export function acceptsDispatchCommand(
  status: DispatchStatus,
  command: DispatchCommand,
): boolean {
  return commandSources[command].includes(status);
}

export type SubmissionEvidence = {
  status: DispatchStatus;
  provider: string | null;
  provider_id: string | null;
  active_attempt_id: string | null;
};
/** Recovery never grants authority for a new invocation or infers financial finality. */
export function dispatchRecovery(
  row: SubmissionEvidence,
  hasAttempt = false,
): { action: "review" | "observe" | "reconcile"; submissionStarted: boolean } {
  const submissionStarted =
    hasAttempt ||
    row.provider !== null ||
    row.provider_id !== null ||
    row.active_attempt_id !== null;
  return {
    action:
      row.status === "submitting" ||
      row.status === "submission_unknown" ||
      (row.status === "prepared" && submissionStarted)
        ? "reconcile"
        : row.status === "prepared"
          ? "review"
          : "observe",
    submissionStarted,
  };
}

/** The creation instant and every existing shorter authority limit remain binding. */
export function approvalDeadline(input: {
  createdAt: string;
  quoteExpiresAt?: string;
  reviewExpiresAt?: string;
  secureSessionExpiresAt?: string;
  browserSessionExpiresAt?: string;
  strongAuthenticatedAt?: number;
}): string {
  return new Date(
    Math.min(
      Date.parse(input.createdAt) + 15 * 60_000,
      ...[
        input.quoteExpiresAt,
        input.reviewExpiresAt,
        input.secureSessionExpiresAt,
        input.browserSessionExpiresAt,
      ].map((value) => (value ? Date.parse(value) : Infinity)),
      input.strongAuthenticatedAt === undefined
        ? Infinity
        : (input.strongAuthenticatedAt + 900) * 1000,
    ),
  ).toISOString();
}

const channelEvents: Record<DispatchChannel, readonly ProviderEventKind[]> = {
  fax: ["accepted", "delivered", "failed"],
  email: ["accepted", "delivered", "failed", "bounced", "complained"],
  postal: ["accepted", "printed", "handed_to_post", "delivered", "failed"],
};
/** Facts are ranked, not a linear success/failure graph. SQL rechecks predecessor states. */
export function providerEventProjection(
  channel: DispatchChannel,
  kind: ProviderEventKind,
): { status: ProviderEventKind; predecessors: DispatchStatus[] } | null {
  if (!channelEvents[channel].includes(kind)) return null;
  const ranks: Record<DispatchStatus, number> = {
    prepared: 0,
    queued: 0,
    submitting: 10,
    submission_unknown: 10,
    accepted: 20,
    printed: 30,
    failed: channel === "postal" ? 45 : 35,
    delivered: 50,
    handed_to_post: 40,
    bounced: 55,
    complained: 60,
    cancelled: 100,
  };
  return {
    status: kind,
    predecessors: (Object.keys(ranks) as DispatchStatus[]).filter(
      (status) => ranks[status] < ranks[kind],
    ),
  };
}

export type SubmissionResult = {
  status: "accepted" | "submission_unknown" | "rejected";
  providerId?: string;
  errorCode?: string;
};
/** An accepted result without a remote reference is uncertain, never retryable. */
export function normalizeSubmissionResult<T extends SubmissionResult>(
  result: T,
): T | SubmissionResult {
  return result.status === "accepted" && !result.providerId
    ? { status: "submission_unknown", errorCode: "PROVIDER_REFERENCE_MISSING" }
    : result;
}
export function attemptOutcome(
  result: SubmissionResult,
):
  | { status: "accepted"; providerId: string }
  | { status: "rejected"; errorCode: string }
  | { status: "unknown"; providerId: string | null; errorCode: string } {
  if (result.status === "rejected")
    return {
      status: "rejected",
      errorCode: result.errorCode ?? "PROVIDER_REJECTED",
    };
  if (result.status === "accepted" && result.providerId)
    return { status: "accepted", providerId: result.providerId };
  return {
    status: "unknown",
    providerId: result.providerId ?? null,
    errorCode: result.errorCode ?? "SUBMISSION_UNKNOWN",
  };
}

export function expiredSubmission(
  row: { status: DispatchStatus; lease_until: string | null },
  now: string,
): boolean {
  return (
    row.status === "submitting" &&
    row.lease_until !== null &&
    row.lease_until < now
  );
}
