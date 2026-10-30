/** Browser-only presentation context; it never changes record identity. */
export type GenerationRecordContext = {
  recordId: string;
  name: string | null;
  subject: string | null;
  reference: string | null;
};
export type GenerationCorrectionInput = GenerationRecordContext & {
  data: Record<string, unknown>;
  /** The record's current PDF, shown beside its correction. */
  documentId: string | null;
};
/** One page of labels; the template name is present for the generation's owner. */
export type GenerationContextPage = {
  items: GenerationRecordContext[];
  nextCursor: string | null;
  templateName: string | null;
};
