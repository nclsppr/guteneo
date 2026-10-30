import {
  documentAnalysis,
  type DocumentAnalysis,
} from "../../../packages/contracts/src/document-analysis";

export const MAX_AUTO_ANALYSIS_ATTEMPTS = 5;

export type DocumentAnalysisRecovery = {
  state: DocumentAnalysis["state"];
  code: string;
  attempts: number;
  deadline_at: number;
  next_attempt_at: number;
};

/** Reading a recovery state never starts or extends its bounded work. */
export function projectDocumentAnalysis(
  status: string,
  row: DocumentAnalysisRecovery | null,
  now = Date.now(),
): DocumentAnalysis {
  const expired =
    row?.state === "processing" &&
    ((row.attempts > 0 && row.deadline_at <= now) ||
      (row.attempts >= MAX_AUTO_ANALYSIS_ATTEMPTS &&
        row.next_attempt_at <= now));
  return documentAnalysis(
    status,
    expired ? "retryable" : row?.state,
    expired ? "retry_exhausted" : row?.code,
  );
}
