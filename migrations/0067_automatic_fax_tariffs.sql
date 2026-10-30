-- Operator registration binds a public commercial reference, not a currently
-- negotiated/account-assigned Telnyx rate deck. No source is installed here.
CREATE TABLE fax_tariff_refresh_sources (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 sender_id TEXT NOT NULL,
 initial_tariff_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 connection_id TEXT NOT NULL,
 outbound_profile_id TEXT NOT NULL,
 destination_prefix TEXT NOT NULL CHECK(destination_prefix='+3524'),
 options_json TEXT NOT NULL CHECK(options_json='{}'),
 tariff_catalog TEXT NOT NULL DEFAULT 'global_conversational' CHECK(tariff_catalog='global_conversational'),
 rate_deck_url TEXT NOT NULL CHECK(length(rate_deck_url) BETWEEN 1 AND 1024),
 authorization_expires_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',authorization_expires_at,'+0 seconds') IS authorization_expires_at AND authorization_expires_at<='2026-11-03T23:59:59.999Z'),
 authorization_reference TEXT NOT NULL CHECK(length(authorization_reference) BETWEEN 1 AND 500),
 commercial_basis TEXT NOT NULL CHECK(commercial_basis='public_reference_not_negotiated'),
 status TEXT NOT NULL CHECK(status IN ('active','revoked')),
 created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds') IS created_at AND created_at<authorization_expires_at),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,sender_id,account_id,connection_id,outbound_profile_id,destination_prefix,options_json),
 FOREIGN KEY(organization_id,sender_id) REFERENCES senders(organization_id,id),
 FOREIGN KEY(organization_id,initial_tariff_id) REFERENCES trusted_fax_usage_tariffs(organization_id,id)
);
CREATE TRIGGER immutable_fax_tariff_refresh_source BEFORE UPDATE ON fax_tariff_refresh_sources
WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.sender_id IS NOT OLD.sender_id
 OR NEW.initial_tariff_id IS NOT OLD.initial_tariff_id OR NEW.account_id IS NOT OLD.account_id
 OR NEW.connection_id IS NOT OLD.connection_id OR NEW.outbound_profile_id IS NOT OLD.outbound_profile_id
 OR NEW.destination_prefix IS NOT OLD.destination_prefix OR NEW.options_json IS NOT OLD.options_json
 OR NEW.tariff_catalog IS NOT OLD.tariff_catalog OR NEW.rate_deck_url IS NOT OLD.rate_deck_url OR NEW.authorization_expires_at IS NOT OLD.authorization_expires_at
 OR NEW.authorization_reference IS NOT OLD.authorization_reference OR NEW.commercial_basis IS NOT OLD.commercial_basis
 OR NEW.created_at IS NOT OLD.created_at OR (OLD.status='revoked' AND NEW.status<>'revoked')
BEGIN
 SELECT RAISE(ABORT,'immutable_fax_tariff_refresh_source');
END;
CREATE TRIGGER retained_fax_tariff_refresh_source BEFORE DELETE ON fax_tariff_refresh_sources
WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id)
BEGIN
 SELECT RAISE(ABORT,'immutable_fax_tariff_refresh_source');
END;
CREATE VIEW valid_fax_tariff_refresh_sources AS
 SELECT source.* FROM fax_tariff_refresh_sources source
 JOIN organizations organization ON organization.id=source.organization_id AND organization.mode='production'
 JOIN senders sender ON sender.organization_id=source.organization_id AND sender.id=source.sender_id AND sender.channel='fax' AND sender.mode='production' AND sender.status='verified'
 JOIN trusted_fax_usage_tariffs anchor ON anchor.organization_id=source.organization_id AND anchor.id=source.initial_tariff_id
 WHERE source.status='active' AND anchor.execution_scope='live' AND anchor.provider='telnyx'
 AND source.tariff_catalog='global_conversational'
 AND anchor.sender_id=source.sender_id AND anchor.account_id=source.account_id
 AND anchor.connection_id=source.connection_id AND anchor.outbound_profile_id=source.outbound_profile_id
 AND anchor.destination_prefix=source.destination_prefix AND anchor.options_json=source.options_json
 AND anchor.origin_class='local' AND anchor.sender_country_code='LU' AND anchor.destination_country_code='LU'
 AND anchor.destination_category='fixed' AND anchor.route_qualification='operator_test'
 AND anchor.route_allowed=1 AND anchor.local_calling_verified=0 AND anchor.max_pages<=7
 AND anchor.operator_test_ceiling_minor<=200 AND anchor.quote_ttl_seconds<=900
 AND anchor.initial_seconds=60 AND anchor.increment_seconds=60 AND anchor.call_nano_usd=0
 AND substr(sender.address,1,length(anchor.sender_prefix))=anchor.sender_prefix;

