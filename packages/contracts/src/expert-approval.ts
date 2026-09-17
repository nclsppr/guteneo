import { z } from "zod";

export const expertPolicyInput = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }).strict(),
  z
    .object({
      enabled: z.literal(true),
      channels: z
        .array(z.enum(["fax", "email", "postal"]))
        .min(1)
        .max(3)
        .refine((items) => new Set(items).size === items.length),
      maxPerDispatchMinor: z.number().int().min(1).max(10000),
      maxDailyMinor: z.number().int().min(1).max(50000),
      maxDailyCount: z.number().int().min(1).max(1000),
      expiresAt: z.iso.datetime(),
      acknowledgement: z.literal("delegate-approval-v1"),
    })
    .strict(),
]);

export type ExpertApprovalAccount = {
  canManage: boolean;
  day: string;
  connections: {
    connectionId: string;
    clientId: string;
    status: "active" | "revoked";
    policy: null | {
      enabled: boolean;
      revision: number;
      channels: ("fax" | "email" | "postal")[];
      maxPerDispatchMinor: number;
      maxDailyMinor: number;
      maxDailyCount: number;
      expiresAt: string;
      updatedAt: string;
    };
    usage: { count: number; ceilingMinor: number };
  }[];
};
