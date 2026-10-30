-- Strong browser approval applies to the dispatch itself, including every
-- legacy REST, MCP, campaign and direct SQL acceptance path.
CREATE TABLE secure_approval_evidence (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 dispatch_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 session_hash TEXT NOT NULL CHECK(length(session_hash)=64),
 authenticated_at INTEGER NOT NULL,
 policy_version TEXT NOT NULL CHECK(policy_version='guteneo-sensitive-v1'),
 created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id)
);
CREATE INDEX secure_approval_evidence_dispatch ON secure_approval_evidence(organization_id,dispatch_id,id);
ALTER TABLE approvals ADD COLUMN secure_approval_evidence_id TEXT REFERENCES secure_approval_evidence(id);

-- Session hashes are stored as evidence, without a session FK: revocation must
-- remain possible while the immutable historical approval receipt survives.
CREATE VIEW valid_secure_approval_evidence AS
 SELECT e.* FROM secure_approval_evidence e
 JOIN dispatches d ON d.organization_id=e.organization_id AND d.id=e.dispatch_id AND d.fingerprint=e.fingerprint
 JOIN personal_sessions p ON p.token_hash=e.session_hash AND p.user_id=e.user_id AND p.authenticated_at=e.authenticated_at AND p.authentication_policy_version=e.policy_version
 JOIN browser_sessions b ON b.token_hash=p.token_hash AND b.user_id=p.user_id AND b.organization_id=e.organization_id
 JOIN memberships m ON m.organization_id=e.organization_id AND m.user_id=e.user_id
 WHERE json_type(d.options_json,'$.secureDistribution')='object'
 AND (m.role='admin' OR (m.role='supervisor' AND m.supervisor_can_approve=1))
 AND p.strong_authentication=1 AND p.verified_email IS NOT NULL AND length(trim(p.verified_email))>0
 AND p.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND b.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND p.authenticated_at BETWEEN CAST(strftime('%s','now') AS INTEGER)-900 AND CAST(strftime('%s','now') AS INTEGER)+5
 AND (d.mode='simulation' OR (p.is_development=0 AND b.is_development=0));

CREATE TRIGGER secure_approval_evidence_guard AFTER INSERT ON secure_approval_evidence BEGIN
 SELECT RAISE(ABORT,'secure_browser_approval_required') WHERE NOT EXISTS(
 SELECT 1 FROM valid_secure_approval_evidence e JOIN dispatches d ON d.organization_id=e.organization_id AND d.id=e.dispatch_id
 WHERE e.id=NEW.id AND d.status='prepared');
END;
CREATE TRIGGER secure_approval_evidence_immutable BEFORE UPDATE ON secure_approval_evidence BEGIN
 SELECT RAISE(ABORT,'secure_approval_evidence_immutable');
END;
CREATE TRIGGER secure_approval_evidence_retained BEFORE DELETE ON secure_approval_evidence WHEN EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=OLD.organization_id AND d.id=OLD.dispatch_id) BEGIN
 SELECT RAISE(ABORT,'secure_approval_evidence_immutable');
END;

CREATE TRIGGER secure_browser_approval_insert BEFORE INSERT ON approvals
 WHEN EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND json_type(d.options_json,'$.secureDistribution')='object')
 BEGIN
 SELECT RAISE(ABORT,'secure_browser_approval_required') WHERE NEW.approval_kind<>'browser' OR NEW.expert_review_hash IS NOT NULL OR NOT EXISTS(
 SELECT 1 FROM valid_secure_approval_evidence e WHERE e.id=NEW.secure_approval_evidence_id AND e.organization_id=NEW.organization_id AND e.dispatch_id=NEW.dispatch_id AND e.fingerprint=NEW.fingerprint AND e.user_id=NEW.user_id AND e.created_at=NEW.created_at
 AND CAST(strftime('%s',NEW.expires_at) AS INTEGER)<=e.authenticated_at+900);
END;
CREATE TRIGGER secure_browser_approval_update BEFORE UPDATE ON approvals
 WHEN EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND json_type(d.options_json,'$.secureDistribution')='object')
 BEGIN
 SELECT RAISE(ABORT,'secure_browser_approval_required') WHERE NEW.approval_kind<>'browser' OR NEW.expert_review_hash IS NOT NULL OR NOT EXISTS(
 SELECT 1 FROM valid_secure_approval_evidence e WHERE e.id=NEW.secure_approval_evidence_id AND e.organization_id=NEW.organization_id AND e.dispatch_id=NEW.dispatch_id AND e.fingerprint=NEW.fingerprint AND e.user_id=NEW.user_id AND e.created_at=NEW.created_at
 AND CAST(strftime('%s',NEW.expires_at) AS INTEGER)<=e.authenticated_at+900);
END;

CREATE TRIGGER secure_browser_approval_acceptance BEFORE UPDATE OF status ON dispatches
 WHEN OLD.status='prepared' AND NEW.status='queued' AND json_type(NEW.options_json,'$.secureDistribution')='object'
 BEGIN
 SELECT RAISE(ABORT,'secure_browser_approval_required') WHERE NOT EXISTS(
 SELECT 1 FROM approvals a JOIN valid_secure_approval_evidence e ON e.id=a.secure_approval_evidence_id
 WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.fingerprint=NEW.fingerprint
 AND a.approval_kind='browser' AND a.expert_review_hash IS NULL AND a.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND e.organization_id=a.organization_id AND e.dispatch_id=a.dispatch_id AND e.fingerprint=a.fingerprint AND e.user_id=a.user_id AND e.created_at=a.created_at);
END;
