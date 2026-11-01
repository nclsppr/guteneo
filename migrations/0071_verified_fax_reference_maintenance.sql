-- Exact existing FR/DE commercial references, separate from the LU operator pilot.
-- No registration, tariff, authority, price, approval or communication is installed here.
-- Required-value and admissibility checks are fused with IS TRUE where possible;
-- NULL remains rejected to reduce the global D1 quick_check bytecode budget.
CREATE TABLE verified_fax_reference_sets (
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 id TEXT CHECK((length(id) BETWEEN 1 AND 200) IS TRUE),
 sender_id TEXT NOT NULL,
 sender_address_sha256 TEXT CHECK((length(sender_address_sha256)=64 AND sender_address_sha256 NOT GLOB '*[^0-9a-f]*') IS TRUE),
 account_id TEXT CHECK((length(account_id) BETWEEN 1 AND 200) IS TRUE),
 connection_id TEXT CHECK((length(connection_id) BETWEEN 1 AND 200) IS TRUE),
 outbound_profile_id TEXT CHECK((length(outbound_profile_id) BETWEEN 1 AND 200) IS TRUE),
 options_json TEXT CHECK((options_json='{}') IS TRUE),
 bindings_json TEXT CHECK((length(bindings_json)<=262144 AND json_valid(bindings_json) AND json_type(bindings_json)='array' AND json_array_length(bindings_json)=14) IS TRUE),
 exclusions_json TEXT CHECK((length(exclusions_json)<=65536 AND json_valid(exclusions_json) AND json_type(exclusions_json)='array' AND json_array_length(exclusions_json)=4) IS TRUE),
 commercial_basis TEXT CHECK((commercial_basis='public_reference_not_negotiated') IS TRUE),
 status TEXT CHECK((status IN ('active','revoked')) IS TRUE),
 created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds') IS created_at),
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,sender_id,account_id,connection_id,outbound_profile_id,options_json),
 FOREIGN KEY(organization_id,sender_id) REFERENCES senders(organization_id,id)
);
CREATE TRIGGER immutable_verified_fax_reference_set BEFORE UPDATE ON verified_fax_reference_sets
WHEN NEW.organization_id IS NOT OLD.organization_id
 OR NEW.id IS NOT OLD.id
 OR NEW.sender_id IS NOT OLD.sender_id
 OR NEW.sender_address_sha256 IS NOT OLD.sender_address_sha256
 OR NEW.account_id IS NOT OLD.account_id
 OR NEW.connection_id IS NOT OLD.connection_id
 OR NEW.outbound_profile_id IS NOT OLD.outbound_profile_id
 OR NEW.options_json IS NOT OLD.options_json
 OR NEW.bindings_json IS NOT OLD.bindings_json
 OR NEW.exclusions_json IS NOT OLD.exclusions_json
 OR NEW.commercial_basis IS NOT OLD.commercial_basis
 OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.status='revoked' AND NEW.status<>'revoked')
BEGIN SELECT RAISE(ABORT,'immutable_verified_fax_reference_set'); END;
CREATE TRIGGER retained_verified_fax_reference_set BEFORE DELETE ON verified_fax_reference_sets
WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id)
BEGIN SELECT RAISE(ABORT,'immutable_verified_fax_reference_set'); END;

