-- Future spending is a distinct, revocable browser-human authority; no browser
-- or expert approval is fabricated when the scheduler later accepts a command.
CREATE TABLE dispatch_schedules (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 source_dispatch_id TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 mode TEXT NOT NULL CHECK(mode IN ('simulation','production')),
 channel TEXT NOT NULL CHECK(channel IN ('fax','email')),
 snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64),
 execute_at TEXT NOT NULL,
 release_until TEXT NOT NULL,
 max_total_minor INTEGER NOT NULL CHECK(max_total_minor BETWEEN 1 AND 1000000),
 request_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','approved','releasing','released','blocked','cancelled','unknown')),
 revision INTEGER NOT NULL CHECK(revision>0),
 error_code TEXT,
 release_started_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,request_key),
 FOREIGN KEY(organization_id,source_dispatch_id) REFERENCES dispatches(organization_id,id),
 CHECK(release_until>execute_at)
);
CREATE INDEX dispatch_schedules_due ON dispatch_schedules(status,execute_at,id);
CREATE INDEX dispatch_schedules_tenant ON dispatch_schedules(organization_id,created_at,id);
CREATE UNIQUE INDEX dispatch_schedule_active_source ON dispatch_schedules(organization_id,source_dispatch_id) WHERE status IN ('draft','approved','releasing','unknown');
CREATE TABLE dispatch_schedule_approvals (
 schedule_id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 approval_kind TEXT NOT NULL CHECK(approval_kind='future_browser'),
 browser_session_hash TEXT NOT NULL CHECK(length(browser_session_hash)=64),
 snapshot_hash TEXT NOT NULL,
 recipient_requested INTEGER NOT NULL CHECK(recipient_requested IN (0,1)),
 created_at TEXT NOT NULL,
 revoked_at TEXT,
 FOREIGN KEY(organization_id,schedule_id) REFERENCES dispatch_schedules(organization_id,id)
);
CREATE TABLE dispatch_schedule_releases (
 schedule_id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 dispatch_id TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,schedule_id) REFERENCES dispatch_schedules(organization_id,id),
 FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id)
);
CREATE TRIGGER dispatch_schedule_immutable BEFORE UPDATE ON dispatch_schedules
WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.source_dispatch_id IS NOT OLD.source_dispatch_id OR NEW.created_by IS NOT OLD.created_by OR NEW.mode IS NOT OLD.mode OR NEW.channel IS NOT OLD.channel OR NEW.snapshot_hash IS NOT OLD.snapshot_hash OR NEW.execute_at IS NOT OLD.execute_at OR NEW.release_until IS NOT OLD.release_until OR NEW.max_total_minor IS NOT OLD.max_total_minor OR NEW.request_key IS NOT OLD.request_key OR NEW.request_hash IS NOT OLD.request_hash OR NEW.created_at IS NOT OLD.created_at OR NEW.revision<>OLD.revision+1 OR (OLD.status IN ('released','cancelled','blocked') AND NEW.status<>OLD.status) OR (OLD.status='unknown' AND NEW.status NOT IN ('unknown','released','cancelled'))
BEGIN
 SELECT RAISE(ABORT,'dispatch_schedule_immutable');
END;
CREATE TRIGGER dispatch_schedule_approval_immutable BEFORE UPDATE ON dispatch_schedule_approvals
WHEN NEW.schedule_id IS NOT OLD.schedule_id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.user_id IS NOT OLD.user_id OR NEW.approval_kind IS NOT OLD.approval_kind OR NEW.browser_session_hash IS NOT OLD.browser_session_hash OR NEW.snapshot_hash IS NOT OLD.snapshot_hash OR NEW.recipient_requested IS NOT OLD.recipient_requested OR NEW.created_at IS NOT OLD.created_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
BEGIN
 SELECT RAISE(ABORT,'future_approval_immutable');
END;
CREATE TRIGGER dispatch_schedule_approval_retained BEFORE DELETE ON dispatch_schedule_approvals
BEGIN
 SELECT RAISE(ABORT,'future_approval_retained');
