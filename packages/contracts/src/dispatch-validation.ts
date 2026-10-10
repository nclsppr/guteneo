import { z } from "zod";

export const dispatchValidationCheckSchema = z
  .object({
    id: z.enum([
      "prepared_state",
      "submission_not_started",
      "quote",
      "protected_document",
      "recipient_suppression",
      "acceptance",
      "provider_delivery",
    ]),
    status: z.enum(["passed", "blocked", "not_checked"]),
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
  })
  .strict();

/** A read-only observation of existing preparation; never authority to send. */
export const dispatchValidationResultSchema = z
  .object({
    schema: z.literal(1),
    execution: z.literal("validation_only"),
    dispatchId: z.string(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    dispatchMode: z.enum(["production", "simulation"]),
    checkedAt: z.string().datetime(),
    status: z.enum(["partial", "blocked"]),
    checks: z.array(dispatchValidationCheckSchema),
  })
  .strict();

export type DispatchValidationCheck = z.infer<
  typeof dispatchValidationCheckSchema
>;
export type DispatchValidationResult = z.infer<
  typeof dispatchValidationResultSchema
>;
