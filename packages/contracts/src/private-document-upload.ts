import { z } from "zod";
import { LIMITS } from "./content";

/** Immutable original metadata shared by private upload transports. */
export const privateDocumentUploadInput = z
  .object({
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
    fileName: z
      .string()
      .min(1)
      .max(180)
      .regex(/^[^/\\\x00-\x1f\x7f]+\.pdf$/i),
    size: z.number().int().min(20).max(LIMITS.pdfBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type PrivateDocumentUploadInput = z.infer<
  typeof privateDocumentUploadInput
>;
export const privateUploadInput = privateDocumentUploadInput;
export type PrivateUploadInput = PrivateDocumentUploadInput;
export const INLINE_PDF_BYTES = 64 * 1024;
export const inlinePdfInput = privateDocumentUploadInput.extend({
  size: z.number().int().min(20).max(INLINE_PDF_BYTES),
  base64: z
    .string()
    .min(28)
    .max(4 * Math.ceil(INLINE_PDF_BYTES / 3)),
});
export type InlinePdfInput = z.infer<typeof inlinePdfInput>;