END;
CREATE TRIGGER dispatch_schedule_release_immutable BEFORE UPDATE ON dispatch_schedule_releases
BEGIN
 SELECT RAISE(ABORT,'scheduled_release_immutable');
END;
CREATE TRIGGER dispatch_schedule_release_retained BEFORE DELETE ON dispatch_schedule_releases
BEGIN
 SELECT RAISE(ABORT,'scheduled_release_retained');
END;
CREATE TRIGGER dispatch_schedule_approval_guard BEFORE INSERT ON dispatch_schedule_approvals
BEGIN
 SELECT RAISE(ABORT,'future_browser_approval_required') WHERE NOT EXISTS(
  SELECT 1 FROM dispatch_schedules s JOIN browser_sessions b ON b.token_hash=NEW.browser_session_hash AND b.organization_id=s.organization_id AND b.user_id=NEW.user_id JOIN memberships m ON m.organization_id=b.organization_id AND m.user_id=b.user_id JOIN dispatches d ON d.organization_id=s.organization_id AND d.id=s.source_dispatch_id
  WHERE s.id=NEW.schedule_id AND s.organization_id=NEW.organization_id AND s.status='draft' AND s.snapshot_hash=NEW.snapshot_hash
  AND s.release_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND b.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (s.mode='simulation' OR b.is_development=0)
  AND (m.role='admin' OR (m.role='supervisor' AND m.supervisor_can_approve=1))
  AND NOT EXISTS(SELECT 1 FROM account_deletion_requests c WHERE c.user_id IN (s.created_by,NEW.user_id) AND c.status IN ('processing','completed'))
  AND NOT EXISTS(SELECT 1 FROM prepare_only_users p WHERE p.user_id IN (s.created_by,NEW.user_id))
  AND d.status IN ('prepared','cancelled') AND d.provider IS NULL AND d.provider_id IS NULL AND d.active_attempt_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id)
  AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.organization_id=d.organization_id AND o.dispatch_id=d.id)
  AND (d.channel<>'email' OR NEW.recipient_requested=1)
 );
END;
CREATE VIEW valid_future_dispatch_releases AS
 SELECT r.organization_id,r.schedule_id,r.dispatch_id,r.fingerprint,a.user_id FROM dispatch_schedule_releases r
 JOIN dispatch_schedules s ON s.organization_id=r.organization_id AND s.id=r.schedule_id
 JOIN dispatch_schedule_approvals a ON a.organization_id=s.organization_id AND a.schedule_id=s.id AND a.snapshot_hash=s.snapshot_hash
 JOIN memberships creator ON creator.organization_id=s.organization_id AND creator.user_id=s.created_by
 JOIN memberships approver ON approver.organization_id=s.organization_id AND approver.user_id=a.user_id
 JOIN organizations o ON o.id=s.organization_id AND o.mode=s.mode
 JOIN dispatches d ON d.organization_id=r.organization_id AND d.id=r.dispatch_id
 JOIN dispatches original ON original.organization_id=s.organization_id AND original.id=s.source_dispatch_id
 WHERE s.status='releasing' AND a.revoked_at IS NULL AND s.execute_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.release_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND creator.role IN ('admin','supervisor','member') AND (approver.role='admin' OR (approver.role='supervisor' AND approver.supervisor_can_approve=1))
 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests c WHERE c.user_id IN (s.created_by,a.user_id) AND c.status IN ('processing','completed'))
 AND NOT EXISTS(SELECT 1 FROM prepare_only_users p WHERE p.user_id IN (s.created_by,a.user_id))
 AND original.status='cancelled' AND original.provider IS NULL AND original.provider_id IS NULL AND original.active_attempt_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM outbox x WHERE x.organization_id=original.organization_id AND x.dispatch_id=original.id)
 AND NOT EXISTS(SELECT 1 FROM attempts x WHERE x.organization_id=original.organization_id AND x.dispatch_id=original.id)
 AND d.fingerprint=r.fingerprint AND d.channel=s.channel AND d.mode=s.mode AND d.ceiling_minor<=s.max_total_minor AND d.estimated_minor<=s.max_total_minor
 AND (d.document_id IS NULL OR EXISTS(SELECT 1 FROM documents doc WHERE doc.organization_id=d.organization_id AND doc.id=d.document_id AND doc.status='ready' AND (doc.access_owner_id IS NULL OR doc.access_owner_id=s.created_by)))
 AND d.channel=original.channel AND d.recipient_json=original.recipient_json AND d.document_id IS original.document_id AND d.sender_id IS original.sender_id AND d.sender_address=original.sender_address AND d.subject IS original.subject AND d.html IS original.html AND d.text IS original.text AND d.options_json=original.options_json
 AND d.channel IN ('fax','email') AND (d.channel='fax' OR (d.document_id IS NULL AND a.recipient_requested=1))
 AND json_type(d.options_json,'$.secureDistribution') IS NULL AND json_type(d.options_json,'$.protectedDocument') IS NULL AND COALESCE(json_extract(d.options_json,'$.emailDeliveryMode'),'attachment')<>'protected_link'
 AND NOT EXISTS(SELECT 1 FROM review_only_fax_dispatches f WHERE f.organization_id=d.organization_id AND f.dispatch_id IN (d.id,original.id));
