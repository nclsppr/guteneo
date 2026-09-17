-- Public session references are independent of authentication token hashes.
ALTER TABLE browser_sessions ADD COLUMN public_id TEXT;
UPDATE browser_sessions SET public_id='session_' || lower(hex(randomblob(16))) WHERE public_id IS NULL;
CREATE UNIQUE INDEX browser_sessions_public_id ON browser_sessions(organization_id,user_id,public_id);
CREATE TRIGGER browser_session_public_id AFTER INSERT ON browser_sessions WHEN NEW.public_id IS NULL
BEGIN
  UPDATE browser_sessions SET public_id='session_' || lower(hex(randomblob(16))) WHERE token_hash=NEW.token_hash AND organization_id=NEW.organization_id AND user_id=NEW.user_id;
END;

-- SQLite serializes these checks with the change. Concurrent demotions cannot orphan a workspace.
CREATE TRIGGER memberships_keep_last_admin_update BEFORE UPDATE OF role ON memberships
WHEN OLD.role='admin' AND NEW.role!='admin' AND NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=OLD.organization_id AND role='admin' AND user_id!=OLD.user_id)
BEGIN
  SELECT RAISE(ABORT,'last_admin_required');
END;
CREATE TRIGGER memberships_keep_last_admin_delete BEFORE DELETE ON memberships
WHEN OLD.role='admin' AND NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=OLD.organization_id AND role='admin' AND user_id!=OLD.user_id)
BEGIN
  SELECT RAISE(ABORT,'last_admin_required');
END;
