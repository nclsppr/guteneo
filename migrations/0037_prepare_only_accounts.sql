-- Operator-managed identities may be restricted before their first browser login.
-- No dashboard, OAuth client or MCP tool can add, remove or relax this policy.
CREATE TABLE restricted_delivery_identities(issuer TEXT NOT NULL CHECK(length(issuer)>0), subject TEXT NOT NULL CHECK(length(subject)>0), policy TEXT NOT NULL DEFAULT 'prepare_only' CHECK(policy='prepare_only'), created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(issuer,subject));
CREATE INDEX auth_identities_user ON auth_identities(user_id);
CREATE VIEW prepare_only_users AS SELECT DISTINCT a.user_id FROM auth_identities a JOIN restricted_delivery_identities r ON r.issuer=a.issuer AND r.subject=a.subject WHERE r.policy='prepare_only';
CREATE TRIGGER prepare_only_account_acceptance BEFORE UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' BEGIN
 SELECT RAISE(ABORT,'prepare_only_account') WHERE EXISTS(SELECT 1 FROM approvals a JOIN prepare_only_users r ON r.user_id=a.user_id WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id);
END;