CREATE TRIGGER dispatch_schedule_release_guard BEFORE INSERT ON dispatch_schedule_releases
BEGIN
 SELECT RAISE(ABORT,'scheduled_release_invalid') WHERE NOT EXISTS(SELECT 1 FROM dispatch_schedules s JOIN dispatches d ON d.organization_id=s.organization_id WHERE s.organization_id=NEW.organization_id AND s.id=NEW.schedule_id AND s.status='releasing' AND d.id=NEW.dispatch_id AND d.status='prepared' AND d.fingerprint=NEW.fingerprint AND d.prepare_key='schedule:'||s.id);
END;
CREATE VIEW accepted_scheduled_dispatches AS
 SELECT r.organization_id,r.dispatch_id,r.fingerprint,a.user_id FROM dispatch_schedule_releases r
 JOIN dispatch_schedules s ON s.organization_id=r.organization_id AND s.id=r.schedule_id AND s.status='released'
 JOIN dispatch_schedule_approvals a ON a.organization_id=s.organization_id AND a.schedule_id=s.id AND a.snapshot_hash=s.snapshot_hash AND a.approval_kind='future_browser'
 JOIN dispatches d ON d.organization_id=r.organization_id AND d.id=r.dispatch_id AND d.fingerprint=r.fingerprint
 WHERE d.ceiling_minor<=s.max_total_minor AND d.estimated_minor<=s.max_total_minor
 AND EXISTS(SELECT 1 FROM audit_log accepted WHERE accepted.id='schedule_released_'||s.id AND accepted.organization_id=s.organization_id AND accepted.resource_id=s.id AND accepted.action='schedule.released');
CREATE TRIGGER dispatch_schedule_source_acceptance BEFORE UPDATE OF status ON dispatches
WHEN OLD.status='prepared' AND NEW.status='queued' AND EXISTS(SELECT 1 FROM dispatch_schedules s WHERE s.organization_id=NEW.organization_id AND s.source_dispatch_id=NEW.id AND s.status IN ('draft','approved','releasing','unknown'))
BEGIN
 SELECT RAISE(ABORT,'scheduled_source_locked');
END;
CREATE TRIGGER dispatch_schedule_source_approval_insert BEFORE INSERT ON approvals
WHEN EXISTS(SELECT 1 FROM dispatch_schedules s WHERE s.organization_id=NEW.organization_id AND s.source_dispatch_id=NEW.dispatch_id AND s.status IN ('draft','approved','releasing','unknown'))
BEGIN
 SELECT RAISE(ABORT,'scheduled_source_locked');
