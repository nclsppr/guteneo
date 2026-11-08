import type {
  GenerationJobView,
  GenerationResultView,
  DistributionEntryView,
  DatasetView,
  MappingView,
} from "../../../packages/contracts/src/template-workflow";

type JobState = GenerationJobView["state"];
type RecordState = GenerationResultView["state"];
export type GenerationCommand =
  { type: "cancel" } | { type: "retry"; frozen: boolean };
export function generationCommand(
  state: JobState,
  event: GenerationCommand,
):
  | { action: "cancel" | "retry" | "observe" }
  | { action: "refuse"; code: "GENERATION_CANCELLED" | "GENERATION_FROZEN" } {
  if (event.type === "cancel")
    return {
      action: ["queued", "running", "partial", "failed"].includes(state)
        ? "cancel"
        : "observe",
    };
  if (state === "cancelled")
    return { action: "refuse", code: "GENERATION_CANCELLED" };
  if (event.frozen) return { action: "refuse", code: "GENERATION_FROZEN" };
  return { action: "retry" };
}

/** The aggregation decision executes inside the conditional D1 update, not a stale read. */
export const generationSettlementSql =
  "CASE WHEN EXISTS(SELECT 1 FROM generation_records WHERE organization_id=? AND job_id=? AND state IN ('queued','running')) THEN 'running' WHEN NOT EXISTS(SELECT 1 FROM generation_records WHERE organization_id=? AND job_id=? AND state<>'generated') THEN 'completed' WHEN EXISTS(SELECT 1 FROM generation_records WHERE organization_id=? AND job_id=? AND state='generated') THEN 'partial' ELSE 'failed' END";

export function generationRecordRecovery(
  row: { state: RecordState; attempts: number; lease_until: string | null },
  time: string,
): "claim" | "reclaim" | "exhausted" | "observe" {
  if (row.state === "queued" && row.attempts < 3) return "claim";
  if (
    row.state !== "running" ||
    row.lease_until === null ||
    row.lease_until >= time
  )
    return "observe";
  return row.attempts < 3 ? "reclaim" : "exhausted";
}

export function datasetAnalysisDecision(
  row: {
    status: DatasetView["status"];
    expires_at: string;
    analysis_lease_until: string | null;
    analysis_attempts: number;
  },
  time: string,
): "complete" | "unavailable" | "busy" | "exhausted" | "claim" {
  if (row.status === "ready") return "complete";
  if (row.status !== "quarantined" || row.expires_at <= time)
    return "unavailable";
  if (row.analysis_lease_until !== null && row.analysis_lease_until > time)
    return "busy";
  return row.analysis_attempts >= 3 ? "exhausted" : "claim";
}

export function mayValidateMapping(
  state: MappingView["state"],
  validation: "ready" | "needs_review",
): boolean {
  return state === "draft" && validation === "ready";
}

/** Per-entry association is separate from its immutable manifest and any later dispatch. */
export function distributionEntryDecision(
  entry: Pick<
    DistributionEntryView,
    "dispatchId" | "postalReviewId" | "errorCode"
  >,
  retryFailed: boolean,
): "dispatch_associated" | "postal_review_associated" | "failed" | "prepare" {
  if (entry.dispatchId) return "dispatch_associated";
  if (entry.postalReviewId) return "postal_review_associated";
  return entry.errorCode && !retryFailed ? "failed" : "prepare";
}
