import { z } from "zod";

export const REVIEW_PAGE_BATCH = 3;
export const REVIEW_RESULT_BYTES = 1536 * 1024;
export const reviewPageSchema = z
  .object({
    page: z.number().int().min(1).max(100),
    width: z.number().int().positive().max(1600),
    height: z.number().int().positive().max(1600),
    mimeType: z.literal("image/jpeg"),
    imageBase64: z
      .string()
      .min(4)
      .max(350 * 1024)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
    text: z.string().max(8000),
    textTruncated: z.boolean(),
  })
  .strict();
export const reviewPagesSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    totalPages: z.number().int().min(1).max(100),
    startPage: z.number().int().min(1).max(100),
    pageCount: z.number().int().min(1).max(REVIEW_PAGE_BATCH),
    nextPage: z.number().int().min(1).max(100).nullable(),
    pages: z.array(reviewPageSchema).min(1).max(REVIEW_PAGE_BATCH),
    rendering: z.object({ complete: z.literal(true) }).strict(),
  })
  .strict();
export type ReviewPages = z.infer<typeof reviewPagesSchema>;
