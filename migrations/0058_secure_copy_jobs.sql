-- Durable, bounded personal-copy jobs. A closed tab never loses accepted work;
-- a revoked or stale authentication cannot authorize the final personal copy.
ALTER TABLE secure_deposit_operations ADD COLUMN next_page INTEGER NOT NULL DEFAULT 1 CHECK(next_page BETWEEN 1 AND 101);
ALTER TABLE secure_deposit_operations ADD COLUMN original_ready INTEGER NOT NULL DEFAULT 0 CHECK(original_ready IN (0,1));
ALTER TABLE secure_deposit_operations ADD COLUMN auth_session_hash TEXT;
ALTER TABLE secure_distributions ADD COLUMN preparation_authority_json TEXT CHECK(preparation_authority_json IS NULL OR json_valid(preparation_authority_json));
CREATE TRIGGER secure_preparation_authority_immutable BEFORE UPDATE OF preparation_authority_json ON secure_distributions
 WHEN NEW.preparation_authority_json IS NOT OLD.preparation_authority_json
BEGIN
 SELECT RAISE(ABORT,'secure_preparation_authority_immutable');
END;
CREATE INDEX secure_deposit_pending ON secure_deposit_operations(status,lease_expires_at);
CREATE INDEX secure_event_activity_expiry ON secure_document_events(created_at,type);
CREATE TABLE secure_object_purges (
 scope TEXT NOT NULL CHECK(scope IN ('shared','personal','deposit')),
 resource_id TEXT NOT NULL, completed_at TEXT NOT NULL,
 PRIMARY KEY(scope,resource_id)
);
