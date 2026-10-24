-- Public, sanitized GitHub browser evidence. No application identity or secrets.
CREATE TABLE production_e2e_reports (
  run_id TEXT NOT NULL,
  run_attempt INTEGER NOT NULL CHECK(run_attempt > 0),
  nonce TEXT NOT NULL UNIQUE CHECK(length(nonce)=64),
  token_id TEXT NOT NULL UNIQUE,
  report_sha256 TEXT NOT NULL CHECK(length(report_sha256)=64),
  completed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('passed','attention','unknown')),
  report_json TEXT NOT NULL CHECK(json_valid(report_json) AND length(report_json)<=16384),
  PRIMARY KEY(run_id,run_attempt)
);
CREATE INDEX production_e2e_recent ON production_e2e_reports(completed_at DESC);
CREATE TRIGGER production_e2e_immutable BEFORE UPDATE ON production_e2e_reports
BEGIN
  SELECT RAISE(ABORT,'PRODUCTION_E2E_REPORT_IMMUTABLE');
END;
