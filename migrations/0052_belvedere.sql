-- Privilege is a separate, signed browser-login fact, never a workshop role.
-- Historical sessions intentionally have no privilege evidence: reconnect.
CREATE TABLE browser_identity_evidence (
  token_hash TEXT PRIMARY KEY REFERENCES browser_sessions(token_hash) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  verified_email TEXT NOT NULL,
  authenticated_at TEXT NOT NULL
);
ALTER TABLE native_sessions ADD COLUMN public_id TEXT;
UPDATE native_sessions SET public_id='native_' || lower(hex(randomblob(16))) WHERE public_id IS NULL;
CREATE UNIQUE INDEX native_session_public_id ON native_sessions(public_id);
CREATE TRIGGER native_session_public_id AFTER INSERT ON native_sessions WHEN NEW.public_id IS NULL
BEGIN
 UPDATE native_sessions SET public_id='native_' || lower(hex(randomblob(16))) WHERE token_hash=NEW.token_hash AND organization_id=NEW.organization_id AND user_id=NEW.user_id;
END;
-- Country only, supplied by trusted Workers request.cf. No IP, user agent,
-- document, recipient, access token or secret route is stored.
CREATE TABLE connection_events (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('browser','native','mcp')),
 connection_id TEXT NOT NULL,
 country TEXT CHECK(country IS NULL OR (length(country)=2 AND country NOT GLOB '*[^A-Z]*')),
 occurred_at TEXT NOT NULL,
 day TEXT NOT NULL,
 UNIQUE(organization_id,user_id,kind,connection_id,day)
);
CREATE INDEX connection_events_period ON connection_events(occurred_at DESC,id);
CREATE INDEX connection_events_owner ON connection_events(organization_id,user_id,occurred_at DESC);
CREATE INDEX connection_events_connection ON connection_events(organization_id,user_id,kind,connection_id,occurred_at DESC);
CREATE TABLE platform_access_audit (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN ('shell','overview','jobs','workshops','workshop','members','connections','finance','infrastructure')),
 occurred_at TEXT NOT NULL
);
CREATE INDEX platform_access_audit_expiry ON platform_access_audit(occurred_at);
CREATE INDEX belvedere_dispatch_period ON dispatches(mode,created_at DESC,id);
CREATE INDEX belvedere_organizations_period ON organizations(mode,created_at DESC,id);
CREATE INDEX belvedere_memberships_user ON memberships(user_id,organization_id);
CREATE INDEX belvedere_documents_period ON documents(organization_id,created_at,id);
CREATE INDEX belvedere_payments_period ON billing_payments(livemode,status,created,organization_id);

CREATE INDEX belvedere_credit_posted ON welcome_credit_entries(kind,created_at,organization_id,dispatch_id);
CREATE INDEX belvedere_hosting_posted ON protected_hosting_charges(created_at,organization_id,dispatch_id);
CREATE INDEX belvedere_horizon_posted ON horizon_plan_charges(evidence,created_at,organization_id);
CREATE INDEX belvedere_supplier_posted ON fax_usage_settlements(created_at,organization_id,dispatch_id);
