import { z } from "zod";
import type { TemplateEnvelope } from "./templates";
import type { DatasetFormat, DatasetProfile, MappingPlan } from "./datasets";

export const WORKFLOW_LIMITS = {
  recordsPerJob: 500,
  activeJobsPerOrganization: 3,
  templatesPerOrganization: 200,
  datasetsPerOrganization: 100,
  inputBytesPerRecord: 65536,
  payloadBytes: 1_900_000,
  distributionPreparationsPerRequest: 3,
  datasetRetentionDays: 30,
  resultPageSize: 50,
  attemptsPerRecord: 3,
} as const;
export type TemplatePermission = "use" | "edit" | "publish" | "share";
export type TemplateView = {
  id: string;
  name: string;
  ownerId: string;
  state: "draft" | "published" | "archived";
  visibility: "private" | "organization" | "selected";
  revision: number;
  currentVersion: number | null;
  permissions: Record<TemplatePermission, boolean>;
  envelope: TemplateEnvelope;
  createdAt: string;
  updatedAt: string;
};
export type DatasetView = {
  id: string;
  name: string;
  format: DatasetFormat;
  sha256: string;
  size: number;
  status: "quarantined" | "ready" | "rejected" | "purged";
  errorCode: string | null;
  structureHash: string | null;
  createdAt: string;
  expiresAt: string;
  analysis: {
    attempts: number;
    maxAttempts: 3;
    running: boolean;
    canRetry: boolean;
    retryAfterSeconds: number;
  };
};
export type DatasetProfileView = {
  dataset: DatasetView;
  profile: DatasetProfile;
};
export type MappingView = {
  id: string;
  version: number;
  name: string;
  sourceDatasetId: string;
  structureHash: string;
  plan: MappingPlan;
  state: "draft" | "validated";
  validation: unknown;
  createdAt: string;
};
export const generationInputSchema = z
  .object({
    templateId: z.string().min(1).max(200),
    templateVersion: z.number().int().positive().optional(),
    mode: z.literal("generate_only"),
    records: z
      .array(
        z
          .object({
            recordId: z.string().min(1).max(200),
            data: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      .optional(),
    datasetId: z.string().min(1).max(200).optional(),
    mappingId: z.string().min(1).max(200).optional(),
    mappingVersion: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) =>
      Boolean(v.records) !==
      Boolean(v.datasetId && v.mappingId && v.mappingVersion),
    "Choisissez les données directes OU un dataset et une version de mapping.",
  )
  .refine(
    (v) => !v.records || (!v.datasetId && !v.mappingId && !v.mappingVersion),
    "Les deux sources sont exclusives.",
  );
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationJobView = {
  id: string;
  templateId: string;
  templateVersion: number;
  datasetId: string | null;
  mappingId: string | null;
  mappingVersion: number | null;
  mode: "generate_only";
  state:
    "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  total: number;
  generated: number;
  failed: number;
  pending: number;
  cancelled: number;
  createdAt: string;
  updatedAt: string;
};
export type GenerationResultView = {
  recordId: string;
  state: "queued" | "running" | "generated" | "failed" | "cancelled";
  attempts: number;
  inputHash: string;
  documentId: string | null;
  documentHash: string | null;
  documentStatus: string | null;
  documentUrl: string | null;
  errorCode: string | null;
};
const distributionFieldPathSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/)
  .max(256);
const recipientFieldMapSchema = z.record(
  z.string().max(100),
  distributionFieldPathSchema,
);
export const distributionEntrySchema = z
  .object({
    entryId: z.string().min(1).max(100),
    recordId: z.string().min(1).max(200),
    channel: z.enum(["fax", "email", "postal"]).optional(),
    channelField: distributionFieldPathSchema.optional(),
    recipient: z.record(z.string(), z.unknown()).optional(),
    recipientFields: recipientFieldMapSchema.optional(),
    recipientFieldsByChannel: z
      .object({
        fax: recipientFieldMapSchema.optional(),
        email: recipientFieldMapSchema.optional(),
        postal: recipientFieldMapSchema.optional(),
      })
      .strict()
      .optional(),
    senderId: z.string().max(200).optional(),
    senderIdsByChannel: z
      .object({
        fax: z.string().max(200).optional(),
        email: z.string().max(200).optional(),
        postal: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    subject: z.string().max(200).optional(),
    html: z.string().max(131072).optional(),
    text: z.string().max(131072).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    optionsByChannel: z
      .object({
        fax: z.record(z.string(), z.unknown()).optional(),
        email: z.record(z.string(), z.unknown()).optional(),
        postal: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
    ceilingMinor: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (v) => !(v.senderId !== undefined && v.senderIdsByChannel !== undefined),
    "Choisissez un expéditeur commun OU les expéditeurs par canal.",
  )
  .refine(
    (v) => !(v.options !== undefined && v.optionsByChannel !== undefined),
    "Choisissez des options communes OU les options par canal.",
  )
  .refine(
    (v) => Boolean(v.channel) !== Boolean(v.channelField),
    "Choisissez un canal explicite OU son champ dans les données figées.",
  )
  .refine(
    (v) =>
      [v.recipient, v.recipientFields, v.recipientFieldsByChannel].filter(
        Boolean,
      ).length === 1,
    "Choisissez un destinataire explicite OU les champs des données figées.",
  );
export const distributionInputSchema = z
  .object({
    jobId: z.string().min(1).max(200),
    entries: z.array(distributionEntrySchema).min(1).max(500),
    explicitMultichannel: z.boolean().default(false),
  })
  .strict();
export type DistributionInput = z.infer<typeof distributionInputSchema>;
export type DistributionEntryView = Omit<
  z.infer<typeof distributionEntrySchema>,
  | "recipient"
  | "channel"
  | "channelField"
  | "recipientFieldsByChannel"
  | "senderIdsByChannel"
  | "optionsByChannel"
> & {
  channel: "fax" | "email" | "postal";
  recipient: Record<string, unknown>;
  documentId: string;
  documentHash: string;
  templateId: string;
  templateVersion: number;
  dispatchId: string | null;
  errorCode: string | null;
  postalReviewId?: string | null;
  postalReviewStatus?: string | null;
  postalReviewUrl?: string | null;
  postalDispatchId?: string | null;
};
export type DistributionView = {
  id: string;
  jobId: string;
  manifestHash: string;
  createdAt: string;
  entries: DistributionEntryView[];
  pendingCount: number;
  errorCount: number;
};
export type Page<T> = { items: T[]; nextCursor: string | null };
