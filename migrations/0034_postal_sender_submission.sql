-- The existing authority basis means authenticated administrator authority,
-- never a physical-address check or a fresh human consent asserted by an assistant.
-- Existing immutable declarations originated in the authenticated browser form.
ALTER TABLE postal_sender_declarations ADD COLUMN submission_origin TEXT NOT NULL DEFAULT 'browser_administrator_declaration' CHECK(submission_origin IN ('browser_administrator_declaration','oauth_administrator_submission'));
ALTER TABLE postal_sender_declarations ADD COLUMN oauth_client_id TEXT;
-- Historical authority snapshot, deliberately not a foreign key to the mutable
-- connection: the same live connection may subsequently bind another tenant.
-- organization_id/user_id above remain the immutable tenant and actor at submission.
ALTER TABLE postal_sender_declarations ADD COLUMN oauth_connection_id_snapshot TEXT;
ALTER TABLE postal_sender_declarations ADD COLUMN oauth_issuer TEXT;
ALTER TABLE postal_sender_declarations ADD COLUMN oauth_authorization_revision INTEGER CHECK(oauth_authorization_revision IS NULL OR (typeof(oauth_authorization_revision)='integer' AND oauth_authorization_revision>=0));
CREATE TRIGGER validate_postal_sender_submission BEFORE INSERT ON postal_sender_declarations
WHEN (NEW.submission_origin='browser_administrator_declaration' AND (NEW.oauth_client_id IS NOT NULL OR NEW.oauth_connection_id_snapshot IS NOT NULL OR NEW.oauth_issuer IS NOT NULL OR NEW.oauth_authorization_revision IS NOT NULL))
  OR (NEW.submission_origin='oauth_administrator_submission' AND (NEW.oauth_client_id IS NULL OR length(NEW.oauth_client_id)=0 OR NEW.oauth_connection_id_snapshot IS NULL OR NEW.oauth_issuer IS NULL OR NEW.oauth_authorization_revision IS NULL OR NOT EXISTS(SELECT 1 FROM authorized_connections c JOIN connection_tool_observations o ON o.connection_id=c.id AND o.organization_id=c.organization_id AND o.user_id=c.user_id WHERE c.id=NEW.oauth_connection_id_snapshot AND c.issuer=NEW.oauth_issuer AND c.organization_id=NEW.organization_id AND c.user_id=NEW.user_id AND c.client_id=NEW.oauth_client_id AND c.status='active' AND o.authorization_revision=NEW.oauth_authorization_revision)))
BEGIN
  SELECT RAISE(ABORT,'invalid_postal_sender_submission');
END;
