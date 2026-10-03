import { z } from "zod";

export const DATASET_LIMITS = Object.freeze({
  sourceBytes: 5 * 1024 * 1024,
  expandedBytes: 24 * 1024 * 1024,
  archiveEntries: 256,
  sheets: 12,
  rows: 5000,
  columns: 128,
  cells: 100000,
  cellCharacters: 12000,
  documents: 500,
  issues: 1000,
  xmlDepth: 32,
  xmlElements: 100000,
});
export type DatasetFormat = "csv" | "xlsx" | "json" | "xml";
/** A literal absolute element path, not an XPath expression. Namespace prefixes are preserved. */
export const XmlRecordPathSchema = z
  .string()
  .max(256)
  .regex(/^(\/[A-Za-z_][A-Za-z0-9_:-]*)+$/)
  .refine(
    (value) =>
      !value
        .split("/")
        .some((part) =>
          ["__proto__", "prototype", "constructor"].includes(part),
        ),
    "Unsafe XML record path",
  );
export type SourceCell = {
  sheet: string;
  row: number;
  column: number;
  address: string;
};
export type DatasetIssue = {
  code: string;
  severity: "warning" | "error";
  message: string;
  source?: SourceCell;
  target?: string;
};
export type ProfileCell = {
  column: number;
  address: string;
  raw: string | null;
  kind: "text" | "number" | "boolean" | "date" | "empty" | "error";
  formula?: string;
  cached?: boolean;
  numberFormat?: string;
};
export type ProfileSheet = {
  name: string;
  hidden: boolean;
  rows: Array<{ rowNumber: number; hidden: boolean; cells: ProfileCell[] }>;
  headerCandidates: number[];
  merges: string[];
};
export type DatasetProfile = {
  version: 1;
  format: DatasetFormat;
  sheets: ProfileSheet[];
  issues: DatasetIssue[];
  sourceBytes: number;
};

const safePath = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/)
  .refine(
    (value) =>
      !value
        .split(".")
        .some((part) =>
          ["__proto__", "prototype", "constructor"].includes(part),
        ),
    "Unsafe field path",
  );
const sourceColumn = z.string().min(1).max(256);
export const DatasetFieldSchema = z
  .object({
    source: sourceColumn,
    target: safePath,
    type: z.enum(["text", "integer", "decimal", "minor", "date", "boolean"]),
    required: z.boolean().optional(),
    defaultValue: z
      .union([z.string().max(12000), z.number().int().safe(), z.boolean()])
      .optional(),
    dateOrder: z.enum(["DMY", "MDY", "YMD"]).optional(),
    decimalSeparator: z.enum([".", ","]).optional(),
    scale: z.number().int().min(0).max(9).optional(),
  })
  .strict();
export const MappingPlanSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(120),
    sourceSheet: z.string().min(1).max(256),
    headerRow: z.number().int().min(1).max(DATASET_LIMITS.rows),
    recordKey: z.array(sourceColumn).max(8),
    fields: z.array(DatasetFieldSchema).min(1).max(128),
    group: z
      .object({
        itemPath: safePath,
        fields: z.array(DatasetFieldSchema).min(1).max(64),
      })
      .strict()
      .optional(),
    joins: z
      .array(
        z
          .object({
            sheet: z.string().min(1).max(256),
            headerRow: z.number().int().min(1).max(DATASET_LIMITS.rows),
            parentKey: sourceColumn,
            childKey: sourceColumn,
            target: safePath,
            cardinality: z.enum(["one-to-one", "one-to-many"]),
            fields: z.array(DatasetFieldSchema).min(1).max(64),
            expectedHeaders: z.array(sourceColumn).min(1).max(128),
            excludeRows: z
              .array(z.number().int().min(1).max(DATASET_LIMITS.rows))
              .max(5000)
              .optional(),
          })
          .strict(),
      )
      .max(8),
    excludeRows: z
      .array(z.number().int().min(1).max(DATASET_LIMITS.rows))
      .max(5000),
    includeHidden: z.boolean(),
    formulaPolicy: z.enum(["reject", "cached"]),
    expectedHeaders: z.array(sourceColumn).min(1).max(128),
  })
  .strict();
export type DatasetField = z.infer<typeof DatasetFieldSchema>;
export type MappingPlan = z.infer<typeof MappingPlanSchema>;
export type NormalizedRecord = {
  recordId: string;
  data: Record<string, unknown>;
  provenance: Record<string, SourceCell[]>;
};
export type MappingValidation = {
  status: "ready" | "needs_review";
  issues: DatasetIssue[];
  documentCount: number;
  records: NormalizedRecord[];
  excludedRows: SourceCell[];
};
