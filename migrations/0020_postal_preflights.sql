-- Server-owned exact-byte postal evidence. A render consumes the existing daily
-- render allowance exactly once on insertion; this migration grants no quota.
CREATE TABLE postal_preflights (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  document_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256)=64),
  sender_id TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  recipient_json TEXT NOT NULL CHECK(json_valid(recipient_json)),
  options_json TEXT NOT NULL CHECK(json_valid(options_json)),
  profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  expected_address TEXT NOT NULL,
  ceiling_minor INTEGER NOT NULL CHECK(ceiling_minor>=0),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','review_required','blocked','failed')),
  report_json TEXT CHECK(report_json IS NULL OR json_valid(report_json)),
  failure_code TEXT,
  transfer_status TEXT NOT NULL DEFAULT 'not_started' CHECK(transfer_status IN ('not_started','preparing','prepared','unknown')),
  provider_draft_id TEXT,
  transfer_started_at TEXT,
  budget_day TEXT NOT NULL,
  processing_until TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,idempotency_key),
  FOREIGN KEY(organization_id,document_id) REFERENCES documents(organization_id,id),
  FOREIGN KEY(organization_id,sender_id) REFERENCES senders(organization_id,id),
  FOREIGN KEY(organization_id,provider_draft_id) REFERENCES provider_drafts(organization_id,id)
);
CREATE INDEX postal_preflights_org_time ON postal_preflights(organization_id,created_at DESC,id DESC);
CREATE INDEX postal_preflights_expiry ON postal_preflights(expires_at,id) WHERE report_json IS NOT NULL;
CREATE UNIQUE INDEX postal_preflights_draft ON postal_preflights(provider_draft_id) WHERE provider_draft_id IS NOT NULL;
CREATE TABLE postal_transfer_consents (
  preflight_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  fingerprint TEXT NOT NULL,
  reviewed INTEGER NOT NULL CHECK(reviewed=1),
  transfer_only INTEGER NOT NULL CHECK(transfer_only=1),
  created_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,preflight_id) REFERENCES postal_preflights(organization_id,id)
);
CREATE TRIGGER postal_preflight_insert_guard BEFORE INSERT ON postal_preflights
BEGIN
  SELECT RAISE(ABORT,'postal_document_proof_required') WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.document_id AND d.sha256=NEW.document_sha256 AND d.status='ready' AND d.pages>0 AND d.size<=8000000 AND EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=d.organization_id AND a.action='document.scan_verified' AND a.resource_id=d.sha256));
  SELECT RAISE(ABORT,'postal_sender_required') WHERE NOT EXISTS(SELECT 1 FROM senders s WHERE s.organization_id=NEW.organization_id AND s.id=NEW.sender_id AND s.channel='postal' AND s.status='verified' AND s.mode='production' AND s.address=NEW.sender_address);
  SELECT RAISE(ABORT,'postal_render_quota_exceeded') WHERE COALESCE((SELECT renders FROM content_usage WHERE organization_id=NEW.organization_id AND day=NEW.budget_day),0)+1>COALESCE((SELECT renders_per_day FROM content_limits WHERE organization_id=NEW.organization_id),0);
  SELECT RAISE(ABORT,'postal_initial_state_invalid') WHERE NEW.status<>'processing' OR NEW.report_json IS NOT NULL OR NEW.transfer_status<>'not_started' OR NEW.provider_draft_id IS NOT NULL OR NEW.transfer_started_at IS NOT NULL;
END;
CREATE TRIGGER postal_preflight_reserve_render AFTER INSERT ON postal_preflights
BEGIN
  INSERT INTO content_usage(organization_id,day,uploads,bytes,renders) VALUES(NEW.organization_id,NEW.budget_day,0,0,1) ON CONFLICT(organization_id,day) DO UPDATE SET renders=renders+1;
END;
CREATE TRIGGER immutable_postal_preflight BEFORE UPDATE ON postal_preflights
WHEN NEW.organization_id<>OLD.organization_id OR NEW.user_id<>OLD.user_id OR NEW.document_id<>OLD.document_id OR NEW.document_sha256<>OLD.document_sha256 OR NEW.sender_id<>OLD.sender_id OR NEW.sender_address<>OLD.sender_address OR NEW.recipient_json<>OLD.recipient_json OR NEW.options_json<>OLD.options_json OR NEW.profile_json<>OLD.profile_json OR NEW.expected_address<>OLD.expected_address OR NEW.ceiling_minor<>OLD.ceiling_minor OR NEW.request_hash<>OLD.request_hash OR NEW.input_hash<>OLD.input_hash OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.budget_day<>OLD.budget_day OR NEW.processing_until<>OLD.processing_until OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR (OLD.report_json IS NOT NULL AND NEW.report_json IS NOT OLD.report_json AND NOT (NEW.report_json IS NULL AND (OLD.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=OLD.organization_id AND d.id=OLD.document_id AND d.status='purged')))) OR (OLD.provider_draft_id IS NOT NULL AND NEW.provider_draft_id IS NOT OLD.provider_draft_id) OR (OLD.transfer_started_at IS NOT NULL AND NEW.transfer_started_at IS NOT OLD.transfer_started_at) OR (OLD.status<>'processing' AND NEW.status<>OLD.status)
BEGIN
  SELECT RAISE(ABORT,'immutable_postal_preflight');
