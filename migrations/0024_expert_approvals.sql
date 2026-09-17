-- A browser administrator may delegate bounded authority to one of their own
-- OAuth connections. This is never presented as a fresh human approval.
CREATE TABLE expert_approval_policies (
  connection_id TEXT PRIMARY KEY REFERENCES authorized_connections(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL CHECK(revision>0),
  channels_json TEXT NOT NULL CHECK(json_valid(channels_json) AND json_type(channels_json)='array'),
  max_per_dispatch_minor INTEGER NOT NULL CHECK(max_per_dispatch_minor BETWEEN 1 AND 10000),
  max_daily_minor INTEGER NOT NULL CHECK(max_daily_minor BETWEEN max_per_dispatch_minor AND 50000),
  max_daily_count INTEGER NOT NULL CHECK(max_daily_count BETWEEN 1 AND 1000),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TRIGGER expert_policy_owner_insert BEFORE INSERT ON expert_approval_policies
BEGIN
  SELECT RAISE(ABORT,'expert_policy_invalid') WHERE NOT EXISTS(SELECT 1 FROM authorized_connections c JOIN memberships m ON m.organization_id=c.organization_id AND m.user_id=c.user_id WHERE c.id=NEW.connection_id AND c.organization_id=NEW.organization_id AND c.user_id=NEW.user_id AND c.status='active' AND m.role='admin');
END;
CREATE TRIGGER expert_policy_owner_update BEFORE UPDATE ON expert_approval_policies
BEGIN
  SELECT RAISE(ABORT,'expert_policy_invalid') WHERE NEW.connection_id<>OLD.connection_id OR NEW.organization_id<>OLD.organization_id OR NEW.user_id<>OLD.user_id OR NEW.revision<>OLD.revision+1 OR NEW.created_at<>OLD.created_at;
END;
CREATE VIEW active_expert_approval_policies AS SELECT p.*,c.client_id,c.issuer,c.updated_at AS connection_updated_at,c.not_before FROM expert_approval_policies p JOIN authorized_connections c ON c.id=p.connection_id AND c.organization_id=p.organization_id AND c.user_id=p.user_id JOIN memberships m ON m.organization_id=p.organization_id AND m.user_id=p.user_id WHERE p.enabled=1 AND p.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND c.status='active' AND m.role='admin';
CREATE TABLE expert_dispatch_reviews (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64),
  organization_id TEXT NOT NULL,
  dispatch_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  connection_id TEXT NOT NULL REFERENCES expert_approval_policies(connection_id),
  policy_revision INTEGER NOT NULL,
  connection_updated_at TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  ceiling_minor INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(organization_id,dispatch_id,connection_id),
  FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id)
);
CREATE VIEW valid_expert_dispatch_reviews AS SELECT r.*,p.max_daily_minor,p.max_daily_count FROM expert_dispatch_reviews r JOIN active_expert_approval_policies p ON p.connection_id=r.connection_id AND p.organization_id=r.organization_id AND p.user_id=r.user_id AND p.revision=r.policy_revision AND p.connection_updated_at=r.connection_updated_at JOIN dispatches d ON d.organization_id=r.organization_id AND d.id=r.dispatch_id AND d.fingerprint=r.fingerprint AND d.ceiling_minor=r.ceiling_minor WHERE r.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND r.expires_at<=p.expires_at AND d.ceiling_minor<=p.max_per_dispatch_minor AND EXISTS(SELECT 1 FROM json_each(p.channels_json) WHERE value=d.channel);
ALTER TABLE approvals ADD COLUMN approval_kind TEXT NOT NULL DEFAULT 'browser' CHECK(approval_kind IN ('browser','expert'));
ALTER TABLE approvals ADD COLUMN expert_review_hash TEXT;
CREATE TRIGGER expert_approval_insert BEFORE INSERT ON approvals
BEGIN
  SELECT RAISE(ABORT,'expert_approval_invalid') WHERE (NEW.approval_kind='browser' AND NEW.expert_review_hash IS NOT NULL) OR (NEW.approval_kind='expert' AND NOT EXISTS(SELECT 1 FROM valid_expert_dispatch_reviews r WHERE r.token_hash=NEW.expert_review_hash AND r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id AND r.user_id=NEW.user_id AND r.fingerprint=NEW.fingerprint AND NEW.expires_at<=r.expires_at));
END;
CREATE TRIGGER expert_approval_update BEFORE UPDATE ON approvals
BEGIN
  SELECT RAISE(ABORT,'expert_approval_invalid') WHERE (NEW.approval_kind='browser' AND NEW.expert_review_hash IS NOT NULL) OR (NEW.approval_kind='expert' AND NOT EXISTS(SELECT 1 FROM valid_expert_dispatch_reviews r WHERE r.token_hash=NEW.expert_review_hash AND r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id AND r.user_id=NEW.user_id AND r.fingerprint=NEW.fingerprint AND NEW.expires_at<=r.expires_at));
