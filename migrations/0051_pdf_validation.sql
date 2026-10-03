-- Diagnostic only: immutable originals, quarantine/send gates and approvals stay separate.
CREATE TABLE pdf_validations (
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 id TEXT NOT NULL,
 document_id TEXT NOT NULL,
 document_sha256 TEXT NOT NULL CHECK(length(document_sha256)=64),
 request_user_id TEXT NOT NULL REFERENCES users(id),
 profile TEXT NOT NULL CHECK(profile IN ('ua1','ua2','1b','2b','3b','4')),
 evidence TEXT NOT NULL CHECK(evidence IN ('production','simulation')),
 idempotency_key TEXT NOT NULL,
 period TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('processing','complete','error')),
 created_at TEXT NOT NULL,
 deadline_at TEXT NOT NULL,
 result_json TEXT CHECK(result_json IS NULL OR (json_valid(result_json) AND length(result_json)<=131072)),
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,idempotency_key),
 FOREIGN KEY(organization_id,document_id) REFERENCES documents(organization_id,id)
);
CREATE INDEX pdf_validation_document ON pdf_validations(organization_id,document_id,created_at DESC,id DESC);
CREATE INDEX pdf_validation_quota ON pdf_validations(organization_id,evidence,period,status);
CREATE TRIGGER pdf_validation_insert_guard BEFORE INSERT ON pdf_validations BEGIN
 SELECT RAISE(ABORT,'pdf_validation_authority') WHERE NEW.status<>'processing' OR NEW.result_json IS NOT NULL OR NOT EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN documents d ON d.organization_id=m.organization_id JOIN horizon_subscriptions h ON h.organization_id=m.organization_id WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.request_user_id AND m.role IN ('admin','supervisor','member') AND o.mode=NEW.evidence AND d.id=NEW.document_id AND d.sha256=NEW.document_sha256 AND d.status='ready' AND (d.access_owner_id IS NULL OR d.access_owner_id=NEW.request_user_id) AND h.evidence=NEW.evidence AND h.status IN ('active','cancelled') AND h.current_period_start<=NEW.created_at AND h.current_period_end>NEW.created_at);
 SELECT RAISE(ABORT,'pdf_validation_quota') WHERE (SELECT COUNT(*) FROM pdf_validations WHERE organization_id=NEW.organization_id AND evidence=NEW.evidence AND period=NEW.period)>=100;
 SELECT RAISE(ABORT,'pdf_validation_busy') WHERE (SELECT COUNT(*) FROM pdf_validations WHERE organization_id=NEW.organization_id AND status='processing' AND deadline_at>NEW.created_at)>=2;
END;
CREATE TRIGGER pdf_validation_immutable BEFORE UPDATE ON pdf_validations WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.id IS NOT OLD.id OR NEW.document_id IS NOT OLD.document_id OR NEW.document_sha256 IS NOT OLD.document_sha256 OR NEW.request_user_id IS NOT OLD.request_user_id OR NEW.profile IS NOT OLD.profile OR NEW.evidence IS NOT OLD.evidence OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.period IS NOT OLD.period OR NEW.created_at IS NOT OLD.created_at OR NEW.deadline_at IS NOT OLD.deadline_at OR OLD.status<>'processing' OR NEW.status NOT IN ('complete','error') OR (NEW.status='error' AND NEW.result_json IS NOT NULL) OR (NEW.status='complete' AND (NEW.result_json IS NULL OR json_extract(NEW.result_json,'$.id') IS NOT NEW.id OR json_extract(NEW.result_json,'$.documentId') IS NOT NEW.document_id OR json_extract(NEW.result_json,'$.sha256') IS NOT NEW.document_sha256 OR json_extract(NEW.result_json,'$.profile') IS NOT NEW.profile OR json_extract(NEW.result_json,'$.evidence') IS NOT NEW.evidence OR json_extract(NEW.result_json,'$.certification') IS NOT 0 OR json_type(NEW.result_json,'$.certification') IS NOT 'false' OR json_extract(NEW.result_json,'$.manualReviewRequired') IS NOT 1 OR json_type(NEW.result_json,'$.manualReviewRequired') IS NOT 'true' OR json_extract(NEW.result_json,'$.engine.version') IS NOT '1.30.2' OR json_extract(NEW.result_json,'$.status') NOT IN ('passed','failed') OR json_type(NEW.result_json,'$.status') IS NOT 'text' OR json_extract(NEW.result_json,'$.compliant') IS NOT (json_extract(NEW.result_json,'$.status')='passed'))) BEGIN SELECT RAISE(ABORT,'immutable_pdf_validation'); END;
