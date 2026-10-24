-- Optional strong authentication never changes the evidence actually observed.
-- Existing receipts retain their strict meaning. policy_version identifies the
-- document policy family; authentication_mode records the requirement used.
CREATE TABLE secure_document_authentication_policy (
 id INTEGER PRIMARY KEY CHECK(id=1),
 mode TEXT NOT NULL DEFAULT 'strong' CHECK(mode IN ('strong','verified_account'))
);
INSERT INTO secure_document_authentication_policy(id,mode) VALUES(1,'strong');

ALTER TABLE secure_approval_evidence ADD COLUMN authentication_mode TEXT NOT NULL DEFAULT 'strong'
 CHECK(authentication_mode IN ('strong','verified_account'));

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
 AND p.authenticated_at BETWEEN CAST(strftime('%s','now') AS INTEGER)-900 AND CAST(strftime('%s','now') AS INTEGER)+5
 AND (d.mode='simulation' OR (p.is_development=0 AND b.is_development=0));