END;
CREATE TRIGGER immutable_postal_transfer_consent BEFORE UPDATE ON postal_transfer_consents
BEGIN
  SELECT RAISE(ABORT,'immutable_postal_transfer_consent');
END;
CREATE TRIGGER postal_transfer_consent_guard BEFORE INSERT ON postal_transfer_consents
BEGIN
  SELECT RAISE(ABORT,'postal_transfer_consent_invalid') WHERE NOT EXISTS(SELECT 1 FROM postal_preflights p JOIN memberships m ON m.organization_id=p.organization_id AND m.user_id=NEW.user_id WHERE p.id=NEW.preflight_id AND p.organization_id=NEW.organization_id AND p.request_hash=NEW.fingerprint AND p.status='review_required' AND p.transfer_status='not_started' AND p.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND m.role IN ('admin','member'));
END;
CREATE TRIGGER postal_transfer_start_guard BEFORE UPDATE OF transfer_status ON postal_preflights
WHEN NEW.transfer_status='preparing' AND OLD.transfer_status='not_started'
BEGIN
  SELECT RAISE(ABORT,'postal_transfer_consent_required') WHERE NOT EXISTS(SELECT 1 FROM postal_transfer_consents c WHERE c.organization_id=NEW.organization_id AND c.preflight_id=NEW.id AND c.fingerprint=NEW.request_hash AND c.reviewed=1 AND c.transfer_only=1);
  SELECT RAISE(ABORT,'postal_preflight_required') WHERE NEW.status<>'review_required' OR NEW.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NEW.report_json IS NULL OR json_extract(NEW.report_json,'$.status') IS NOT 'review_required' OR json_extract(NEW.report_json,'$.canSend') IS NOT 0 OR json_extract(NEW.report_json,'$.sha256') IS NOT NEW.document_sha256 OR json_extract(NEW.report_json,'$.rendering.complete') IS NOT 1;
  SELECT RAISE(ABORT,'postal_document_proof_required') WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.document_id AND d.sha256=NEW.document_sha256 AND d.status='ready' AND EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=d.organization_id AND a.action='document.scan_verified' AND a.resource_id=d.sha256));
END;
CREATE TRIGGER postal_transfer_transition_guard BEFORE UPDATE OF transfer_status ON postal_preflights
WHEN NEW.transfer_status<>OLD.transfer_status AND NOT ((OLD.transfer_status='not_started' AND NEW.transfer_status='preparing') OR (OLD.transfer_status='preparing' AND NEW.transfer_status IN ('prepared','unknown')))
BEGIN
  SELECT RAISE(ABORT,'postal_transfer_transition_invalid');
END;
CREATE VIEW valid_postal_draft_reviews AS SELECT p.organization_id,p.id AS preflight_id,p.provider_draft_id,p.document_id,p.document_sha256,p.profile_json,p.expires_at FROM postal_preflights p JOIN postal_transfer_consents c ON c.organization_id=p.organization_id AND c.preflight_id=p.id AND c.fingerprint=p.request_hash JOIN provider_drafts pd ON pd.organization_id=p.organization_id AND pd.id=p.provider_draft_id JOIN documents d ON d.organization_id=p.organization_id AND d.id=p.document_id JOIN senders s ON s.organization_id=p.organization_id AND s.id=p.sender_id WHERE p.status='review_required' AND p.transfer_status='prepared' AND p.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND c.reviewed=1 AND c.transfer_only=1 AND pd.status='prepared' AND pd.document_id=p.document_id AND pd.document_sha256=p.document_sha256 AND pd.sender_id=p.sender_id AND pd.sender_address=p.sender_address AND pd.recipient_json=p.recipient_json AND pd.expected_address=p.expected_address AND pd.options_json=p.options_json AND pd.ceiling_minor=p.ceiling_minor AND d.status='ready' AND d.sha256=p.document_sha256 AND s.status='verified' AND s.mode='production' AND s.address=p.sender_address AND json_extract(p.report_json,'$.status')='review_required' AND json_extract(p.report_json,'$.sha256')=p.document_sha256 AND json_extract(p.report_json,'$.canSend')=0 AND json_extract(p.report_json,'$.rendering.complete')=1 AND EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=p.organization_id AND a.action='document.scan_verified' AND a.resource_id=p.document_sha256);
CREATE TRIGGER require_postal_review_on_commit BEFORE UPDATE OF status ON dispatches
WHEN NEW.mode='production' AND NEW.channel='postal' AND NEW.status IN ('queued','submitting') AND NEW.status<>OLD.status
BEGIN
  SELECT RAISE(ABORT,'postal_preflight_required') WHERE NOT EXISTS(SELECT 1 FROM valid_postal_draft_reviews p JOIN live_delivery_quotes q ON q.organization_id=p.organization_id AND q.provider_draft_id=p.provider_draft_id WHERE p.organization_id=NEW.organization_id AND q.dispatch_id=NEW.id AND p.document_id=NEW.document_id AND p.document_sha256=json_extract(q.input_json,'$.documentSha256') AND json_extract(p.profile_json,'$.accountId')=q.account_id AND json_extract(p.profile_json,'$.version')='pingen-2026-09-17-v1');
END;
