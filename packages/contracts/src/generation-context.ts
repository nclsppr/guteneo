/** Browser-only presentation context; it never changes record identity. */
export type GenerationRecordContext = {
  recordId: string;
  name: string | null;
  subject: string | null;
  reference: string | null;
};
export type GenerationCorrectionInput = GenerationRecordContext & {
  data: Record<string, unknown>;
};
