-- Verified-account document access reuses the current authenticated session.
-- Strong authentication retains its short step-up window. Historical evidence,
-- current identity, revocation, membership, immutable consent and policy fences remain.
DROP VIEW valid_secure_approval_evidence;
CREATE VIEW valid_secure_approval_evidence AS
 SELECT e.* FROM secure_approval_evidence e
 JOIN dispatches d ON d.organization_id=e.organization_id AND d.id=e.dispatch_id AND d.fingerprint=e.fingerprint
 JOIN personal_sessions p ON p.token_hash=e.session_hash AND p.user_id=e.user_id AND p.authenticated_at=e.authenticated_at
 JOIN browser_sessions b ON b.token_hash=p.token_hash AND b.user_id=p.user_id AND b.organization_id=e.organization_id
 JOIN memberships m ON m.organization_id=e.organization_id AND m.user_id=e.user_id
 JOIN secure_document_authentication_policy policy ON policy.id=1
 WHERE json_type(d.options_json,'$.secureDistribution')='object'
 AND (m.role='admin' OR (m.role='supervisor' AND m.supervisor_can_approve=1))
 AND p.verified_email IS NOT NULL AND length(trim(p.verified_email))>0
 AND ((policy.mode='strong' AND e.authentication_mode='strong' AND p.strong_authentication=1 AND p.authentication_policy_version=e.policy_version)
   OR (policy.mode='verified_account' AND p.verified_account=1 AND (
     (p.is_development=0 AND EXISTS(SELECT 1 FROM auth_identities ai JOIN users u ON u.id=ai.user_id WHERE ai.user_id=p.user_id AND ai.issuer=p.identity_issuer AND ai.subject=p.identity_subject AND u.email=p.verified_email))
     OR (d.mode='simulation' AND p.is_development=1))))
 AND p.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND b.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND p.authenticated_at>0 AND p.authenticated_at<=CAST(strftime('%s','now') AS INTEGER)+5
 AND (policy.mode='verified_account' OR p.authenticated_at>=CAST(strftime('%s','now') AS INTEGER)-900)
 AND (d.mode='simulation' OR (p.is_development=0 AND b.is_development=0));

DROP TRIGGER secure_browser_approval_insert;
CREATE TRIGGER secure_browser_approval_insert BEFORE INSERT ON approvals
 WHEN EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND json_type(d.options_json,'$.secureDistribution')='object')
 BEGIN
 SELECT RAISE(ABORT,'secure_browser_approval_required') WHERE NEW.approval_kind<>'browser' OR NEW.expert_review_hash IS NOT NULL OR NOT EXISTS(
 SELECT 1 FROM valid_secure_approval_evidence e
 JOIN personal_sessions p ON p.token_hash=e.session_hash AND p.user_id=e.user_id
 JOIN browser_sessions b ON b.token_hash=p.token_hash AND b.user_id=p.user_id AND b.organization_id=e.organization_id
 WHERE e.id=NEW.secure_approval_evidence_id AND e.organization_id=NEW.organization_id AND e.dispatch_id=NEW.dispatch_id AND e.fingerprint=NEW.fingerprint AND e.user_id=NEW.user_id AND e.created_at=NEW.created_at
 AND CAST(strftime('%s',NEW.expires_at) AS INTEGER)>CAST(strftime('%s',NEW.created_at) AS INTEGER)
 AND CAST(strftime('%s',NEW.expires_at) AS INTEGER)<=CAST(strftime('%s',NEW.created_at) AS INTEGER)+900
 AND NEW.expires_at<=p.expires_at AND NEW.expires_at<=b.expires_at
 AND (e.authentication_mode='verified_account' OR CAST(strftime('%s',NEW.expires_at) AS INTEGER)<=e.authenticated_at+900));
END;

DROP TRIGGER secure_browser_approval_update;
CREATE TRIGGER secure_browser_approval_update BEFORE UPDATE ON approvals
 WHEN EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND json_type(d.options_json,'$.secureDistribution')='object')
 BEGIN
 SELECT RAISE(ABORT,'secure_browser_approval_required') WHERE NEW.approval_kind<>'browser' OR NEW.expert_review_hash IS NOT NULL OR NOT EXISTS(
 SELECT 1 FROM valid_secure_approval_evidence e
 JOIN personal_sessions p ON p.token_hash=e.session_hash AND p.user_id=e.user_id
 JOIN browser_sessions b ON b.token_hash=p.token_hash AND b.user_id=p.user_id AND b.organization_id=e.organization_id
 WHERE e.id=NEW.secure_approval_evidence_id AND e.organization_id=NEW.organization_id AND e.dispatch_id=NEW.dispatch_id AND e.fingerprint=NEW.fingerprint AND e.user_id=NEW.user_id AND e.created_at=NEW.created_at
 AND CAST(strftime('%s',NEW.expires_at) AS INTEGER)>CAST(strftime('%s',NEW.created_at) AS INTEGER)
 AND CAST(strftime('%s',NEW.expires_at) AS INTEGER)<=CAST(strftime('%s',NEW.created_at) AS INTEGER)+900
 AND NEW.expires_at<=p.expires_at AND NEW.expires_at<=b.expires_at
 AND (e.authentication_mode='verified_account' OR CAST(strftime('%s',NEW.expires_at) AS INTEGER)<=e.authenticated_at+900));
END;