END;
CREATE TRIGGER dispatch_schedule_source_cancellation BEFORE UPDATE OF status ON dispatches
WHEN OLD.status='prepared' AND NEW.status='cancelled' AND EXISTS(SELECT 1 FROM dispatch_schedules s WHERE s.organization_id=NEW.organization_id AND s.source_dispatch_id=NEW.id AND s.status='draft')
BEGIN
 -- Future approval first advances its schedule to approved in the same batch;
 -- an ordinary cancellation cannot silently leave a held draft runnable.
 SELECT RAISE(ABORT,'scheduled_source_locked');
END;
CREATE TRIGGER dispatch_schedule_source_approval_update BEFORE UPDATE ON approvals
WHEN EXISTS(SELECT 1 FROM dispatch_schedules s WHERE s.organization_id=NEW.organization_id AND s.source_dispatch_id=NEW.dispatch_id AND s.status IN ('draft','approved','releasing','unknown'))
BEGIN
 SELECT RAISE(ABORT,'scheduled_source_locked');
END;
CREATE TRIGGER dispatch_schedule_release_acceptance BEFORE UPDATE OF status ON dispatches
WHEN OLD.status='prepared' AND NEW.status='queued' AND EXISTS(SELECT 1 FROM dispatch_schedules s WHERE s.organization_id=NEW.organization_id AND NEW.prepare_key='schedule:'||s.id)
BEGIN
 SELECT RAISE(ABORT,'future_approval_required') WHERE NOT EXISTS(SELECT 1 FROM valid_future_dispatch_releases r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.id AND r.fingerprint=NEW.fingerprint);
END;
CREATE TRIGGER dispatch_schedule_accepted AFTER UPDATE OF status ON dispatches
WHEN OLD.status='prepared' AND NEW.status='queued' AND EXISTS(SELECT 1 FROM dispatch_schedule_releases r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.id)
BEGIN
 UPDATE dispatch_schedules SET status='released',revision=revision+1,updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND status='releasing' AND id IN (SELECT schedule_id FROM dispatch_schedule_releases WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id);
 INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT 'schedule_released_'||s.id,s.organization_id,a.user_id,'schedule.released',s.id,'{}',NEW.updated_at FROM dispatch_schedules s JOIN dispatch_schedule_releases r ON r.organization_id=s.organization_id AND r.schedule_id=s.id JOIN dispatch_schedule_approvals a ON a.organization_id=s.organization_id AND a.schedule_id=s.id WHERE r.dispatch_id=NEW.id;
END;
DROP TRIGGER accept_dispatch;
CREATE TRIGGER accept_dispatch BEFORE UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued'
BEGIN
 -- Preserve the existing sensitive-source refusal before generic commitment
 -- guards even when this recreated trigger runs before the older source guard.
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE NEW.document_id IS NOT NULL AND (EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.document_id AND c.secure_copy_source_id IS NOT NULL));
 SELECT RAISE(ABORT,'approval_required') WHERE NOT EXISTS(SELECT 1 FROM approvals WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND fingerprint=NEW.fingerprint AND expires_at>NEW.updated_at) AND NOT EXISTS(SELECT 1 FROM valid_future_dispatch_releases WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND fingerprint=NEW.fingerprint);
 SELECT RAISE(ABORT,'channel_disabled') WHERE NOT EXISTS(SELECT 1 FROM channel_controls WHERE organization_id=NEW.organization_id AND channel=NEW.channel AND enabled=1);
 SELECT RAISE(ABORT,'quota_exceeded') WHERE NOT EXISTS(SELECT 1 FROM usage WHERE organization_id=NEW.organization_id AND channel=NEW.channel AND period=substr(NEW.updated_at,1,7) AND reserved_count+confirmed_count+1<=limit_count AND reserved_minor+confirmed_minor+NEW.ceiling_minor<=limit_minor);
 UPDATE usage SET reserved_count=reserved_count+1,reserved_minor=reserved_minor+NEW.ceiling_minor WHERE organization_id=NEW.organization_id AND channel=NEW.channel AND period=substr(NEW.updated_at,1,7);
 INSERT INTO reservations(dispatch_id,organization_id,channel,period,amount_minor,status,created_at,updated_at) VALUES(NEW.id,NEW.organization_id,NEW.channel,substr(NEW.updated_at,1,7),NEW.ceiling_minor,'reserved',NEW.updated_at,NEW.updated_at);
 INSERT INTO outbox(id,dispatch_id,organization_id,status,created_at) VALUES('outbox_'||NEW.id,NEW.id,NEW.organization_id,'pending',NEW.updated_at);
