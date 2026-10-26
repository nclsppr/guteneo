-- Additive App-only staging. Existing binary/inline rows keep their transport.
ALTER TABLE private_document_uploads ADD COLUMN transport TEXT NOT NULL DEFAULT 'binary' CHECK(transport IN ('binary','app'));
CREATE TRIGGER private_upload_transport_immutable BEFORE UPDATE OF transport ON private_document_uploads
WHEN NEW.transport IS NOT OLD.transport
BEGIN
 SELECT RAISE(ABORT,'private_upload_immutable');
END;
CREATE TABLE mcp_app_document_uploads (
 organization_id TEXT NOT NULL,
 upload_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('receiving','finalizing','complete','cancelled','expired','rejected','unknown')),
 part_size INTEGER NOT NULL CHECK(part_size=262144),
 part_count INTEGER NOT NULL CHECK(part_count BETWEEN 1 AND 40),
 reserved_bytes INTEGER NOT NULL CHECK(reserved_bytes BETWEEN 20 AND 10485760),
 received_bytes INTEGER NOT NULL DEFAULT 0 CHECK(received_bytes BETWEEN 0 AND reserved_bytes),
 call_count INTEGER NOT NULL CHECK(call_count BETWEEN 1 AND 64),
 writer_token TEXT,
 writer_expires_at TEXT,
 writer_part_index INTEGER CHECK(writer_part_index BETWEEN 0 AND 39),
 error_code TEXT,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 cleanup_not_before TEXT NOT NULL,
 next_cleanup_at TEXT NOT NULL,
 cleaned_at TEXT,
 PRIMARY KEY(organization_id,upload_id),
 FOREIGN KEY(organization_id,upload_id) REFERENCES private_document_uploads(organization_id,id),
 FOREIGN KEY(user_id) REFERENCES users(id),
 CHECK((writer_token IS NULL AND writer_expires_at IS NULL AND writer_part_index IS NULL) OR (writer_token IS NOT NULL AND writer_expires_at IS NOT NULL AND state IN ('receiving','finalizing')))
);
CREATE INDEX mcp_app_upload_admission ON mcp_app_document_uploads(organization_id,user_id,state,expires_at);
CREATE INDEX mcp_app_upload_cleanup ON mcp_app_document_uploads(next_cleanup_at) WHERE cleaned_at IS NULL;
CREATE INDEX mcp_app_upload_finalizers ON mcp_app_document_uploads(state,writer_expires_at) WHERE state='finalizing';
CREATE TABLE mcp_app_document_upload_parts (
 organization_id TEXT NOT NULL,
 upload_id TEXT NOT NULL,
 part_index INTEGER NOT NULL CHECK(part_index BETWEEN 0 AND 39),
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 262144),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 object_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('pending','confirmed','unknown')),
 storage_settled INTEGER NOT NULL DEFAULT 0 CHECK(storage_settled IN (0,1)),
 put_token TEXT NOT NULL,
 created_at TEXT NOT NULL,
 confirmed_at TEXT,
 PRIMARY KEY(organization_id,upload_id,part_index),
 FOREIGN KEY(organization_id,upload_id) REFERENCES mcp_app_document_uploads(organization_id,upload_id)
);
CREATE TRIGGER mcp_app_upload_metadata_immutable BEFORE UPDATE ON mcp_app_document_uploads
WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.upload_id IS NOT OLD.upload_id OR NEW.user_id IS NOT OLD.user_id OR NEW.part_size IS NOT OLD.part_size OR NEW.part_count IS NOT OLD.part_count OR NEW.reserved_bytes IS NOT OLD.reserved_bytes OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at IS NOT OLD.created_at OR NEW.call_count<OLD.call_count
BEGIN
 SELECT RAISE(ABORT,'mcp_app_upload_immutable');
END;
CREATE TRIGGER mcp_app_upload_part_immutable BEFORE UPDATE ON mcp_app_document_upload_parts
WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.upload_id IS NOT OLD.upload_id OR NEW.part_index IS NOT OLD.part_index OR NEW.byte_length IS NOT OLD.byte_length OR NEW.sha256 IS NOT OLD.sha256 OR NEW.object_key IS NOT OLD.object_key OR NEW.put_token IS NOT OLD.put_token OR NEW.created_at IS NOT OLD.created_at OR NEW.storage_settled<OLD.storage_settled OR (OLD.state='confirmed' AND NEW.state<>'confirmed')
BEGIN
 SELECT RAISE(ABORT,'mcp_app_upload_part_immutable');
END;
