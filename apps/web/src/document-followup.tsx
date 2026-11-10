import { msg } from "./messages";
import { useCallback, useEffect, useState } from "react";
import { documentAnalysis } from "../../../packages/contracts/src/document-analysis";
import { api, isPublicPreview, type DocumentRecord } from "./api";

export function analysisOf(document: DocumentRecord) {
  // Old responses have no evidence that background processing was scheduled.
  // Preserve their useful manual recovery without promising an automatic retry.
  return document.analysis ?? documentAnalysis(document.status);
}

export function DocumentStatus({ document }: { document: DocumentRecord }) {
  const analysis = analysisOf(document);
  const labels = {
    processing: msg("Verification in progress"),
    ready: msg("PDF ready"),
    retryable: msg("Needs checking"),
    blocked: msg("PDF unavailable"),
  };
  return (
    <span className={`status status-document-${analysis.state}`}>
      {labels[analysis.state]}
    </span>
  );
}

/** Status reads only: scanning and its bounded recovery belong to the server. */
export function useDocumentFollowup(
  id: string | null,
  preview?: DocumentRecord,
) {
  const [document, setDocument] = useState<DocumentRecord>();
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<"network" | "paused" | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    setDocument((current) => (current?.id === id ? current : undefined));
    setIssue(null);
    if (!id) {
      setLoading(false);
      return;
    }
    if (isPublicPreview) {
      setDocument(preview);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let nextRead: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => {
      controller.abort();
      clearTimeout(nextRead);
      setLoading(false);
      setIssue("paused");
    }, 10 * 60_000);
    async function readStatus() {
      try {
        const current = await api<DocumentRecord>(
          `/documents/${encodeURIComponent(id!)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setDocument(current);
        setLoading(false);
        if (
          current.status !== "ready" &&
          current.analysis?.state === "processing"
        ) {
          nextRead = setTimeout(() => void readStatus(), 15_000);
        } else clearTimeout(deadline);
      } catch {
        if (controller.signal.aborted) return;
        clearTimeout(deadline);
        setLoading(false);
        setIssue("network");
      }
    }
    setLoading(true);
    void readStatus();
    return () => {
      controller.abort();
      clearTimeout(nextRead);
      clearTimeout(deadline);
    };
  }, [id, revision, preview]);
  return {
    document: document?.id === id ? document : undefined,
    loading,
    issue,
    refresh,
  };
}