CREATE TABLE fax_tariff_refresh_state (
 organization_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 last_attempt_at TEXT,
 last_success_at TEXT,
 last_error_code TEXT CHECK(last_error_code IS NULL OR last_error_code IN ('SOURCE_HTTP','SOURCE_TOO_LARGE','SOURCE_INVALID','SOURCE_TIMEOUT','PROVIDER_UNAVAILABLE','BINDING_CHANGED','QUOTE_ACTIVE','COMMIT_CHANGED','DATABASE_UNAVAILABLE','AUTHORITY_EXPIRED')),
 next_due_at TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT,
 failure_count INTEGER NOT NULL DEFAULT 0 CHECK(failure_count BETWEEN 0 AND 16),
 applying_tariff_id TEXT,
 PRIMARY KEY(organization_id,source_id),
 FOREIGN KEY(organization_id,source_id) REFERENCES fax_tariff_refresh_sources(organization_id,id)
);
CREATE INDEX due_fax_tariff_refresh ON fax_tariff_refresh_state(next_due_at,lease_until);
CREATE TRIGGER registered_fax_tariff_refresh_source AFTER INSERT ON fax_tariff_refresh_sources
BEGIN
 SELECT RAISE(ABORT,'fax_tariff_refresh_source_invalid') WHERE NEW.status<>'active' OR NOT EXISTS(
  SELECT 1 FROM valid_fax_tariff_refresh_sources valid JOIN trusted_fax_usage_tariffs anchor ON anchor.organization_id=valid.organization_id AND anchor.id=valid.initial_tariff_id
  WHERE valid.organization_id=NEW.organization_id AND valid.id=NEW.id AND anchor.status='qualified'
 );
 INSERT INTO fax_tariff_refresh_state(organization_id,source_id,next_due_at) VALUES(NEW.organization_id,NEW.id,NEW.created_at);
END;

CREATE TABLE fax_tariff_refresh_evidence (
 organization_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 tariff_id TEXT NOT NULL,
 previous_tariff_id TEXT NOT NULL,
 previous_tariff_sha256 TEXT NOT NULL CHECK(length(previous_tariff_sha256)=64),
 discovery_sha256 TEXT NOT NULL CHECK(length(discovery_sha256)=64),
 rate_deck_url TEXT NOT NULL CHECK(length(rate_deck_url) BETWEEN 1 AND 1024),
 discovery_observed_at TEXT NOT NULL,
 page_sha256 TEXT NOT NULL CHECK(length(page_sha256)=64),
 deck_sha256 TEXT NOT NULL CHECK(length(deck_sha256)=64),
 fx_sha256 TEXT NOT NULL CHECK(length(fx_sha256)=64),
 source_observed_at TEXT NOT NULL,
 profile_inspected_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,tariff_id),
 FOREIGN KEY(organization_id,source_id) REFERENCES fax_tariff_refresh_sources(organization_id,id),
 FOREIGN KEY(organization_id,tariff_id) REFERENCES trusted_fax_usage_tariffs(organization_id,id),
 FOREIGN KEY(organization_id,previous_tariff_id) REFERENCES trusted_fax_usage_tariffs(organization_id,id)
);
CREATE TRIGGER immutable_fax_tariff_refresh_evidence BEFORE UPDATE ON fax_tariff_refresh_evidence
BEGIN
 SELECT RAISE(ABORT,'immutable_fax_tariff_refresh_evidence');
END;
CREATE TRIGGER retained_fax_tariff_refresh_evidence BEFORE DELETE ON fax_tariff_refresh_evidence
WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id)
BEGIN
 SELECT RAISE(ABORT,'immutable_fax_tariff_refresh_evidence');
END;