CREATE TABLE verified_fax_reference_state (
 organization_id TEXT NOT NULL,
 set_id TEXT NOT NULL,
 last_attempt_at TEXT CHECK(last_attempt_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ',last_attempt_at,'+0 seconds') IS last_attempt_at)),
 last_success_at TEXT CHECK(last_success_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ',last_success_at,'+0 seconds') IS last_success_at)),
 last_error_code TEXT CHECK(last_error_code IS NULL OR last_error_code IN ('SOURCE_HTTP','SOURCE_TOO_LARGE','SOURCE_INVALID','SOURCE_TIMEOUT','PROVIDER_UNAVAILABLE','BINDING_CHANGED','EXCLUSION_CHANGED','QUOTE_ACTIVE','COMMIT_CHANGED','DATABASE_UNAVAILABLE','COMMIT_UNCONFIRMED')),
 next_due_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',next_due_at,'+0 seconds') IS next_due_at),
 failure_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(failure_count)='integer' AND failure_count BETWEEN 0 AND 16),
 lease_token TEXT,
 lease_until TEXT,
 applying_revision_sha256 TEXT,
 applying_plan_json TEXT,
 PRIMARY KEY(organization_id,set_id),
 FOREIGN KEY(organization_id,set_id) REFERENCES verified_fax_reference_sets(organization_id,id),
 CHECK((lease_token IS NULL AND lease_until IS NULL) OR (lease_token IS NOT NULL AND length(lease_token) BETWEEN 1 AND 200 AND lease_until IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ',lease_until,'+0 seconds') IS lease_until))),
 CHECK((applying_revision_sha256 IS NULL AND applying_plan_json IS NULL) OR (applying_revision_sha256 IS NOT NULL AND length(applying_revision_sha256)=64 AND applying_revision_sha256 NOT GLOB '*[^0-9a-f]*' AND applying_plan_json IS NOT NULL AND length(applying_plan_json)<=1048576 AND json_valid(applying_plan_json) AND json_type(applying_plan_json)='object'))
);
CREATE INDEX due_verified_fax_reference_sets ON verified_fax_reference_state(next_due_at,lease_until);
CREATE TRIGGER immutable_verified_fax_reference_state_identity BEFORE UPDATE ON verified_fax_reference_state
WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.set_id IS NOT OLD.set_id
BEGIN SELECT RAISE(ABORT,'immutable_verified_fax_reference_state_identity'); END;

CREATE TABLE verified_fax_reference_tariffs (
 organization_id TEXT NOT NULL,
 set_id TEXT NOT NULL,
 tariff_id TEXT NOT NULL,
 binding_sha256 TEXT CHECK((length(binding_sha256)=64 AND binding_sha256 NOT GLOB '*[^0-9a-f]*') IS TRUE),
 PRIMARY KEY(organization_id,set_id,tariff_id),
 UNIQUE(organization_id,tariff_id),
 FOREIGN KEY(organization_id,set_id) REFERENCES verified_fax_reference_sets(organization_id,id),
 FOREIGN KEY(organization_id,tariff_id) REFERENCES trusted_fax_usage_tariffs(organization_id,id)
);
CREATE INDEX verified_fax_reference_binding ON verified_fax_reference_tariffs(organization_id,binding_sha256);
CREATE TRIGGER immutable_verified_fax_reference_tariff BEFORE UPDATE ON verified_fax_reference_tariffs
BEGIN SELECT RAISE(ABORT,'immutable_verified_fax_reference_tariff'); END;
CREATE TRIGGER retained_verified_fax_reference_tariff BEFORE DELETE ON verified_fax_reference_tariffs
WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id)
BEGIN SELECT RAISE(ABORT,'immutable_verified_fax_reference_tariff'); END;

CREATE TABLE verified_fax_reference_evidence (
 organization_id TEXT NOT NULL,
 set_id TEXT NOT NULL,
 revision_sha256 TEXT CHECK((length(revision_sha256)=64 AND revision_sha256 NOT GLOB '*[^0-9a-f]*') IS TRUE),
 observed_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',observed_at,'+0 seconds') IS observed_at),
 expires_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',expires_at,'+0 seconds') IS expires_at AND expires_at>observed_at AND expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ',observed_at,'+7 days')),
 evidence_json TEXT CHECK((length(evidence_json)<=262144 AND json_valid(evidence_json) AND json_type(evidence_json)='object') IS TRUE),
 tariff_ids_json TEXT CHECK((length(tariff_ids_json)<=8192 AND json_valid(tariff_ids_json) AND json_type(tariff_ids_json)='array' AND json_array_length(tariff_ids_json)=14) IS TRUE),
 PRIMARY KEY(organization_id,set_id,revision_sha256),
 FOREIGN KEY(organization_id,set_id) REFERENCES verified_fax_reference_sets(organization_id,id)
);
CREATE TRIGGER immutable_verified_fax_reference_evidence BEFORE UPDATE ON verified_fax_reference_evidence
BEGIN SELECT RAISE(ABORT,'immutable_verified_fax_reference_evidence'); END;
CREATE TRIGGER retained_verified_fax_reference_evidence BEFORE DELETE ON verified_fax_reference_evidence
WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id)
BEGIN SELECT RAISE(ABORT,'immutable_verified_fax_reference_evidence'); END;

