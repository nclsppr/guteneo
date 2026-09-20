import { z } from "zod";
import { postalReviewInputSchema } from "./postal-review";
import type { DocumentAnalysis } from "./document-analysis";

export const POSTAL_ADDRESS_PAGE_VERSION = "postal-address-page-2026-09-20-v1";
export const postalAddressPageInputSchema = z
  .object({
    documentId: z.string().min(1).max(200),
    recipient: postalReviewInputSchema.shape.recipient,
    printMode: z.enum(["simplex", "duplex"]),
  })
  .strict();
export type PostalAddressPageInput = z.infer<
  typeof postalAddressPageInputSchema
>;
export const postalAddressPageRenderInputSchema = postalAddressPageInputSchema
  .omit({ documentId: true })
  .extend({
    defaultCountry: z.string().regex(/^[A-Z]{2}$/),
    addressPosition: z.enum(["left", "right"]),
  })
  .strict();
export type PostalAddressPageRenderInput = z.infer<
  typeof postalAddressPageRenderInputSchema
>;
export function postalAddressLines(
  recipient: PostalAddressPageInput["recipient"],
  defaultCountry: string,
): string[] {
  const lines = [
    recipient.name,
    recipient.line1,
    `${recipient.postalCode} ${recipient.city}`,
  ];
  if (recipient.country !== defaultCountry)
    lines.push(
      { FR: "FRANCE", LU: "LUXEMBOURG", DE: "GERMANY" }[recipient.country],
    );
  return lines;
}
export type PostalAddressPageProvenance = {
  id: string;
  version: typeof POSTAL_ADDRESS_PAGE_VERSION;
  sourceDocumentId: string;
  sourceSha256: string;
  generatedDocumentId: string;
  generatedSha256: string;
  addressMode: "generated_address_page";
  recipient: PostalAddressPageInput["recipient"];
  printMode: PostalAddressPageInput["printMode"];
  profile: {
    defaultCountry: string;
    addressPosition: "left" | "right";
    version: string;
  };
  addedPages: 1 | 2;
};
/** Public document summary: no private storage location or provider credentials. */
export type PostalAddressPageResult = {
  document: {
    id: string;
    name: string;
    sha256: string;
    size: number;
    pages: number;
    status: "ready" | "quarantined" | "rejected" | "purged";
    source: "import" | "render";
    created_at: string;
    analysis: DocumentAnalysis;
  };
  provenance: PostalAddressPageProvenance;
  canSend: false;
};
