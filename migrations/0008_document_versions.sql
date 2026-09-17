-- Preserve immutable historical IDs while deduplicating only versions that are still retained.
-- D1 applies each migration atomically; all child references below keep the same documents table/IDs.
PRAGMA defer_foreign_keys = ON;
DROP TRIGGER dispatch_document_ready;
DROP TRIGGER acceptance_readiness;
CREATE TABLE documents_versions(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0), pages INTEGER NOT NULL CHECK(pages>=0 AND (status<>'ready' OR pages>0)), status TEXT NOT NULL CHECK(status IN ('ready','quarantined','rejected','purged')), source TEXT NOT NULL CHECK(source IN ('import','render')), storage_key TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(organization_id,id));
INSERT INTO documents_versions SELECT * FROM documents;
DROP TABLE documents;
ALTER TABLE documents_versions RENAME TO documents;
CREATE UNIQUE INDEX documents_retained_hash ON documents(organization_id,sha256) WHERE status<>'purged';
CREATE INDEX documents_retention ON documents(status,created_at,id);
CREATE TRIGGER immutable_document BEFORE UPDATE ON documents WHEN NEW.organization_id<>OLD.organization_id OR NEW.sha256<>OLD.sha256 OR NEW.storage_key<>OLD.storage_key OR NEW.size<>OLD.size OR (NEW.pages<>OLD.pages AND NOT(OLD.status='quarantined' AND OLD.pages=0 AND NEW.status='ready' AND NEW.pages>0)) OR NEW.source<>OLD.source OR (OLD.status='purged' AND NEW.status<>'purged') BEGIN SELECT RAISE(ABORT,'immutable_document'); END;
CREATE TRIGGER dispatch_document_ready BEFORE INSERT ON dispatches WHEN NEW.document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM documents WHERE organization_id=NEW.organization_id AND id=NEW.document_id AND status='ready') BEGIN SELECT RAISE(ABORT,'document_not_ready'); END;
CREATE TRIGGER acceptance_readiness BEFORE UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' BEGIN
 SELECT CASE WHEN NEW.document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM documents WHERE organization_id=NEW.organization_id AND id=NEW.document_id AND status='ready') THEN RAISE(ABORT,'document_not_ready') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM senders WHERE organization_id=NEW.organization_id AND id=NEW.sender_id AND channel=NEW.channel AND mode=NEW.mode AND status='verified') THEN RAISE(ABORT,'sender_not_ready') END;
 SELECT CASE WHEN NEW.channel='email' AND EXISTS(SELECT 1 FROM suppressions WHERE organization_id=NEW.organization_id AND email=json_extract(NEW.recipient_json,'$.email')) THEN RAISE(ABORT,'recipient_suppressed') END;
END;
-- Check the reconstructed references before clearing SQLite's deferred table-drop bookkeeping.
CREATE TABLE document_migration_check(violations INTEGER NOT NULL CHECK(violations=0));
INSERT INTO document_migration_check SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE document_migration_check;
PRAGMA defer_foreign_keys = OFF;
