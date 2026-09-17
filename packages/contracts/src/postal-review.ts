import { z } from "zod";

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
    cropUrl: string | null;
  };
  canTransfer: boolean;
  transferStatus: "not_started" | "preparing" | "prepared" | "unknown";
  draftId: string | null;
  canSend: false;
};
