-- Private binary transport; this ledger grants no approval or send authority.
-- Connection identifiers are immutable snapshots, not FKs that prevent revocation/deletion.
CREATE TABLE private_document_uploads (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 client_id TEXT NOT NULL,
 connection_id_snapshot TEXT NOT NULL,
 authorization_revision INTEGER NOT NULL CHECK(authorization_revision>=0),
 issuer TEXT NOT NULL,
 token_issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 token_issued_at INTEGER NOT NULL,
 token_expires_at INTEGER NOT NULL,
 member_role TEXT NOT NULL CHECK(member_role IN ('admin','supervisor','member')),
 supervisor_can_approve INTEGER NOT NULL CHECK(supervisor_can_approve IN (0,1)),
 supervisor_can_report INTEGER NOT NULL CHECK(supervisor_can_report IN (0,1)),
 authentication_policy TEXT NOT NULL CHECK(authentication_policy IN ('verified_email','verified_email_and_mfa')),
 verified_account INTEGER NOT NULL CHECK(verified_account IN (0,1)),
 mfa INTEGER NOT NULL CHECK(mfa IN (0,1)),
 mode TEXT NOT NULL CHECK(mode IN ('simulation','production')),
 idempotency_key TEXT NOT NULL,
 file_name TEXT NOT NULL,
 expected_size INTEGER NOT NULL CHECK(expected_size BETWEEN 20 AND 10485760),
 expected_sha256 TEXT NOT NULL CHECK(length(expected_sha256)=64),
 capability_hash TEXT CHECK(capability_hash IS NULL OR length(capability_hash)=64),
 state TEXT NOT NULL CHECK(state IN ('reserved','uploading','complete','rejected','unknown')),
 planned_document_id TEXT NOT NULL,
 document_id TEXT,
 lease_token TEXT,
 lease_expires_at TEXT,
 error_code TEXT,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,idempotency_key),
 FOREIGN KEY(organization_id,document_id) REFERENCES documents(organization_id,id),
 CHECK((state='reserved' AND capability_hash IS NOT NULL AND lease_token IS NULL AND lease_expires_at IS NULL) OR (state<>'reserved' AND capability_hash IS NULL)),
 CHECK((state='uploading' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR (state<>'uploading' AND lease_token IS NULL AND lease_expires_at IS NULL)),
 CHECK((state='complete' AND document_id IS NOT NULL AND error_code IS NULL) OR (state<>'complete' AND document_id IS NULL))
);
CREATE INDEX private_upload_expiry ON private_document_uploads(organization_id,state,expires_at);
CREATE TRIGGER private_upload_token_issuer_immutable BEFORE UPDATE OF token_issuer ON private_document_uploads
BEGIN
 SELECT RAISE(ABORT,'private_upload_immutable');
END;
CREATE TRIGGER private_upload_immutable BEFORE UPDATE ON private_document_uploads
WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.user_id IS NOT OLD.user_id OR NEW.client_id IS NOT OLD.client_id OR NEW.connection_id_snapshot IS NOT OLD.connection_id_snapshot OR NEW.authorization_revision IS NOT OLD.authorization_revision OR NEW.issuer IS NOT OLD.issuer OR NEW.subject IS NOT OLD.subject OR NEW.token_issued_at IS NOT OLD.token_issued_at OR NEW.token_expires_at IS NOT OLD.token_expires_at OR NEW.member_role IS NOT OLD.member_role OR NEW.supervisor_can_approve IS NOT OLD.supervisor_can_approve OR NEW.supervisor_can_report IS NOT OLD.supervisor_can_report OR NEW.authentication_policy IS NOT OLD.authentication_policy OR NEW.verified_account IS NOT OLD.verified_account OR NEW.mfa IS NOT OLD.mfa OR NEW.mode IS NOT OLD.mode OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.file_name IS NOT OLD.file_name OR NEW.expected_size IS NOT OLD.expected_size OR NEW.expected_sha256 IS NOT OLD.expected_sha256 OR NEW.planned_document_id IS NOT OLD.planned_document_id OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at IS NOT OLD.created_at OR (OLD.state IN ('complete','rejected') AND NEW.state IS NOT OLD.state) OR (OLD.state='unknown' AND NEW.state NOT IN ('unknown','complete')) OR (OLD.state='uploading' AND NEW.state NOT IN ('uploading','complete','rejected','unknown')) OR (OLD.state='reserved' AND NEW.state NOT IN ('reserved','uploading','rejected')) OR (OLD.document_id IS NOT NULL AND NEW.document_id IS NOT OLD.document_id)
BEGIN
 SELECT RAISE(ABORT,'private_upload_immutable');
END;
