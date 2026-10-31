-- Operational incidents only. This creates no registration, authority or send.
-- IS TRUE combines required-value and admissibility checks to keep the global
-- quick_check program within D1's VDBE budget. Keep CHECK enforcement enabled.
-- Dates and DEFAULT columns retain NOT NULL, including REPLACE semantics.
CREATE TABLE provider_freshness_bindings (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 family TEXT CHECK((
  family='fax_tariff' OR family='delivery_policy' OR family='fax_authority'
  OR family='resend_tariff' OR family='resend_send_limits'
 ) IS TRUE),
 binding_sha256 TEXT CHECK((length(binding_sha256)=64 AND binding_sha256 NOT GLOB '*[^0-9a-f]*') IS TRUE),
 active INTEGER CHECK((active=0 OR active=1) IS TRUE),
 evaluated_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',evaluated_at,'+0 seconds') IS evaluated_at),
 evaluation_sha256 TEXT CHECK((length(evaluation_sha256)=64 AND evaluation_sha256 NOT GLOB '*[^0-9a-f]*') IS TRUE),
 PRIMARY KEY(organization_id,family,binding_sha256)
);
CREATE TABLE provider_freshness_incidents (
 organization_id TEXT NOT NULL,
 incident_sha256 TEXT CHECK((length(incident_sha256)=64 AND incident_sha256 NOT GLOB '*[^0-9a-f]*') IS TRUE),
 family TEXT CHECK((
  family='fax_tariff' OR family='delivery_policy' OR family='fax_authority'
  OR family='resend_tariff' OR family='resend_send_limits'
 ) IS TRUE),
 binding_sha256 TEXT NOT NULL,
 revision_sha256 TEXT CHECK((length(revision_sha256)=64 AND revision_sha256 NOT GLOB '*[^0-9a-f]*') IS TRUE),
 deadline_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',deadline_at,'+0 seconds') IS deadline_at),
 renewal_mode TEXT CHECK((renewal_mode='automatic' OR renewal_mode='operator') IS TRUE),
 warning_seconds INTEGER NOT NULL DEFAULT 86400 CHECK(warning_seconds=86400),
 state TEXT NOT NULL,
 opened_at TEXT NOT NULL,
 last_evaluated_at TEXT NOT NULL,
 resolved_at TEXT,
 resolution TEXT,
 reopened_count INTEGER NOT NULL DEFAULT 0 CHECK(reopened_count>=0),
 PRIMARY KEY(organization_id,incident_sha256),
 FOREIGN KEY(organization_id,family,binding_sha256) REFERENCES provider_freshness_bindings(organization_id,family,binding_sha256) ON DELETE CASCADE,
 CHECK(
  (state IS 'resolved' AND resolved_at IS NOT NULL AND (resolution IS 'replaced' OR resolution IS 'disabled'))
  OR ((state IS 'at_risk' OR state IS 'expired') AND resolved_at IS NULL AND resolution IS NULL)
 ),
 CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+0 seconds') IS opened_at),
 CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',last_evaluated_at,'+0 seconds') IS last_evaluated_at AND last_evaluated_at>=opened_at)
);
CREATE INDEX open_provider_freshness_incidents ON provider_freshness_incidents(state,deadline_at);
-- Fair inspection progress only. Missing targets never resolve an incident.
CREATE TABLE provider_freshness_cursors (
 mechanism TEXT PRIMARY KEY CHECK(
  mechanism='fax' OR mechanism='fax_manual' OR mechanism='fax_legacy'
  OR mechanism='postal' OR mechanism='resend' OR mechanism='delivery_manual'
 ),
 after_organization_id TEXT CHECK((length(after_organization_id)<=200) IS TRUE),
 after_target_id TEXT CHECK((length(after_target_id)<=200) IS TRUE),
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
