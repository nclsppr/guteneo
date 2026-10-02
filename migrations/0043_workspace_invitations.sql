-- Invitation bearer tokens remain outside storage; Auth0 PKCE state records only
-- their hash so parallel browser login flows cannot exchange invitations.
ALTER TABLE auth_transactions ADD COLUMN invitation_token_hash TEXT;
CREATE TABLE workspace_invitations(
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 email TEXT NOT NULL CHECK(email=lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
 role TEXT NOT NULL CHECK(role IN ('admin','supervisor','member','viewer')),
 supervisor_can_approve INTEGER NOT NULL DEFAULT 0 CHECK(supervisor_can_approve IN (0,1)),
 supervisor_can_report INTEGER NOT NULL DEFAULT 0 CHECK(supervisor_can_report IN (0,1)),
 invited_by TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','revoked','expired')),
 delivery_status TEXT NOT NULL CHECK(delivery_status IN ('pending','simulated','sent','failed','unknown')),
 delivery_attempted_at TEXT,
 provider_id TEXT,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL CHECK(expires_at>created_at),
 accepted_at TEXT,
 accepted_by TEXT REFERENCES users(id),
 revoked_at TEXT,
 UNIQUE(organization_id,id),
 CHECK(role='supervisor' OR (supervisor_can_approve=0 AND supervisor_can_report=0)),
 CHECK((status='accepted' AND accepted_at IS NOT NULL AND accepted_by IS NOT NULL) OR (status!='accepted' AND accepted_at IS NULL AND accepted_by IS NULL)),
 CHECK((status='revoked' AND revoked_at IS NOT NULL) OR (status!='revoked' AND revoked_at IS NULL))
);
CREATE UNIQUE INDEX workspace_invitations_pending_email ON workspace_invitations(organization_id,email) WHERE status='pending';
CREATE INDEX workspace_invitations_list ON workspace_invitations(organization_id,created_at,id);
CREATE TRIGGER workspace_invitation_insert BEFORE INSERT ON workspace_invitations
BEGIN
 SELECT RAISE(ABORT,'invitation_admin_required') WHERE NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=NEW.organization_id AND user_id=NEW.invited_by AND role='admin');
 SELECT RAISE(ABORT,'invitation_existing_member') WHERE EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=NEW.organization_id AND lower(trim(u.email))=NEW.email);
 SELECT RAISE(ABORT,'invitation_daily_limit') WHERE (SELECT count(*) FROM workspace_invitations WHERE organization_id=NEW.organization_id AND substr(created_at,1,10)=substr(NEW.created_at,1,10))>=500;
END;
CREATE TRIGGER workspace_invitation_immutable BEFORE UPDATE ON workspace_invitations
WHEN NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.email<>OLD.email OR NEW.token_hash<>OLD.token_hash OR NEW.role<>OLD.role OR NEW.supervisor_can_approve<>OLD.supervisor_can_approve OR NEW.supervisor_can_report<>OLD.supervisor_can_report OR NEW.invited_by<>OLD.invited_by OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at OR (OLD.status<>'pending' AND (NEW.status<>OLD.status OR NEW.accepted_by IS NOT OLD.accepted_by OR NEW.accepted_at IS NOT OLD.accepted_at OR NEW.revoked_at IS NOT OLD.revoked_at))
BEGIN SELECT RAISE(ABORT,'invitation_immutable');
END;
CREATE TABLE workspace_invitation_acceptances(
 invitation_id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 verified_email TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,invitation_id) REFERENCES workspace_invitations(organization_id,id)
);
CREATE TRIGGER workspace_invitation_acceptance_guard BEFORE INSERT ON workspace_invitation_acceptances
BEGIN
 SELECT RAISE(ABORT,'invitation_unavailable') WHERE NOT EXISTS(SELECT 1 FROM workspace_invitations i JOIN memberships m ON m.organization_id=i.organization_id AND m.user_id=i.invited_by WHERE i.id=NEW.invitation_id AND i.organization_id=NEW.organization_id AND i.email=NEW.verified_email AND i.status='pending' AND i.expires_at>NEW.created_at AND i.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND m.role='admin');
 SELECT RAISE(ABORT,'invitation_existing_member') WHERE EXISTS(SELECT 1 FROM memberships WHERE organization_id=NEW.organization_id AND user_id=NEW.user_id);
END;
CREATE TRIGGER workspace_invitation_acceptance_commit AFTER INSERT ON workspace_invitation_acceptances
BEGIN
 INSERT INTO memberships(organization_id,user_id,role,created_at,supervisor_can_approve,supervisor_can_report) SELECT organization_id,NEW.user_id,role,NEW.created_at,supervisor_can_approve,supervisor_can_report FROM workspace_invitations WHERE organization_id=NEW.organization_id AND id=NEW.invitation_id;
 UPDATE workspace_invitations SET status='accepted',accepted_at=NEW.created_at,accepted_by=NEW.user_id WHERE organization_id=NEW.organization_id AND id=NEW.invitation_id;
 INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES('invitation_accept_'||NEW.invitation_id,NEW.organization_id,NEW.user_id,'invitation.accepted',NEW.invitation_id,'{}',NEW.created_at);
END;
CREATE TRIGGER workspace_invitation_acceptance_immutable BEFORE UPDATE ON workspace_invitation_acceptances
BEGIN SELECT RAISE(ABORT,'invitation_acceptance_immutable');
END;
-- Accepted status is evidence of the verified-email acceptance transaction only.
CREATE TRIGGER workspace_invitation_accepted_guard BEFORE UPDATE OF status ON workspace_invitations
WHEN NEW.status='accepted'
BEGIN
 SELECT RAISE(ABORT,'invitation_acceptance_required') WHERE NOT EXISTS(SELECT 1 FROM workspace_invitation_acceptances a WHERE a.invitation_id=NEW.id AND a.organization_id=NEW.organization_id AND a.user_id=NEW.accepted_by AND a.created_at=NEW.accepted_at);
END;
-- A later promotion cannot revive invitations issued before lost administrator
-- authority. Existing accepted membership and its evidence are not changed.
CREATE TRIGGER workspace_invitation_inviter_demoted AFTER UPDATE OF role ON memberships
WHEN OLD.role='admin' AND NEW.role<>'admin'
BEGIN
 UPDATE workspace_invitations SET status='revoked',revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.organization_id AND invited_by=OLD.user_id AND status='pending';
END;
CREATE TRIGGER workspace_invitation_inviter_removed BEFORE DELETE ON memberships
BEGIN
 UPDATE workspace_invitations SET status='revoked',revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.organization_id AND invited_by=OLD.user_id AND status='pending';
END;
