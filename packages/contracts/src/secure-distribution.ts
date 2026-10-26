import { z } from "zod";
import type { DocumentAccessMode } from "./document-authentication";

/** Customer prices, excluding tax, per immutable PDF and named recipient.
 * A committed hosting term is never refunded by revocation. Transport is quoted
 * separately by the existing delivery service; these are not supplier prices. */
export const SECURE_DISTRIBUTION_PRICE_VERSION =
  "secure-distribution-2026-10-24-v1";
export const SECURE_RETENTION_PRICES = [
  { days: 7, priceMinor: 49 },
  { days: 30, priceMinor: 99 },
  { days: 90, priceMinor: 199 },
  { days: 365, priceMinor: 499 },
] as const;
export const PERSONAL_RETENTION_PRICES = [
  { days: 365, priceMinor: 199 },
  { days: 1095, priceMinor: 499 },
] as const;
export const SECURE_DISTRIBUTION_LIMITS = {
  pdfBytes: 10 * 1024 * 1024,
  pages: 100,
  eventsPerMinute: 90,
  listLimit: 50,
  draftHours: 24,
  auditActivityRetentionDays: 90,
  messageCharacters: 16000,
  htmlCharacters: 150000,
} as const;

export const securePolicySchema = z
  .object({
    retentionDays: z
      .union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)])
      .default(7),
    allowOriginalDownload: z.boolean().default(false),
    allowVaultDeposit: z.boolean().default(false),
    personalRetentionDays: z
      .union([z.literal(365), z.literal(1095)])
      .default(365),
    // Missing on historical approvals: those still require independent binding.
    recipientBinding: z.enum(["verified_email", "independent"]).optional(),
  })
  .strict();
export type SecureDistributionPolicy = z.infer<typeof securePolicySchema>;

export const secureDistributionInputSchema = z
  .object({
    documentId: z.string().min(1).max(120),
    senderId: z.string().min(1).max(200).optional(),
    recipient: z
      .object({
        address: z.email().max(320),
        name: z.string().trim().max(160).optional(),
      })
      .strict(),
    retentionDays: securePolicySchema.shape.retentionDays,
    allowOriginalDownload: securePolicySchema.shape.allowOriginalDownload,
    allowVaultDeposit: securePolicySchema.shape.allowVaultDeposit,
    personalRetentionDays: securePolicySchema.shape.personalRetentionDays,
    recipientBinding: securePolicySchema.shape.recipientBinding,
    subject: z
      .string()
      .max(250)
      .optional()
      .describe(
        "Optional; defaults to a localized subject naming the authenticated workspace.",
      ),
    message: z
      .string()
      .max(SECURE_DISTRIBUTION_LIMITS.messageCharacters)
      .optional()
      .describe(
        "Optional plain-text message. Without content, Guteneo introduces the authenticated workspace.",
      ),
    html: z
      .string()
      .max(SECURE_DISTRIBUTION_LIMITS.htmlCharacters)
      .optional()
      .describe(
        "Optional custom HTML with safe inline email styles. Use {{document_url}} as an anchor's exact href to place the My documents button. Never supply a private URL. Without HTML, Guteneo uses its V2 email template.",
      ),
    notificationLocale: z.enum(["fr", "en", "de", "lb"]).optional(),
    costCeilingMinor: z.number().int().min(0).max(1000000).optional(),
  })
  .strict();
export type SecureDistributionInput = z.infer<
  typeof secureDistributionInputSchema
>;

