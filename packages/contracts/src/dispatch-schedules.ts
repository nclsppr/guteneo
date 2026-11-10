import { z } from "zod";

export const SCHEDULE_LIMITS = { horizonDays: 30, releaseWindowMinutes: 15, maximumMinor: 1_000_000, activePerWorkspace: 100 } as const;
export const FUTURE_SPENDING_ACKNOWLEDGEMENT = "I approve this exact dispatch for automatic future spending within the displayed cap and release window.";
export const dispatchScheduleInput = z.object({
  dispatchId: z.string().min(1).max(200),
  executeAt: z.string().datetime({ offset: true }),
  maxTotalMinor: z.number().int().min(1).max(SCHEDULE_LIMITS.maximumMinor),
}).strict();
export const dispatchScheduleApproval = z.object({
  expectedRevision: z.number().int().positive(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgement: z.literal(FUTURE_SPENDING_ACKNOWLEDGEMENT),
  recipientRequested: z.boolean().optional(),
}).strict();
export const dispatchScheduleCancel = z.object({ expectedRevision: z.number().int().positive() }).strict();
export type DispatchScheduleStatus = "draft" | "approved" | "releasing" | "released" | "blocked" | "cancelled" | "unknown";
export type DispatchScheduleView = {
  id: string;
  dispatchId: string;
  releaseDispatchId: string | null;
  channel: "fax" | "email";
  status: DispatchScheduleStatus;
  revision: number;
  snapshotHash: string;
  executeAt: string;
  releaseUntil: string;
  maxTotalMinor: number;
  currency: "EUR";
  approvalKind: "future_browser" | null;
  approvedAt: string | null;
  approvedBy: string | null;
  errorCode: string | null;
  releaseEnabled: boolean;
  canReschedule: boolean;
  createdAt: string;
};
