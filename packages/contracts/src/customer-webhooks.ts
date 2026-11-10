import { z } from "zod";

export const CUSTOMER_WEBHOOK_LIMITS = {
  endpoints: 5,
  pendingPerEndpoint: 500,
  batch: 10,
  leaseSeconds: 30,
  timeoutMs: 5000,
  historyDays: 30,
} as const;
export const customerWebhookCreate = z
  .object({
    name: z.string().trim().min(1).max(80),
    url: z.string().min(1).max(2048),
    revealSigningSecret: z.literal(true),
  })
  .strict();
export const customerWebhookUpdate = z
  .object({
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(80).optional(),
    url: z.string().min(1).max(2048).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.url !== undefined ||
      value.enabled !== undefined,
    "Choose a setting to update.",
  );
export const customerWebhookRevision = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const customerWebhookRotation = customerWebhookRevision.extend({
  revealSigningSecret: z.literal(true),
});
export type CustomerWebhookDeliveryStatus =
  "pending" | "sending" | "sent" | "failed" | "unknown" | "superseded";
export interface CustomerWebhookCapabilities {
  configured: boolean;
  enabled: boolean;
  reason: "disabled" | "missing_key" | "public_network_required" | null;
  endpointLimit: number;
  pendingLimit: number;
}
export interface CustomerWebhookEndpoint {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status: "active" | "revoked";
  revision: number;
  createdAt: string;
  updatedAt: string;
  overflowCount: number;
  deliveryCounts: Record<CustomerWebhookDeliveryStatus, number>;
}
export interface CustomerWebhookDelivery {
  id: string;
  eventId: string;
  endpointRevision: number;
  dispatchId: string;
  dispatchStatus: string;
  status: CustomerWebhookDeliveryStatus;
  occurredAt: string;
  finishedAt: string | null;
  responseStatus: number | null;
  errorCode: string | null;
}
export interface CustomerWebhookEvent {
  id: string;
  type: "dispatch.status_changed";
  occurredAt: string;
  organizationId: string;
  data: {
    dispatchId: string;
    channel: "fax" | "email" | "postal";
    status: string;
    mode: "production";
  };
}
