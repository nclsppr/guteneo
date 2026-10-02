import { z } from "zod";
import { WORKSPACE_ROLES, type WorkspaceRole } from "./roles";

export const INVITATION_BATCH_LIMIT = 100;
export const INVITATION_DAILY_LIMIT = 500;
export const invitationEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email()
  .regex(/^[\x21-\x7e]+$/);
export const workspaceInvitationInput = z
  .object({
    emails: z.array(invitationEmail).min(1).max(INVITATION_BATCH_LIMIT),
    role: z.enum(WORKSPACE_ROLES),
    supervisorCanApprove: z.boolean().optional(),
    supervisorCanReport: z.boolean().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.role === "supervisor" ||
      (!input.supervisorCanApprove && !input.supervisorCanReport),
    "Les options sont réservées au superviseur.",
  )
  .refine(
    (input) => new Set(input.emails).size === input.emails.length,
    "Une adresse ne doit apparaître qu’une fois.",
  );
export type WorkspaceInvitationInput = z.infer<typeof workspaceInvitationInput>;
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type InvitationDeliveryStatus =
  "pending" | "simulated" | "sent" | "failed" | "unknown";
export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  supervisorCanApprove: boolean;
  supervisorCanReport: boolean;
  status: InvitationStatus;
  deliveryStatus: InvitationDeliveryStatus;
  createdAt: string;
  expiresAt: string;
  previewUrl?: string;
}