-- This view checks persisted structure and current source/anchor/exclusion rows.
-- Runtime and collector additionally compare the exact sender-address SHA-256;
-- SQL commit fences bind its freshly inspected address without logging it.
-- Balanced Boolean associations preserve every predicate within D1 depth limits.
CREATE VIEW valid_verified_fax_reference_sets AS
 SELECT source.* FROM verified_fax_reference_sets source
 WHERE ((source.status='active')
    AND (EXISTS(SELECT 1 FROM organizations o JOIN senders sender ON sender.organization_id=o.id
    WHERE ((o.id=source.organization_id)
    AND ((o.mode='production')
    AND (sender.id=source.sender_id)))
    AND ((sender.channel='fax')
    AND ((sender.mode='production')
    AND (sender.status='verified'))))))
    AND ((NOT EXISTS(SELECT 1 FROM json_each(source.bindings_json) b WHERE NOT EXISTS(
     SELECT 1 FROM trusted_fax_usage_tariffs t
      WHERE ((((t.organization_id=source.organization_id)
    AND ((t.id=json_extract(b.value,'$.id'))
    AND (t.sender_id=source.sender_id)))
    AND ((t.account_id=source.account_id)
    AND ((t.connection_id=source.connection_id)
    AND (t.outbound_profile_id=source.outbound_profile_id))))
    AND (((t.options_json=source.options_json)
    AND ((t.status IN ('qualified','revoked'))
    AND (t.provider='telnyx')))
    AND ((t.execution_scope='live')
    AND ((t.route_qualification='provider_verified')
    AND (t.origin_class='eea')))))
    AND ((((t.sender_country_code='LU')
    AND ((t.destination_category='fixed')
    AND (t.route_allowed=1)))
    AND ((t.initial_seconds=60)
    AND ((t.increment_seconds=60)
    AND (t.call_nano_usd=0))))
    AND (((t.max_pages<=10)
    AND ((t.quote_ttl_seconds<=900)
    AND (t.destination_prefix IN ('+331','+332','+333','+334','+335','+339','+492','+493','+494','+495','+496','+497','+498','+499'))))
    AND ((((((substr(t.destination_prefix,1,3)='+33')
    AND (t.destination_country_code='FR')))
    OR (((substr(t.destination_prefix,1,3)='+49')
    AND (t.destination_country_code='DE')))))
    AND ((EXISTS(SELECT 1 FROM senders sender WHERE (sender.organization_id=source.organization_id)
    AND ((sender.id=source.sender_id)
    AND (substr(sender.address,1,length(t.sender_prefix))=t.sender_prefix))))
    AND (((((((t.id IS json_extract(b.value,'$.id'))
    AND ((t.organization_id IS json_extract(b.value,'$.organization_id'))
    AND (t.sender_id IS json_extract(b.value,'$.sender_id'))))
    AND ((t.provider IS json_extract(b.value,'$.provider'))
    AND ((t.account_id IS json_extract(b.value,'$.account_id'))
    AND (t.connection_id IS json_extract(b.value,'$.connection_id'))))))
    AND (((((t.outbound_profile_id IS json_extract(b.value,'$.outbound_profile_id'))
    AND ((t.sender_prefix IS json_extract(b.value,'$.sender_prefix'))
    AND (t.destination_prefix IS json_extract(b.value,'$.destination_prefix'))))
    AND ((t.sender_country_code IS json_extract(b.value,'$.sender_country_code'))
    AND ((t.destination_country_code IS json_extract(b.value,'$.destination_country_code'))
    AND (t.origin_class IS json_extract(b.value,'$.origin_class'))))))
    AND ((((t.destination_category IS json_extract(b.value,'$.destination_category'))
    AND ((t.route_allowed IS json_extract(b.value,'$.route_allowed'))
    AND (t.route_qualification IS json_extract(b.value,'$.route_qualification'))))
    AND ((t.operator_authorization_reference IS json_extract(b.value,'$.operator_authorization_reference'))
    AND ((t.operator_test_ceiling_minor IS json_extract(b.value,'$.operator_test_ceiling_minor'))
    AND (t.local_calling_verified IS json_extract(b.value,'$.local_calling_verified'))))))))
    AND ((((((t.options_json IS json_extract(b.value,'$.options_json'))
    AND ((t.currency IS json_extract(b.value,'$.currency'))
    AND (t.page_nano_usd IS json_extract(b.value,'$.page_nano_usd'))))
    AND ((t.minute_nano_usd IS json_extract(b.value,'$.minute_nano_usd'))
    AND ((t.call_nano_usd IS json_extract(b.value,'$.call_nano_usd'))
    AND (t.initial_seconds IS json_extract(b.value,'$.initial_seconds'))))))
    AND ((((t.increment_seconds IS json_extract(b.value,'$.increment_seconds'))
    AND ((t.duration_base_seconds IS json_extract(b.value,'$.duration_base_seconds'))
    AND (t.duration_low_per_page_seconds IS json_extract(b.value,'$.duration_low_per_page_seconds'))))
    AND ((t.duration_high_per_page_seconds IS json_extract(b.value,'$.duration_high_per_page_seconds'))
    AND ((t.fx_numerator IS json_extract(b.value,'$.fx_numerator'))
    AND (t.fx_denominator IS json_extract(b.value,'$.fx_denominator')))))))
    AND (((((t.fx_date IS json_extract(b.value,'$.fx_date'))
    AND ((t.fx_source IS json_extract(b.value,'$.fx_source'))
    AND (t.max_pages IS json_extract(b.value,'$.max_pages'))))
    AND ((t.quote_ttl_seconds IS json_extract(b.value,'$.quote_ttl_seconds'))
    AND ((t.source_reference IS json_extract(b.value,'$.source_reference'))
    AND (t.source_sha256 IS json_extract(b.value,'$.source_sha256'))))))
    AND ((((t.valid_from IS json_extract(b.value,'$.valid_from'))
    AND ((t.expires_at IS json_extract(b.value,'$.expires_at'))
    AND (t.created_at IS json_extract(b.value,'$.created_at'))))
    AND ((t.execution_scope IS json_extract(b.value,'$.execution_scope'))
    AND ((t.review_authority_id IS json_extract(b.value,'$.review_authority_id'))
    AND (t.evidence_observed_at IS json_extract(b.value,'$.evidence_observed_at')))))))))))))))))
    AND (NOT EXISTS(SELECT 1 FROM json_each(source.exclusions_json) b WHERE NOT EXISTS(
     SELECT 1 FROM trusted_fax_usage_tariffs t
      WHERE ((((t.organization_id=source.organization_id)
    AND (t.id=json_extract(b.value,'$.id')))
    AND ((t.sender_id=source.sender_id)
    AND (t.account_id=source.account_id)))
    AND (((t.connection_id=source.connection_id)
    AND (t.outbound_profile_id=source.outbound_profile_id))
    AND ((t.options_json=source.options_json)
    AND (t.status='qualified'))))
    AND ((((t.provider='telnyx')
    AND (t.execution_scope='live'))
    AND ((t.route_qualification='provider_verified')
    AND (t.origin_class='eea')))
    AND (((t.sender_country_code='LU')
    AND (t.route_allowed=0))
    AND ((t.destination_prefix IN ('+33182883934','+4932','+49700','+49800'))
    AND ((((((((t.id IS json_extract(b.value,'$.id'))
    AND ((t.organization_id IS json_extract(b.value,'$.organization_id'))
    AND (t.sender_id IS json_extract(b.value,'$.sender_id'))))
    AND ((t.provider IS json_extract(b.value,'$.provider'))
    AND ((t.account_id IS json_extract(b.value,'$.account_id'))
    AND (t.connection_id IS json_extract(b.value,'$.connection_id'))))))
    AND ((((t.outbound_profile_id IS json_extract(b.value,'$.outbound_profile_id'))
    AND ((t.sender_prefix IS json_extract(b.value,'$.sender_prefix'))
    AND (t.destination_prefix IS json_extract(b.value,'$.destination_prefix'))))
    AND ((t.sender_country_code IS json_extract(b.value,'$.sender_country_code'))
    AND ((t.destination_country_code IS json_extract(b.value,'$.destination_country_code'))
    AND (t.origin_class IS json_extract(b.value,'$.origin_class')))))))
    AND (((((t.destination_category IS json_extract(b.value,'$.destination_category'))
    AND ((t.route_allowed IS json_extract(b.value,'$.route_allowed'))
    AND (t.route_qualification IS json_extract(b.value,'$.route_qualification'))))
    AND ((t.operator_authorization_reference IS json_extract(b.value,'$.operator_authorization_reference'))
    AND ((t.operator_test_ceiling_minor IS json_extract(b.value,'$.operator_test_ceiling_minor'))
    AND (t.local_calling_verified IS json_extract(b.value,'$.local_calling_verified'))))))
    AND ((((t.options_json IS json_extract(b.value,'$.options_json'))
    AND ((t.currency IS json_extract(b.value,'$.currency'))
    AND (t.page_nano_usd IS json_extract(b.value,'$.page_nano_usd'))))
    AND ((t.minute_nano_usd IS json_extract(b.value,'$.minute_nano_usd'))
    AND ((t.call_nano_usd IS json_extract(b.value,'$.call_nano_usd'))
    AND (t.initial_seconds IS json_extract(b.value,'$.initial_seconds'))))))))
    AND ((((((t.increment_seconds IS json_extract(b.value,'$.increment_seconds'))
    AND ((t.duration_base_seconds IS json_extract(b.value,'$.duration_base_seconds'))
    AND (t.duration_low_per_page_seconds IS json_extract(b.value,'$.duration_low_per_page_seconds'))))
    AND ((t.duration_high_per_page_seconds IS json_extract(b.value,'$.duration_high_per_page_seconds'))
    AND ((t.fx_numerator IS json_extract(b.value,'$.fx_numerator'))
    AND (t.fx_denominator IS json_extract(b.value,'$.fx_denominator'))))))
    AND ((((t.fx_date IS json_extract(b.value,'$.fx_date'))
    AND ((t.fx_source IS json_extract(b.value,'$.fx_source'))
    AND (t.max_pages IS json_extract(b.value,'$.max_pages'))))
    AND ((t.quote_ttl_seconds IS json_extract(b.value,'$.quote_ttl_seconds'))
    AND ((t.source_reference IS json_extract(b.value,'$.source_reference'))
    AND (t.source_sha256 IS json_extract(b.value,'$.source_sha256')))))))
    AND (((((t.valid_from IS json_extract(b.value,'$.valid_from'))
    AND ((t.expires_at IS json_extract(b.value,'$.expires_at'))
    AND (t.status IS json_extract(b.value,'$.status'))))
    AND ((t.created_at IS json_extract(b.value,'$.created_at'))
    AND ((t.execution_scope IS json_extract(b.value,'$.execution_scope'))
    AND (t.review_authority_id IS json_extract(b.value,'$.review_authority_id'))))))
    AND ((t.evidence_observed_at IS json_extract(b.value,'$.evidence_observed_at'))))))))))))));

