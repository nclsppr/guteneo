-- Durable analysis is separate from send authority and manual retry quotas.
-- Original document status remains quarantined until exact-byte proof is committed.
CREATE TABLE document_analysis (
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  request_user_id TEXT NOT NULL,
  request_role TEXT NOT NULL CHECK(request_role IN ('admin','member')),
  state TEXT NOT NULL CHECK(state IN ('processing','ready','retryable','blocked')),
  code TEXT NOT NULL CHECK(code IN ('scan_pending','verified','scanner_unavailable','scanner_not_ready','scanner_busy','scanner_timeout','scan_incomplete','signatures_stale','service_not_configured','security_rejected','pdf_rejected','invalid_response','integrity_error','original_unavailable','access_revoked','retry_exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  deadline_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(organization_id,document_id),
  FOREIGN KEY(organization_id,document_id) REFERENCES documents(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX document_analysis_pending ON document_analysis(state,next_attempt_at);