END;
DROP TRIGGER email_recipient_attestation_acceptance;
CREATE TRIGGER email_recipient_attestation_acceptance BEFORE UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' AND NEW.mode='production' AND NEW.channel='email'
BEGIN
 SELECT RAISE(ABORT,'recipient_request_required') WHERE NOT EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.fingerprint=NEW.fingerprint AND a.recipient_requested=1 AND a.expires_at>NEW.updated_at) AND NOT EXISTS(SELECT 1 FROM valid_future_dispatch_releases WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND fingerprint=NEW.fingerprint);
END;
DROP TRIGGER email_recipient_attestation_submission;
CREATE TRIGGER email_recipient_attestation_submission BEFORE UPDATE OF status ON dispatches WHEN OLD.status='queued' AND NEW.status='submitting' AND NEW.mode='production' AND NEW.channel='email'
BEGIN
 SELECT RAISE(ABORT,'recipient_request_required') WHERE NOT EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.fingerprint=NEW.fingerprint AND a.recipient_requested=1) AND NOT EXISTS(SELECT 1 FROM accepted_scheduled_dispatches r JOIN dispatch_schedule_releases release ON release.organization_id=r.organization_id AND release.dispatch_id=r.dispatch_id JOIN dispatch_schedule_approvals a ON a.organization_id=release.organization_id AND a.schedule_id=release.schedule_id WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.id AND r.fingerprint=NEW.fingerprint AND a.recipient_requested=1);
END;
CREATE TRIGGER dispatch_schedule_member_revocation AFTER UPDATE OF role,supervisor_can_approve,supervisor_can_report ON memberships
WHEN NEW.role IS NOT OLD.role OR NEW.supervisor_can_approve IS NOT OLD.supervisor_can_approve OR NEW.supervisor_can_report IS NOT OLD.supervisor_can_report
BEGIN
 UPDATE dispatch_schedule_approvals SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.organization_id AND revoked_at IS NULL AND schedule_id IN (SELECT id FROM dispatch_schedules WHERE organization_id=OLD.organization_id AND status IN ('draft','approved','releasing') AND (created_by=OLD.user_id OR id IN (SELECT schedule_id FROM dispatch_schedule_approvals WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id)));
 UPDATE dispatch_schedules SET status='blocked',error_code='MEMBERSHIP_CHANGED',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.organization_id AND status IN ('draft','approved','releasing') AND (created_by=OLD.user_id OR id IN (SELECT schedule_id FROM dispatch_schedule_approvals WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id));
END;
CREATE TRIGGER dispatch_schedule_member_removal BEFORE DELETE ON memberships
BEGIN
 UPDATE dispatch_schedule_approvals SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.organization_id AND revoked_at IS NULL AND schedule_id IN (SELECT id FROM dispatch_schedules WHERE organization_id=OLD.organization_id AND status IN ('draft','approved','releasing') AND (created_by=OLD.user_id OR id IN (SELECT schedule_id FROM dispatch_schedule_approvals WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id)));
 UPDATE dispatch_schedules SET status='blocked',error_code='MEMBERSHIP_CHANGED',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.organization_id AND status IN ('draft','approved','releasing') AND (created_by=OLD.user_id OR id IN (SELECT schedule_id FROM dispatch_schedule_approvals WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id));
END;