CREATE TRIGGER registered_verified_fax_reference_set AFTER INSERT ON verified_fax_reference_sets
BEGIN
 -- Independent equivalent guards keep D1's expression depth bounded.
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NEW.status<>'active';
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   NOT EXISTS(SELECT 1 FROM json_each(NEW.bindings_json) b
    WHERE b.type<>'object' OR (SELECT COUNT(*) FROM json_each(b.value))<>43
     OR (SELECT COUNT(DISTINCT key) FROM json_each(b.value))<>43
     OR EXISTS(SELECT 1 FROM json_each(b.value) field WHERE field.type NOT IN ('text','integer','null'))
     OR EXISTS(SELECT 1 FROM json_each(b.value) field WHERE field.key NOT IN ('id','organization_id','sender_id','provider','account_id','connection_id','outbound_profile_id','sender_prefix','destination_prefix','sender_country_code','destination_country_code','origin_class','destination_category','route_allowed','route_qualification','operator_authorization_reference','operator_test_ceiling_minor','local_calling_verified','options_json','currency','page_nano_usd','minute_nano_usd','call_nano_usd','initial_seconds','increment_seconds','duration_base_seconds','duration_low_per_page_seconds','duration_high_per_page_seconds','fx_numerator','fx_denominator','fx_date','fx_source','max_pages','quote_ttl_seconds','source_reference','source_sha256','valid_from','expires_at','status','created_at','execution_scope','review_authority_id','evidence_observed_at')))
 );
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   (SELECT COUNT(DISTINCT json_extract(value,'$.id')) FROM json_each(NEW.bindings_json))=14
 );
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   (SELECT COUNT(DISTINCT json_extract(value,'$.destination_prefix')) FROM json_each(NEW.bindings_json))=14
 );
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   NOT EXISTS(SELECT 1 FROM json_each(NEW.exclusions_json) b
    WHERE b.type<>'object' OR (SELECT COUNT(*) FROM json_each(b.value))<>43
     OR (SELECT COUNT(DISTINCT key) FROM json_each(b.value))<>43
     OR EXISTS(SELECT 1 FROM json_each(b.value) field WHERE field.type NOT IN ('text','integer','null'))
     OR EXISTS(SELECT 1 FROM json_each(b.value) field WHERE field.key NOT IN ('id','organization_id','sender_id','provider','account_id','connection_id','outbound_profile_id','sender_prefix','destination_prefix','sender_country_code','destination_country_code','origin_class','destination_category','route_allowed','route_qualification','operator_authorization_reference','operator_test_ceiling_minor','local_calling_verified','options_json','currency','page_nano_usd','minute_nano_usd','call_nano_usd','initial_seconds','increment_seconds','duration_base_seconds','duration_low_per_page_seconds','duration_high_per_page_seconds','fx_numerator','fx_denominator','fx_date','fx_source','max_pages','quote_ttl_seconds','source_reference','source_sha256','valid_from','expires_at','status','created_at','execution_scope','review_authority_id','evidence_observed_at')))
 );
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   (SELECT COUNT(DISTINCT json_extract(value,'$.id')) FROM json_each(NEW.exclusions_json))=4
 );
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   (SELECT COUNT(DISTINCT json_extract(value,'$.destination_prefix')) FROM json_each(NEW.exclusions_json))=4
 );
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   EXISTS(SELECT 1 FROM organizations o JOIN senders sender ON sender.organization_id=o.id
    WHERE o.id=NEW.organization_id AND o.mode='production' AND sender.id=NEW.sender_id
     AND sender.channel='fax' AND sender.mode='production' AND sender.status='verified')
 );
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   NOT EXISTS(SELECT 1 FROM json_each(NEW.bindings_json) b WHERE NOT EXISTS(
     SELECT 1 FROM trusted_fax_usage_tariffs t
      WHERE t.organization_id=NEW.organization_id AND t.id=json_extract(b.value,'$.id')
       AND t.sender_id=NEW.sender_id AND t.account_id=NEW.account_id
       AND t.connection_id=NEW.connection_id AND t.outbound_profile_id=NEW.outbound_profile_id
       AND t.options_json=NEW.options_json AND t.status = 'qualified'
       AND t.provider='telnyx' AND t.execution_scope='live' AND t.route_qualification='provider_verified'
       AND t.origin_class='eea' AND t.sender_country_code='LU' AND t.destination_category='fixed'
       AND t.route_allowed=1 AND t.initial_seconds=60 AND t.increment_seconds=60
       AND t.call_nano_usd=0 AND t.max_pages<=10 AND t.quote_ttl_seconds<=900
       AND t.destination_prefix IN ('+331','+332','+333','+334','+335','+339','+492','+493','+494','+495','+496','+497','+498','+499')
       AND ((substr(t.destination_prefix,1,3)='+33' AND t.destination_country_code='FR')
         OR (substr(t.destination_prefix,1,3)='+49' AND t.destination_country_code='DE'))
       AND EXISTS(SELECT 1 FROM senders sender WHERE sender.organization_id=NEW.organization_id AND sender.id=NEW.sender_id
         AND substr(sender.address,1,length(t.sender_prefix))=t.sender_prefix)
       AND (
(t.id IS json_extract(b.value,'$.id')
          AND t.organization_id IS json_extract(b.value,'$.organization_id')
          AND t.sender_id IS json_extract(b.value,'$.sender_id')
          AND t.provider IS json_extract(b.value,'$.provider')
          AND t.account_id IS json_extract(b.value,'$.account_id')
          AND t.connection_id IS json_extract(b.value,'$.connection_id'))
        AND (t.outbound_profile_id IS json_extract(b.value,'$.outbound_profile_id')
          AND t.sender_prefix IS json_extract(b.value,'$.sender_prefix')
          AND t.destination_prefix IS json_extract(b.value,'$.destination_prefix')
          AND t.sender_country_code IS json_extract(b.value,'$.sender_country_code')
          AND t.destination_country_code IS json_extract(b.value,'$.destination_country_code')
          AND t.origin_class IS json_extract(b.value,'$.origin_class'))
        AND (t.destination_category IS json_extract(b.value,'$.destination_category')
          AND t.route_allowed IS json_extract(b.value,'$.route_allowed')
          AND t.route_qualification IS json_extract(b.value,'$.route_qualification')
          AND t.operator_authorization_reference IS json_extract(b.value,'$.operator_authorization_reference')
          AND t.operator_test_ceiling_minor IS json_extract(b.value,'$.operator_test_ceiling_minor')
          AND t.local_calling_verified IS json_extract(b.value,'$.local_calling_verified'))
        AND (t.options_json IS json_extract(b.value,'$.options_json')
          AND t.currency IS json_extract(b.value,'$.currency')
          AND t.page_nano_usd IS json_extract(b.value,'$.page_nano_usd')
          AND t.minute_nano_usd IS json_extract(b.value,'$.minute_nano_usd')
          AND t.call_nano_usd IS json_extract(b.value,'$.call_nano_usd')
          AND t.initial_seconds IS json_extract(b.value,'$.initial_seconds'))
        AND (t.increment_seconds IS json_extract(b.value,'$.increment_seconds')
          AND t.duration_base_seconds IS json_extract(b.value,'$.duration_base_seconds')
          AND t.duration_low_per_page_seconds IS json_extract(b.value,'$.duration_low_per_page_seconds')
          AND t.duration_high_per_page_seconds IS json_extract(b.value,'$.duration_high_per_page_seconds')
          AND t.fx_numerator IS json_extract(b.value,'$.fx_numerator')
          AND t.fx_denominator IS json_extract(b.value,'$.fx_denominator'))
        AND (t.fx_date IS json_extract(b.value,'$.fx_date')
          AND t.fx_source IS json_extract(b.value,'$.fx_source')
          AND t.max_pages IS json_extract(b.value,'$.max_pages')
          AND t.quote_ttl_seconds IS json_extract(b.value,'$.quote_ttl_seconds')
          AND t.source_reference IS json_extract(b.value,'$.source_reference')
          AND t.source_sha256 IS json_extract(b.value,'$.source_sha256'))
        AND (t.valid_from IS json_extract(b.value,'$.valid_from')
          AND t.expires_at IS json_extract(b.value,'$.expires_at')
          AND t.status IS json_extract(b.value,'$.status')
          AND t.created_at IS json_extract(b.value,'$.created_at')
          AND t.execution_scope IS json_extract(b.value,'$.execution_scope')
          AND t.review_authority_id IS json_extract(b.value,'$.review_authority_id'))
        AND (t.evidence_observed_at IS json_extract(b.value,'$.evidence_observed_at'))
       )
   ))
 );
 SELECT RAISE(ABORT,'verified_fax_reference_set_invalid') WHERE NOT (
   NOT EXISTS(SELECT 1 FROM json_each(NEW.exclusions_json) b WHERE NOT EXISTS(
     SELECT 1 FROM trusted_fax_usage_tariffs t
      WHERE t.organization_id=NEW.organization_id AND t.id=json_extract(b.value,'$.id')
       AND t.sender_id=NEW.sender_id AND t.account_id=NEW.account_id
       AND t.connection_id=NEW.connection_id AND t.outbound_profile_id=NEW.outbound_profile_id
       AND t.options_json=NEW.options_json AND t.status='qualified'
       AND t.provider='telnyx' AND t.execution_scope='live' AND t.route_qualification='provider_verified'
       AND t.origin_class='eea' AND t.sender_country_code='LU' AND t.route_allowed=0
       AND t.destination_prefix IN ('+33182883934','+4932','+49700','+49800')
       AND (
(t.id IS json_extract(b.value,'$.id')
          AND t.organization_id IS json_extract(b.value,'$.organization_id')
          AND t.sender_id IS json_extract(b.value,'$.sender_id')
          AND t.provider IS json_extract(b.value,'$.provider')
          AND t.account_id IS json_extract(b.value,'$.account_id')
          AND t.connection_id IS json_extract(b.value,'$.connection_id'))
        AND (t.outbound_profile_id IS json_extract(b.value,'$.outbound_profile_id')
          AND t.sender_prefix IS json_extract(b.value,'$.sender_prefix')
          AND t.destination_prefix IS json_extract(b.value,'$.destination_prefix')
          AND t.sender_country_code IS json_extract(b.value,'$.sender_country_code')
          AND t.destination_country_code IS json_extract(b.value,'$.destination_country_code')
          AND t.origin_class IS json_extract(b.value,'$.origin_class'))
        AND (t.destination_category IS json_extract(b.value,'$.destination_category')
          AND t.route_allowed IS json_extract(b.value,'$.route_allowed')
          AND t.route_qualification IS json_extract(b.value,'$.route_qualification')
          AND t.operator_authorization_reference IS json_extract(b.value,'$.operator_authorization_reference')
          AND t.operator_test_ceiling_minor IS json_extract(b.value,'$.operator_test_ceiling_minor')
          AND t.local_calling_verified IS json_extract(b.value,'$.local_calling_verified'))
        AND (t.options_json IS json_extract(b.value,'$.options_json')
          AND t.currency IS json_extract(b.value,'$.currency')
          AND t.page_nano_usd IS json_extract(b.value,'$.page_nano_usd')
          AND t.minute_nano_usd IS json_extract(b.value,'$.minute_nano_usd')
          AND t.call_nano_usd IS json_extract(b.value,'$.call_nano_usd')
          AND t.initial_seconds IS json_extract(b.value,'$.initial_seconds'))
        AND (t.increment_seconds IS json_extract(b.value,'$.increment_seconds')
          AND t.duration_base_seconds IS json_extract(b.value,'$.duration_base_seconds')
          AND t.duration_low_per_page_seconds IS json_extract(b.value,'$.duration_low_per_page_seconds')
          AND t.duration_high_per_page_seconds IS json_extract(b.value,'$.duration_high_per_page_seconds')
          AND t.fx_numerator IS json_extract(b.value,'$.fx_numerator')
          AND t.fx_denominator IS json_extract(b.value,'$.fx_denominator'))
        AND (t.fx_date IS json_extract(b.value,'$.fx_date')
          AND t.fx_source IS json_extract(b.value,'$.fx_source')
          AND t.max_pages IS json_extract(b.value,'$.max_pages')
          AND t.quote_ttl_seconds IS json_extract(b.value,'$.quote_ttl_seconds')
          AND t.source_reference IS json_extract(b.value,'$.source_reference')
          AND t.source_sha256 IS json_extract(b.value,'$.source_sha256'))
        AND (t.valid_from IS json_extract(b.value,'$.valid_from')
          AND t.expires_at IS json_extract(b.value,'$.expires_at')
          AND t.status IS json_extract(b.value,'$.status')
          AND t.created_at IS json_extract(b.value,'$.created_at')
          AND t.execution_scope IS json_extract(b.value,'$.execution_scope')
          AND t.review_authority_id IS json_extract(b.value,'$.review_authority_id'))
        AND (t.evidence_observed_at IS json_extract(b.value,'$.evidence_observed_at'))
       )
   ))
 );
 INSERT INTO verified_fax_reference_state(organization_id,set_id,next_due_at) VALUES(NEW.organization_id,NEW.id,NEW.created_at);