END;
CREATE TABLE expert_approval_acceptances (
  organization_id TEXT NOT NULL,
  dispatch_id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES expert_approval_policies(connection_id),
  policy_revision INTEGER NOT NULL,
  ceiling_minor INTEGER NOT NULL CHECK(ceiling_minor>=0),
  budget_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id)
);
CREATE INDEX expert_acceptance_daily ON expert_approval_acceptances(connection_id,budget_day);
CREATE TRIGGER immutable_expert_acceptance BEFORE UPDATE ON expert_approval_acceptances
BEGIN
  SELECT RAISE(ABORT,'immutable_expert_acceptance');
END;
CREATE TRIGGER retained_expert_acceptance BEFORE DELETE ON expert_approval_acceptances
BEGIN
  SELECT RAISE(ABORT,'immutable_expert_acceptance');
END;
CREATE TRIGGER expert_acceptance_guard BEFORE UPDATE OF status ON dispatches
WHEN OLD.status='prepared' AND NEW.status='queued' AND EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.approval_kind='expert')
BEGIN
  SELECT RAISE(ABORT,'expert_approval_invalid') WHERE NOT EXISTS(SELECT 1 FROM approvals a JOIN valid_expert_dispatch_reviews r ON r.token_hash=a.expert_review_hash AND r.organization_id=a.organization_id AND r.dispatch_id=a.dispatch_id AND r.user_id=a.user_id AND r.fingerprint=a.fingerprint WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.fingerprint=NEW.fingerprint AND a.expires_at>NEW.updated_at);
  SELECT RAISE(ABORT,'expert_budget_exceeded') WHERE EXISTS(SELECT 1 FROM approvals a JOIN valid_expert_dispatch_reviews r ON r.token_hash=a.expert_review_hash WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND ((SELECT COUNT(*) FROM expert_approval_acceptances u WHERE u.connection_id=r.connection_id AND u.budget_day=date('now'))+1>r.max_daily_count OR COALESCE((SELECT SUM(ceiling_minor) FROM expert_approval_acceptances u WHERE u.connection_id=r.connection_id AND u.budget_day=date('now')),0)+NEW.ceiling_minor>r.max_daily_minor));
  INSERT INTO expert_approval_acceptances(organization_id,dispatch_id,connection_id,policy_revision,ceiling_minor,budget_day,created_at) SELECT NEW.organization_id,NEW.id,r.connection_id,r.policy_revision,NEW.ceiling_minor,date('now'),NEW.updated_at FROM approvals a JOIN valid_expert_dispatch_reviews r ON r.token_hash=a.expert_review_hash WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id;
END;
-- Postal drafts have a separate, explicitly delegated transfer authority.
ALTER TABLE postal_transfer_consents ADD COLUMN consent_kind TEXT NOT NULL DEFAULT 'browser' CHECK(consent_kind IN ('browser','expert'));
ALTER TABLE postal_transfer_consents ADD COLUMN expert_connection_id TEXT;
ALTER TABLE postal_transfer_consents ADD COLUMN expert_policy_revision INTEGER;
CREATE INDEX expert_postal_daily ON postal_transfer_consents(expert_connection_id,created_at) WHERE consent_kind='expert';
CREATE TRIGGER expert_postal_consent_guard BEFORE INSERT ON postal_transfer_consents
WHEN NEW.consent_kind='expert'
BEGIN
  SELECT RAISE(ABORT,'expert_approval_invalid') WHERE NOT EXISTS(SELECT 1 FROM active_expert_approval_policies p JOIN postal_preflights r ON r.organization_id=p.organization_id AND r.user_id=p.user_id WHERE p.connection_id=NEW.expert_connection_id AND p.revision=NEW.expert_policy_revision AND p.organization_id=NEW.organization_id AND p.user_id=NEW.user_id AND r.id=NEW.preflight_id AND r.request_hash=NEW.fingerprint AND r.ceiling_minor<=p.max_per_dispatch_minor AND EXISTS(SELECT 1 FROM json_each(p.channels_json) WHERE value='postal'));
  SELECT RAISE(ABORT,'expert_budget_exceeded') WHERE (SELECT COUNT(*) FROM postal_transfer_consents c WHERE c.expert_connection_id=NEW.expert_connection_id AND c.created_at>=date('now') AND c.consent_kind='expert')+1>(SELECT max_daily_count FROM active_expert_approval_policies WHERE connection_id=NEW.expert_connection_id);
END;
