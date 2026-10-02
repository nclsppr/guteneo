-- Separate preparation, human approval and aggregate reporting. Existing members
-- become preparation-only operators; no supervisor permission is granted implicitly.
-- Deferred foreign keys preserve existing browser/OAuth rows while the parent table
-- is rebuilt under its original name. Native rows need explicit preservation because
-- their ON DELETE CASCADE actions run even while foreign-key checking is deferred.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE _roles_memberships AS SELECT * FROM memberships;
CREATE TABLE _roles_native_codes AS SELECT * FROM native_authorization_codes;
CREATE TABLE _roles_native_sessions AS SELECT * FROM native_sessions;
DROP TRIGGER memberships_keep_last_admin_update;
DROP TRIGGER memberships_keep_last_admin_delete;
DROP TABLE memberships;
CREATE TABLE memberships(
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('admin','supervisor','member','viewer')),
  created_at TEXT NOT NULL,
  supervisor_can_approve INTEGER NOT NULL DEFAULT 0 CHECK(supervisor_can_approve IN (0,1)),
  supervisor_can_report INTEGER NOT NULL DEFAULT 0 CHECK(supervisor_can_report IN (0,1)),
  PRIMARY KEY(organization_id,user_id),
  CHECK(role='supervisor' OR (supervisor_can_approve=0 AND supervisor_can_report=0))
);
INSERT INTO memberships(organization_id,user_id,role,created_at)
  SELECT organization_id,user_id,role,created_at FROM _roles_memberships;
INSERT INTO native_authorization_codes SELECT * FROM _roles_native_codes;
INSERT INTO native_sessions SELECT * FROM _roles_native_sessions;
DROP TABLE _roles_memberships;
DROP TABLE _roles_native_codes;
DROP TABLE _roles_native_sessions;
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

-- Automatic scan recovery stores the preparation role, never approval authority.
CREATE TABLE _roles_analysis AS SELECT * FROM document_analysis;
DROP TABLE document_analysis;
CREATE TABLE document_analysis (
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  request_user_id TEXT NOT NULL,
  request_role TEXT NOT NULL CHECK(request_role IN ('admin','supervisor','member')),
  state TEXT NOT NULL CHECK(state IN ('processing','ready','retryable','blocked')),
  code TEXT NOT NULL CHECK(code IN ('scan_pending','verified','scanner_unavailable','scanner_not_ready','scanner_busy','scanner_timeout','scan_incomplete','signatures_stale','service_not_configured','security_rejected','pdf_rejected','invalid_response','integrity_error','original_unavailable','access_revoked','retry_exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  deadline_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(organization_id,document_id),
  FOREIGN KEY(organization_id,document_id) REFERENCES documents(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX document_analysis_pending ON document_analysis(state,next_attempt_at);
INSERT INTO document_analysis SELECT * FROM _roles_analysis;
DROP TABLE _roles_analysis;

-- Both initial and replacement approvals check current membership in the same
-- transaction. No browser approval can outlive the reviewer's current authority
-- when a prepared dispatch is durably accepted. Already accepted work is retained.
CREATE TRIGGER workspace_approval_insert BEFORE INSERT ON approvals
BEGIN
 SELECT RAISE(ABORT,'approval_permission_required') WHERE NOT EXISTS(
   SELECT 1 FROM memberships m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.user_id
   AND (m.role='admin' OR (NEW.approval_kind='browser' AND m.role='supervisor' AND m.supervisor_can_approve=1))
 );
END;
CREATE TRIGGER workspace_approval_update BEFORE UPDATE ON approvals
BEGIN
 SELECT RAISE(ABORT,'approval_permission_required') WHERE NOT EXISTS(
   SELECT 1 FROM memberships m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.user_id
   AND (m.role='admin' OR (NEW.approval_kind='browser' AND m.role='supervisor' AND m.supervisor_can_approve=1))
 );
END;
-- Withdrawing and restoring a right cannot revive an old pending approval.
-- Accepted communications retain their original approval as historical evidence.
CREATE TRIGGER workspace_invalidate_pending_approvals AFTER UPDATE OF role,supervisor_can_approve ON memberships
WHEN OLD.role<>NEW.role OR OLD.supervisor_can_approve<>NEW.supervisor_can_approve
BEGIN
 DELETE FROM approvals WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id
 AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=approvals.organization_id AND d.id=approvals.dispatch_id AND d.status='prepared');
END;
CREATE TRIGGER workspace_remove_pending_approvals BEFORE DELETE ON memberships
BEGIN
 DELETE FROM approvals WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id
 AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=approvals.organization_id AND d.id=approvals.dispatch_id AND d.status='prepared');
END;
CREATE TRIGGER workspace_approval_acceptance BEFORE UPDATE OF status ON dispatches
WHEN OLD.status='prepared' AND NEW.status='queued'
BEGIN
 SELECT RAISE(ABORT,'approval_permission_required') WHERE EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.fingerprint=NEW.fingerprint AND a.expires_at>NEW.updated_at) AND NOT EXISTS(
   SELECT 1 FROM approvals a JOIN memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id
   WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.fingerprint=NEW.fingerprint AND a.expires_at>NEW.updated_at
   AND (m.role='admin' OR (a.approval_kind='browser' AND m.role='supervisor' AND m.supervisor_can_approve=1))
 );
END;

DROP TRIGGER postal_transfer_consent_guard;
CREATE TRIGGER postal_transfer_consent_guard BEFORE INSERT ON postal_transfer_consents
BEGIN
 SELECT RAISE(ABORT,'postal_transfer_consent_invalid') WHERE NOT EXISTS(
   SELECT 1 FROM postal_preflights p JOIN memberships m ON m.organization_id=p.organization_id AND m.user_id=NEW.user_id
   WHERE p.id=NEW.preflight_id AND p.organization_id=NEW.organization_id AND p.request_hash=NEW.fingerprint
   AND p.status='review_required' AND p.transfer_status='not_started' AND p.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
   AND (m.role='admin' OR (NEW.consent_kind='browser' AND m.role='supervisor' AND m.supervisor_can_approve=1))
 );
END;
PRAGMA defer_foreign_keys=OFF;
