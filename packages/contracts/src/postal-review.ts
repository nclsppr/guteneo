import { z } from "zod";
import type { PostalAddressPageProvenance } from "./postal-address-page";

export const postalReviewInputSchema = z
  .object({
    documentId: z.string().min(1).max(200),
    senderId: z.string().min(1).max(200),
    recipient: z
      .object({
        name: z.string().min(1).max(200),
        line1: z.string().min(1).max(200),
        postalCode: z.string().min(1).max(30),
        city: z.string().min(1).max(200),
        country: z.enum(["FR", "LU", "DE"]),
      })
      .strict(),
    options: z
      .object({
        addressPosition: z.enum(["left", "right"]).optional(),
        deliveryProduct: z.enum(["cheap", "fast"]),
        printMode: z.enum(["simplex", "duplex"]),
        printSpectrum: z.enum(["grayscale", "color"]),
      })
      .strict(),
    ceilingMinor: z.number().int().nonnegative().safe(),
  })
  .strict();
export type PostalReviewInput = z.infer<typeof postalReviewInputSchema>;
export type PostalReview = {
  id: string;
  addressPage?: PostalAddressPageProvenance;
  /** Exact preflight reviewed by a delegated assistant; absent in historical previews. */
  fingerprint?: string;
  status: "processing" | "review_required" | "blocked" | "failed";
  document: {
    id: string;
    name: string;
    sha256: string;
    pages: number;
    previewUrl: string;
  };
  recipient: PostalReviewInput["recipient"];
  options: PostalReviewInput["options"] & { addressPosition: "left" | "right" };
  ceilingMinor: number;
  reviewUrl: string;
  checks: {
    complete: boolean;
    dpi: number | null;
    pages: { page: number; width: number; height: number }[];
    issues: { code: string; page?: number }[];
  };
  address: {
    expectedLines: string[];
    extractedLines: string[];
    matches: boolean;
    textVisibility: "not_verified";
    cropAccess: "authenticated_browser_session_only";
    mcpEmbeddedVisualEvidenceAvailable: false;
    cropUrl: string | null;
  };
  /** Browser transfer availability only; never a decision on an expert MCP mandate. */
  canTransfer: boolean;
  transferPolicy: {
    canTransferMeaning: "browser_session_only";
    expertTool: "transfer_postal_draft";
    expertAuthority: "separate_active_postal_transfer_mandate_required";
    expertEligibilityEvaluated: false;
    requiresVisualReview: true;
  };
  transferStatus: "not_started" | "preparing" | "prepared" | "unknown";
  draftId: string | null;
  canSend: false;
};
