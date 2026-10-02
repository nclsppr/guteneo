import { z } from "zod";

export const pdfValidationProfiles = [
  "ua1",
  "ua2",
  "1b",
  "2b",
  "3b",
  "4",
] as const;
export const pdfValidationRuleTotals = {
  ua1: 106,
  ua2: 1727,
  "1b": 129,
  "2b": 144,
  "3b": 146,
  "4": 109,
} as const;
export const PDF_VALIDATOR_VERSION = "1.30.2";
export const pdfValidationInput = z
  .object({ profile: z.enum(pdfValidationProfiles) })
  .strict();
const count = z.number().int().nonnegative().max(1_000_000);
export const pdfValidationFinding = z
  .object({
    specification: z
      .string()
      .regex(/^ISO (?:19005-[1-4]|14289-[12]|32005)(?::[0-9]{4})?$/),
    clause: z
      .string()
      .regex(
        /^[0-9][0-9.A-Za-z_-]{0,63}$|^Table [0-9]+\. [A-Za-z][A-Za-z0-9-]{0,60}$/,
      ),
    testNumber: z.number().int().positive().max(1_000_000),
    failedChecks: count,
  })
  .strict();
export const privatePdfValidationResult = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    profile: z.enum(pdfValidationProfiles),
    engine: z
      .object({
        name: z.literal("veraPDF"),
        version: z.literal(PDF_VALIDATOR_VERSION),
      })
      .strict(),
    compliant: z.boolean(),
    passedRules: count,
    failedRules: count,
    failedChecks: count,
    truncated: z.boolean(),
    findings: z.array(pdfValidationFinding).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.passedRules + value.failedRules !==
        pdfValidationRuleTotals[value.profile] ||
      value.compliant !==
        (value.failedRules === 0 && value.failedChecks === 0) ||
      (value.compliant && (value.findings.length !== 0 || value.truncated)) ||
      (!value.compliant &&
        (value.failedRules === 0 ||
          value.failedChecks === 0 ||
          value.findings.length === 0)) ||
      value.findings.some((finding) => finding.failedChecks === 0) ||
      value.findings.length > value.failedRules ||
      value.truncated !== value.findings.length < value.failedRules ||
      value.failedChecks < value.failedRules ||
      new Set(
        value.findings.map(
          (f) => `${f.specification}:${f.clause}:${f.testNumber}`,
        ),
      ).size !== value.findings.length ||
      value.findings.reduce((sum, finding) => sum + finding.failedChecks, 0) >
        value.failedChecks ||
      (!value.truncated &&
        value.findings.reduce(
          (sum, finding) => sum + finding.failedChecks,
          0,
        ) !== value.failedChecks)
    )
      ctx.addIssue({ code: "custom", message: "Incomplete validation result" });
  });
export const pdfManualChecks = [
  { id: "reading_order", title: "Ordre de lecture et structure" },
  { id: "alternative_text", title: "Pertinence des textes alternatifs" },
  { id: "visual_contrast", title: "Contraste et lisibilité" },
  {
    id: "keyboard_navigation",
    title: "Navigation au clavier et lecteur d’écran",
  },
] as const;
export const pdfValidationReportSchema = z
  .object({
    id: z.string(),
    documentId: z.string(),
    sha256: z.string(),
    profile: z.enum(pdfValidationProfiles),
    createdAt: z.string(),
    evidence: z.enum(["production", "simulation"]),
    engine: z.object({ name: z.literal("veraPDF"), version: z.string() }),
    compliant: z.boolean(),
    passedRules: count,
    failedRules: count,
    failedChecks: count,
    truncated: z.boolean(),
    findings: z.array(pdfValidationFinding).max(100),
    manualReviewRequired: z.literal(true),
    manualChecks: z.array(
      z.object({
        id: z.enum([
          "reading_order",
          "alternative_text",
          "visual_contrast",
          "keyboard_navigation",
        ]),
        title: z.string(),
      }),
    ),
    status: z.enum(["passed", "failed"]),
    certification: z.literal(false),
  })
  .strict();
export type PdfValidationReport = z.infer<typeof pdfValidationReportSchema>;
export type PdfValidationProfile = (typeof pdfValidationProfiles)[number];