export interface SecureDistributionQuote {
  sharedMinor: number;
  personalMinor: number;
  transportMinor: number;
  totalMinor: number;
  currency: "EUR";
  priceVersion: typeof SECURE_DISTRIBUTION_PRICE_VERSION;
  nonRefundable: true;
  taxBasis: "excluding_tax";
}
export function secureDistributionCatalog(mode: DocumentAccessMode = "strong") {
  return {
    retention: SECURE_RETENTION_PRICES,
    personalRetention: PERSONAL_RETENTION_PRICES,
    currency: "EUR" as const,
    priceVersion: SECURE_DISTRIBUTION_PRICE_VERSION,
    nonRefundable: true as const,
    taxBasis: "excluding_tax" as const,
    unit: "pdf_per_recipient" as const,
    limits: SECURE_DISTRIBUTION_LIMITS,
    authentication:
      mode === "verified_account"
        ? ("verified_account_and_fresh_authentication" as const)
        : ("account_and_fresh_strong_authentication" as const),
  };
}
export function secureDistributionQuote(
  policy: SecureDistributionPolicy,
  transportMinor = 0,
): SecureDistributionQuote {
  const sharedMinor = SECURE_RETENTION_PRICES.find(
    (tier) => tier.days === policy.retentionDays,
  )?.priceMinor;
  const personalMinor = policy.allowVaultDeposit
    ? PERSONAL_RETENTION_PRICES.find(
        (tier) => tier.days === policy.personalRetentionDays,
      )?.priceMinor
    : 0;
  if (
    sharedMinor === undefined ||
    personalMinor === undefined ||
    !Number.isSafeInteger(transportMinor) ||
    transportMinor < 0
  )
    throw new Error("INVALID_SECURE_DISTRIBUTION_PRICE");
  return {
    sharedMinor,
    personalMinor,
    transportMinor,
    totalMinor: sharedMinor + personalMinor + transportMinor,
    currency: "EUR",
    priceVersion: SECURE_DISTRIBUTION_PRICE_VERSION,
    nonRefundable: true,
    taxBasis: "excluding_tax",
  };
}

/** Stored in the immutable dispatch, never an invitation secret or a public URL. */
export interface SecureDistributionDescriptor {
  distributionId: string;
  sourceId: string;
  sourceSha256: string;
  manifestSha256: string;
  policy: SecureDistributionPolicy;
  serviceFeeMinor: number;
  priceVersion: typeof SECURE_DISTRIBUTION_PRICE_VERSION;
  preparedExpiresAt: string;
}
export type SecureDistributionStatus =
  "preparing" | "prepared" | "active" | "revoked" | "expired" | "failed";
export type SecureDocumentKind = "shared" | "personal";
export interface SecureAuditEvent {
  id: string;
  type: string;
  createdAt: string;
  provenance: "server" | "browser" | "provider";
  page?: number;
  actorUserId?: string;
  actorName?: string;
}
export interface SecureDistributionView {
  recipientFeedback?: "unsubscribed" | "reported" | null;
  id: string;
  dispatchId: string | null;
  status: SecureDistributionStatus;
  title: string;
  source: { id: string; name: string; pages: number; sha256: string };
  recipient: { address: string; name?: string };
  invitation: { subject: string; message: string; html?: string };
  policy: SecureDistributionPolicy;
  quote: SecureDistributionQuote;
  expiresAt: string | null;
  approvalUrl: string | null;
  recipientUserId: string | null;
  recipientBinding: "pending" | "confirmed";
  approved: boolean;
  approval: { fingerprint: string; expiresAt: string } | null;
  pendingClaim: {
    recipientUserId: string;
    name: string;
    email: string;
    createdAt: string;
  } | null;
  audit: SecureAuditEvent[];
  auditNextCursor?: string | null;
}
export interface PersonalDocumentItem {
  id: string;
  kind: SecureDocumentKind;
  title: string;
  sender: string;
  status: "active" | "expired" | "revoked" | "pending";
  expiresAt: string;
  createdAt: string;
  allowOriginalDownload: boolean;
  allowVaultDeposit: boolean;
  depositedDocumentId?: string;
}
export interface PersonalDocumentView extends PersonalDocumentItem {
  pages: {
    number: number;
    width: number;
    height: number;
    url: string;
    accessibleText: string;
    textUrl?: string;
  }[];
  audit: SecureAuditEvent[];
  auditNextCursor?: string | null;
  policy: SecureDistributionPolicy;
}

export const secureClaimSchema = z
  .object({
    token: z.string().min(32).max(512),
  })
  .strict();
export const secureBindingSchema = z
  .object({
    recipientUserId: z.string().min(1).max(120),
    verificationMethod: z.enum([
      "known_relationship",
      "independent_channel",
      "qualified_identity",
    ]),
  })
  .strict();
export const securePageEventSchema = z
  .object({
    type: z.literal("page_displayed"),
    page: z.number().int().min(1).max(SECURE_DISTRIBUTION_LIMITS.pages),
  })
  .strict();
