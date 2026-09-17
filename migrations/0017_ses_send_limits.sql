-- Account/region transport quotas, deliberately separate from tenant money ledgers.
-- No activation, identity, credentials or quota increase is installed here.
CREATE TABLE ses_send_limit_policies (
  account_id TEXT NOT NULL CHECK(length(account_id)=12 AND account_id NOT GLOB '*[^0-9]*'),
  region TEXT NOT NULL,
  max_recipients_24h INTEGER NOT NULL CHECK(typeof(max_recipients_24h)='integer' AND max_recipients_24h BETWEEN 1 AND 100000),
  min_interval_ms INTEGER NOT NULL CHECK(typeof(min_interval_ms)='integer' AND min_interval_ms BETWEEN 1 AND 60000),
  source_reference TEXT NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 500),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'),
  qualified_at_ms INTEGER NOT NULL CHECK(typeof(qualified_at_ms)='integer' AND qualified_at_ms>=0),
  expires_at_ms INTEGER NOT NULL CHECK(typeof(expires_at_ms)='integer' AND expires_at_ms>qualified_at_ms),
  status TEXT NOT NULL CHECK(status IN ('qualified','revoked')),
  PRIMARY KEY(account_id,region)
);
CREATE UNIQUE INDEX attempts_ses_scope ON attempts(organization_id,dispatch_id,id);
CREATE TABLE ses_send_reservations (
  attempt_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dispatch_id TEXT NOT NULL,
  account_id TEXT NOT NULL CHECK(length(account_id)=12 AND account_id NOT GLOB '*[^0-9]*'),
  region TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','accepted','unknown','rejected')),
  reserved_at_ms INTEGER NOT NULL CHECK(typeof(reserved_at_ms)='integer' AND reserved_at_ms>=0),
  completed_at_ms INTEGER CHECK(completed_at_ms IS NULL OR (typeof(completed_at_ms)='integer' AND completed_at_ms>=reserved_at_ms)),
  max_recipients_24h INTEGER NOT NULL CHECK(max_recipients_24h BETWEEN 1 AND 100000),
  min_interval_ms INTEGER NOT NULL CHECK(min_interval_ms BETWEEN 1 AND 60000),
  CHECK((status='reserved' AND completed_at_ms IS NULL) OR (status<>'reserved' AND completed_at_ms IS NOT NULL)),
  FOREIGN KEY(organization_id,dispatch_id,attempt_id) REFERENCES attempts(organization_id,dispatch_id,id)
);
CREATE INDEX ses_send_reservations_window ON ses_send_reservations(account_id,region,status,completed_at_ms);
CREATE TRIGGER immutable_ses_send_reservation BEFORE UPDATE ON ses_send_reservations WHEN NEW.attempt_id<>OLD.attempt_id OR NEW.organization_id<>OLD.organization_id OR NEW.dispatch_id<>OLD.dispatch_id OR NEW.account_id<>OLD.account_id OR NEW.region<>OLD.region OR NEW.reserved_at_ms<>OLD.reserved_at_ms OR NEW.max_recipients_24h<>OLD.max_recipients_24h OR NEW.min_interval_ms<>OLD.min_interval_ms OR OLD.status IN ('accepted','rejected') OR NEW.status='reserved' BEGIN SELECT RAISE(ABORT,'immutable_ses_send_reservation'); END;
-- A Worker may stop before recording its response. The domain's existing lease
-- reconciliation marks that attempt unknown; it releases only the transport
-- mutex, while the unknown recipient continues to consume the account quota.
CREATE TRIGGER ses_attempt_outcome AFTER UPDATE OF status ON attempts WHEN NEW.status IN ('accepted','unknown','rejected') AND OLD.status='started'
BEGIN
  UPDATE ses_send_reservations SET status=NEW.status,completed_at_ms=MAX(reserved_at_ms,CAST(strftime('%s',NEW.updated_at) AS INTEGER)*1000+CAST(substr(NEW.updated_at,21,3) AS INTEGER)) WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved';
END;
-- The existing signature-verified provider-event path projects a bound SES
-- reference onto the dispatch. That is positive acceptance evidence, including
-- a later bounce/failure; it never proves that SES did not accept the request.
CREATE TRIGGER ses_dispatch_acceptance AFTER UPDATE OF status,provider_id ON dispatches WHEN NEW.channel='email' AND NEW.mode='production' AND NEW.provider='ses' AND length(NEW.provider_id)>0 AND NEW.status IN ('accepted','delivered','failed','bounced','complained')
BEGIN
  UPDATE ses_send_reservations SET status='accepted',completed_at_ms=MAX(reserved_at_ms,CAST(strftime('%s',NEW.updated_at) AS INTEGER)*1000+CAST(substr(NEW.updated_at,21,3) AS INTEGER)) WHERE attempt_id=NEW.active_attempt_id AND organization_id=NEW.organization_id AND dispatch_id=NEW.id AND status IN ('reserved','unknown');
END;
