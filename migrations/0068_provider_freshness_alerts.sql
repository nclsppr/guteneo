-- Operational incidents only. This creates no registration, authority or send.
CREATE TABLE provider_freshness_bindings (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 family TEXT NOT NULL CHECK(family IN ('fax_tariff','delivery_policy','fax_authority','resend_tariff','resend_send_limits')),
 binding_sha256 TEXT NOT NULL CHECK(length(binding_sha256)=64 AND binding_sha256 NOT GLOB '*[^0-9a-f]*'),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 evaluated_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',evaluated_at,'+0 seconds') IS evaluated_at),
 evaluation_sha256 TEXT NOT NULL CHECK(length(evaluation_sha256)=64 AND evaluation_sha256 NOT GLOB '*[^0-9a-f]*'),
 PRIMARY KEY(organization_id,family,binding_sha256)
);
CREATE TABLE provider_freshness_incidents (
 organization_id TEXT NOT NULL,
 incident_sha256 TEXT NOT NULL CHECK(length(incident_sha256)=64 AND incident_sha256 NOT GLOB '*[^0-9a-f]*'),
 family TEXT NOT NULL CHECK(family IN ('fax_tariff','delivery_policy','fax_authority','resend_tariff','resend_send_limits')),
 binding_sha256 TEXT NOT NULL,
 revision_sha256 TEXT NOT NULL CHECK(length(revision_sha256)=64 AND revision_sha256 NOT GLOB '*[^0-9a-f]*'),
 deadline_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',deadline_at,'+0 seconds') IS deadline_at),
 renewal_mode TEXT NOT NULL CHECK(renewal_mode IN ('automatic','operator')),
 warning_seconds INTEGER NOT NULL DEFAULT 86400 CHECK(warning_seconds=86400),
 state TEXT NOT NULL CHECK(state IN ('at_risk','expired','resolved')),
 opened_at TEXT NOT NULL,
 last_evaluated_at TEXT NOT NULL,
 resolved_at TEXT,
 resolution TEXT CHECK(resolution IS NULL OR resolution IN ('replaced','disabled')),
 reopened_count INTEGER NOT NULL DEFAULT 0 CHECK(reopened_count>=0),
 PRIMARY KEY(organization_id,incident_sha256),
 FOREIGN KEY(organization_id,family,binding_sha256) REFERENCES provider_freshness_bindings(organization_id,family,binding_sha256) ON DELETE CASCADE,
 CHECK((state='resolved' AND resolved_at IS NOT NULL AND resolution IS NOT NULL) OR (state<>'resolved' AND resolved_at IS NULL AND resolution IS NULL)),
 CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+0 seconds') IS opened_at),
 CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',last_evaluated_at,'+0 seconds') IS last_evaluated_at AND last_evaluated_at>=opened_at)
);
CREATE INDEX open_provider_freshness_incidents ON provider_freshness_incidents(state,deadline_at);
-- Fair inspection progress only. Missing targets never resolve an incident.
CREATE TABLE provider_freshness_cursors (
 mechanism TEXT PRIMARY KEY CHECK(mechanism IN ('fax','fax_manual','fax_legacy','postal','resend','delivery_manual')),
 after_organization_id TEXT NOT NULL CHECK(length(after_organization_id)<=200),
 after_target_id TEXT NOT NULL CHECK(length(after_target_id)<=200),
 updated_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds') IS updated_at)
);
CREATE TRIGGER immutable_provider_freshness_incident BEFORE UPDATE ON provider_freshness_incidents
WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.incident_sha256 IS NOT OLD.incident_sha256
 OR NEW.family IS NOT OLD.family OR NEW.binding_sha256 IS NOT OLD.binding_sha256
 OR NEW.revision_sha256 IS NOT OLD.revision_sha256 OR NEW.deadline_at IS NOT OLD.deadline_at
 OR NEW.renewal_mode IS NOT OLD.renewal_mode OR NEW.warning_seconds IS NOT OLD.warning_seconds
 OR NEW.opened_at IS NOT OLD.opened_at OR NEW.last_evaluated_at<OLD.last_evaluated_at OR NEW.reopened_count<OLD.reopened_count
BEGIN
 SELECT RAISE(ABORT,'immutable_provider_freshness_incident');
END;
