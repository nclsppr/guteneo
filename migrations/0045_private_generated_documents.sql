-- Generated documents are private to their creator; legacy exact imports keep their existing organization visibility.
ALTER TABLE documents ADD COLUMN access_owner_id TEXT REFERENCES users(id);
DROP INDEX documents_retained_hash;
CREATE UNIQUE INDEX documents_retained_hash ON documents(organization_id,sha256) WHERE status<>'purged' AND access_owner_id IS NULL;
CREATE UNIQUE INDEX documents_private_retained_hash ON documents(organization_id,sha256,access_owner_id) WHERE status<>'purged' AND access_owner_id IS NOT NULL;
CREATE TRIGGER immutable_document_access BEFORE UPDATE OF access_owner_id ON documents WHEN NEW.access_owner_id IS NOT OLD.access_owner_id BEGIN SELECT RAISE(ABORT,'immutable_document_access'); END;
ALTER TABLE generation_records ADD COLUMN data_purged_at TEXT;
DROP TRIGGER immutable_generation_input;
CREATE TRIGGER immutable_generation_input BEFORE UPDATE ON generation_records WHEN NEW.organization_id<>OLD.organization_id OR NEW.job_id<>OLD.job_id OR NEW.record_id<>OLD.record_id OR ((NEW.input_json<>OLD.input_json OR (OLD.artifact_key IS NOT NULL AND NEW.artifact_key IS NOT OLD.artifact_key)) AND NOT(OLD.data_purged_at IS NULL AND NEW.data_purged_at IS NOT NULL AND NEW.input_json='{}' AND NEW.artifact_key IS NULL AND OLD.created_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days') AND EXISTS(SELECT 1 FROM generation_jobs j WHERE j.organization_id=OLD.organization_id AND j.id=OLD.job_id AND j.state NOT IN ('queued','running')))) OR NEW.input_hash<>OLD.input_hash OR (OLD.artifact_hash IS NOT NULL AND NEW.artifact_hash IS NOT OLD.artifact_hash) OR (OLD.document_id IS NOT NULL AND NEW.document_id IS NOT OLD.document_id) BEGIN SELECT RAISE(ABORT,'immutable_generation_input'); END;
