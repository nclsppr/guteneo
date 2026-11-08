import type { McpAppUploadView } from "../../../packages/contracts/src/mcp-app-upload";

export type PrivateUploadState =
  "reserved" | "uploading" | "complete" | "rejected" | "unknown";

export function privateUploadRecoveryAction(
  upload: {
    state: PrivateUploadState;
    expires_at: string;
    lease_expires_at: string | null;
  },
  observedAt: string,
): "expire_unused" | "fence_writer" | "none" {
  if (upload.state === "reserved" && upload.expires_at <= observedAt)
    return "expire_unused";
  if (
    upload.state === "uploading" &&
    upload.lease_expires_at !== null &&
    upload.lease_expires_at <= observedAt
  )
    return "fence_writer";
  return "none";
}

/** A completed transfer can still have a quarantined PDF. */
export function privateUploadNextAction(state: PrivateUploadState) {
  const actions = {
    reserved: "upload_exact_bytes",
    uploading: "wait",
    complete: "get_document",
    rejected: "do_not_retry",
    unknown: "do_not_retry",
  } as const;
  return actions[state];
}

/** Unknown work can advance only from a durable core receipt, never a retry. */
export function mcpUploadReceiptState(
  stage: McpAppUploadView["status"],
  receipt: PrivateUploadState,
  pipelineStopped = false,
): "complete" | "rejected" | "unknown" | null {
  if (receipt === "complete" || receipt === "rejected") return receipt;
  if (pipelineStopped || (stage === "finalizing" && receipt === "unknown"))
    return "unknown";
  return null;
}

export function mcpUploadNextAction(stage: {
  state: McpAppUploadView["status"];
  writer_token: string | null;
  remainingCalls: number;
  confirmedParts: number;
  part_count: number;
}): McpAppUploadView["nextAction"] {
  if (stage.state === "complete") return "get_document";
  if (stage.state === "finalizing" || stage.writer_token) return "wait";
  if (stage.state !== "receiving" || stage.remainingCalls === 0) return "stop";
  return stage.confirmedParts === stage.part_count ? "finish" : "append_part";
}