END;

CREATE TRIGGER admitted_verified_fax_reference_tariff BEFORE INSERT ON verified_fax_reference_tariffs
BEGIN
 -- Keep view validation separate from the anchor join: D1 limits expression depth.
 SELECT RAISE(ABORT,'verified_fax_reference_tariff_invalid') WHERE NOT EXISTS(
  SELECT 1 FROM valid_verified_fax_reference_sets source WHERE source.organization_id=NEW.organization_id AND source.id=NEW.set_id
 );
 SELECT RAISE(ABORT,'verified_fax_reference_tariff_invalid') WHERE NOT EXISTS(
  SELECT 1 FROM verified_fax_reference_sets source
   JOIN json_each(source.bindings_json) anchor
   JOIN trusted_fax_usage_tariffs t ON t.organization_id=source.organization_id AND t.id=NEW.tariff_id
   WHERE source.organization_id=NEW.organization_id AND source.id=NEW.set_id AND t.status='qualified'
     AND (
(t.organization_id IS json_extract(anchor.value,'$.organization_id')
        AND t.sender_id IS json_extract(anchor.value,'$.sender_id')
        AND t.provider IS json_extract(anchor.value,'$.provider')
        AND t.account_id IS json_extract(anchor.value,'$.account_id')
        AND t.connection_id IS json_extract(anchor.value,'$.connection_id')
        AND t.outbound_profile_id IS json_extract(anchor.value,'$.outbound_profile_id'))
      AND (t.sender_prefix IS json_extract(anchor.value,'$.sender_prefix')
        AND t.destination_prefix IS json_extract(anchor.value,'$.destination_prefix')
        AND t.sender_country_code IS json_extract(anchor.value,'$.sender_country_code')
        AND t.destination_country_code IS json_extract(anchor.value,'$.destination_country_code')
        AND t.origin_class IS json_extract(anchor.value,'$.origin_class')
        AND t.destination_category IS json_extract(anchor.value,'$.destination_category'))
      AND (t.route_allowed IS json_extract(anchor.value,'$.route_allowed')
        AND t.route_qualification IS json_extract(anchor.value,'$.route_qualification')
        AND t.operator_authorization_reference IS json_extract(anchor.value,'$.operator_authorization_reference')
        AND t.operator_test_ceiling_minor IS json_extract(anchor.value,'$.operator_test_ceiling_minor')
        AND t.local_calling_verified IS json_extract(anchor.value,'$.local_calling_verified')
        AND t.options_json IS json_extract(anchor.value,'$.options_json'))
      AND (t.currency IS json_extract(anchor.value,'$.currency')
        AND t.initial_seconds IS json_extract(anchor.value,'$.initial_seconds')
        AND t.increment_seconds IS json_extract(anchor.value,'$.increment_seconds')
        AND t.duration_base_seconds IS json_extract(anchor.value,'$.duration_base_seconds')
        AND t.duration_low_per_page_seconds IS json_extract(anchor.value,'$.duration_low_per_page_seconds')
        AND t.duration_high_per_page_seconds IS json_extract(anchor.value,'$.duration_high_per_page_seconds'))
      AND (t.max_pages IS json_extract(anchor.value,'$.max_pages')
        AND t.quote_ttl_seconds IS json_extract(anchor.value,'$.quote_ttl_seconds')
        AND t.execution_scope IS json_extract(anchor.value,'$.execution_scope')
        AND t.review_authority_id IS json_extract(anchor.value,'$.review_authority_id')
        AND t.evidence_observed_at IS json_extract(anchor.value,'$.evidence_observed_at'))
     )
 );
END;
CREATE TRIGGER admitted_verified_fax_reference_evidence BEFORE INSERT ON verified_fax_reference_evidence
BEGIN
 SELECT RAISE(ABORT,'verified_fax_reference_evidence_invalid')
 WHERE (SELECT COUNT(DISTINCT value) FROM json_each(NEW.tariff_ids_json))<>14
    OR EXISTS(SELECT 1 FROM json_each(NEW.tariff_ids_json) id
      WHERE id.type<>'text' OR NOT EXISTS(SELECT 1 FROM verified_fax_reference_tariffs mapping
       WHERE mapping.organization_id=NEW.organization_id AND mapping.set_id=NEW.set_id AND mapping.tariff_id=id.value));
END;
