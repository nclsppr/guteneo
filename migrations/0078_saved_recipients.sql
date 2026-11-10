-- Workspace address-book entries are mutable; prepared dispatches retain exact snapshots.
CREATE TABLE saved_recipients (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 160),
 channel TEXT NOT NULL CHECK(channel IN ('fax','email','postal')),
 recipient_json TEXT NOT NULL CHECK(json_valid(recipient_json)),
 revision INTEGER NOT NULL CHECK(revision>0),
 request_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,request_key)
);
CREATE INDEX saved_recipients_page ON saved_recipients(organization_id,id);
CREATE TRIGGER saved_recipient_revision BEFORE UPDATE ON saved_recipients
WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at OR NEW.request_key IS NOT OLD.request_key OR NEW.request_hash IS NOT OLD.request_hash OR NEW.revision<>OLD.revision+1
BEGIN
 SELECT RAISE(ABORT,'saved_recipient_revision_required');
END;
CREATE TRIGGER saved_recipient_authority_insert BEFORE INSERT ON saved_recipients
WHEN NOT EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.created_by AND m.role IN ('admin','supervisor','member') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests r WHERE r.user_id=m.user_id AND r.status IN ('processing','completed')))
BEGIN
 SELECT RAISE(ABORT,'saved_recipient_authority_required');
END;
CREATE TRIGGER saved_recipient_authority_update BEFORE UPDATE ON saved_recipients
WHEN NOT EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.updated_by AND m.role IN ('admin','supervisor','member') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests r WHERE r.user_id=m.user_id AND r.status IN ('processing','completed')))
BEGIN
 SELECT RAISE(ABORT,'saved_recipient_authority_required');
END;
