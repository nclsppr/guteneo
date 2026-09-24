/**
 * Shared dispatch status groups for browser summaries and filtered lists.
 * The server maps a group to its statuses; clients never send raw status
 * lists. Legacy or preview-only statuses stay listed so every surface counts
 * them the same way.
 */
export const DISPATCH_GROUPS = {
  /** A human still has to review and approve this exact version. */
  approval: ["prepared", "draft"],
  /** Accepted by Guteneo, not yet at a final provider outcome. */
  in_progress: ["queued", "submitting", "accepted", "submitted", "printed"],
  /** The outcome is uncertain or negative: read the follow-up before acting. */
  attention: [
    "submission_unknown",
    "reconciliation_required",
    "failed",
    "rejected",
    "bounced",
    "complained",
  ],
  /** Final outcome recorded, including an honoured cancellation. */
  done: ["delivered", "handed_to_post", "cancelled"],
} as const satisfies Record<string, readonly string[]>;

export type DispatchGroup = keyof typeof DISPATCH_GROUPS;

export const dispatchGroupNames = Object.keys(
  DISPATCH_GROUPS,
) as DispatchGroup[];

export function isDispatchGroup(value: unknown): value is DispatchGroup {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(DISPATCH_GROUPS, value)
  );
}

export function dispatchGroupOf(status: string): DispatchGroup | undefined {
  return dispatchGroupNames.find((group) =>
    (DISPATCH_GROUPS[group] as readonly string[]).includes(status),
  );
}

export type DispatchOverview = {
  documents: number;
  dispatches: { total: number } & Record<DispatchGroup, number>;
};
