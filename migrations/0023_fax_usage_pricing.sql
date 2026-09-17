-- Fax v3: frozen usage estimates, a firm customer cap, and separately verified
-- final usage. Historical fax v2 and email/postal quotes are never repriced.
CREATE TABLE trusted_fax_usage_tariffs (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 sender_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider='telnyx'),
 account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 200),
 connection_id TEXT NOT NULL CHECK(length(connection_id) BETWEEN 1 AND 200),
 outbound_profile_id TEXT NOT NULL CHECK(length(outbound_profile_id) BETWEEN 1 AND 200),
 sender_prefix TEXT NOT NULL CHECK(length(sender_prefix) BETWEEN 2 AND 16 AND substr(sender_prefix,1,1)='+' AND substr(sender_prefix,2) NOT GLOB '*[^0-9]*'),
 destination_prefix TEXT NOT NULL CHECK(length(destination_prefix) BETWEEN 2 AND 16 AND substr(destination_prefix,1,1)='+' AND substr(destination_prefix,2) NOT GLOB '*[^0-9]*'),
 sender_country_code TEXT NOT NULL CHECK(sender_country_code IN ('AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE')),
 destination_country_code TEXT NOT NULL CHECK(destination_country_code IN ('AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE')),
 origin_class TEXT NOT NULL CHECK(origin_class IN ('local','eea')),
 destination_category TEXT NOT NULL CHECK(destination_category IN ('fixed','special')),
 route_allowed INTEGER NOT NULL CHECK(typeof(route_allowed)='integer' AND route_allowed IN (0,1)),
 local_calling_verified INTEGER NOT NULL CHECK(typeof(local_calling_verified)='integer' AND local_calling_verified IN (0,1)),
 options_json TEXT NOT NULL CHECK(json_valid(options_json)),
 currency TEXT NOT NULL CHECK(currency='USD'),
 page_nano_usd INTEGER NOT NULL CHECK(typeof(page_nano_usd)='integer' AND page_nano_usd BETWEEN 0 AND 1000000000),
 minute_nano_usd INTEGER NOT NULL CHECK(typeof(minute_nano_usd)='integer' AND minute_nano_usd BETWEEN 0 AND 1000000000),
 call_nano_usd INTEGER NOT NULL CHECK(typeof(call_nano_usd)='integer' AND call_nano_usd BETWEEN 0 AND 1000000000),
 initial_seconds INTEGER NOT NULL CHECK(typeof(initial_seconds)='integer' AND initial_seconds=60),
 increment_seconds INTEGER NOT NULL CHECK(typeof(increment_seconds)='integer' AND increment_seconds=60),
 duration_base_seconds INTEGER NOT NULL CHECK(typeof(duration_base_seconds)='integer' AND duration_base_seconds BETWEEN 0 AND 600),
 duration_low_per_page_seconds INTEGER NOT NULL CHECK(typeof(duration_low_per_page_seconds)='integer' AND duration_low_per_page_seconds BETWEEN 1 AND 600),
 duration_high_per_page_seconds INTEGER NOT NULL CHECK(typeof(duration_high_per_page_seconds)='integer' AND duration_high_per_page_seconds BETWEEN duration_low_per_page_seconds AND 600),
 fx_numerator INTEGER NOT NULL CHECK(typeof(fx_numerator)='integer' AND fx_numerator BETWEEN 1 AND 1000000),
 fx_denominator INTEGER NOT NULL CHECK(typeof(fx_denominator)='integer' AND fx_denominator BETWEEN 1 AND 1000000),
 fx_date TEXT NOT NULL CHECK(length(fx_date)=10 AND fx_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(fx_date,'+0 days') IS fx_date AND fx_date<=substr(valid_from,1,10)),
 fx_source TEXT NOT NULL CHECK(length(fx_source) BETWEEN 1 AND 500),
 max_pages INTEGER NOT NULL CHECK(typeof(max_pages)='integer' AND max_pages BETWEEN 1 AND 10),
 quote_ttl_seconds INTEGER NOT NULL CHECK(typeof(quote_ttl_seconds)='integer' AND quote_ttl_seconds BETWEEN 30 AND 900),
 source_reference TEXT NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 500),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'),
 valid_from TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',valid_from,'+0 seconds') IS valid_from),
 expires_at TEXT NOT NULL CHECK(expires_at>valid_from AND strftime('%Y-%m-%dT%H:%M:%fZ',expires_at,'+0 seconds') IS expires_at),
 status TEXT NOT NULL CHECK(status IN ('qualified','revoked')),
 created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds') IS created_at),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,sender_id) REFERENCES senders(organization_id,id),
 CHECK((sender_country_code='AT' AND sender_prefix LIKE '+43%') OR (sender_country_code='BE' AND sender_prefix LIKE '+32%') OR (sender_country_code='BG' AND sender_prefix LIKE '+359%') OR (sender_country_code='HR' AND sender_prefix LIKE '+385%') OR (sender_country_code='CY' AND sender_prefix LIKE '+357%') OR (sender_country_code='CZ' AND sender_prefix LIKE '+420%') OR (sender_country_code='DK' AND sender_prefix LIKE '+45%') OR (sender_country_code='EE' AND sender_prefix LIKE '+372%') OR (sender_country_code='FI' AND sender_prefix LIKE '+358%') OR (sender_country_code='FR' AND sender_prefix LIKE '+33%') OR (sender_country_code='DE' AND sender_prefix LIKE '+49%') OR (sender_country_code='GR' AND sender_prefix LIKE '+30%') OR (sender_country_code='HU' AND sender_prefix LIKE '+36%') OR (sender_country_code='IS' AND sender_prefix LIKE '+354%') OR (sender_country_code='IE' AND sender_prefix LIKE '+353%') OR (sender_country_code='IT' AND sender_prefix LIKE '+39%') OR (sender_country_code='LV' AND sender_prefix LIKE '+371%') OR (sender_country_code='LI' AND sender_prefix LIKE '+423%') OR (sender_country_code='LT' AND sender_prefix LIKE '+370%') OR (sender_country_code='LU' AND sender_prefix LIKE '+352%') OR (sender_country_code='MT' AND sender_prefix LIKE '+356%') OR (sender_country_code='NL' AND sender_prefix LIKE '+31%') OR (sender_country_code='NO' AND sender_prefix LIKE '+47%') OR (sender_country_code='PL' AND sender_prefix LIKE '+48%') OR (sender_country_code='PT' AND sender_prefix LIKE '+351%') OR (sender_country_code='RO' AND sender_prefix LIKE '+40%') OR (sender_country_code='SK' AND sender_prefix LIKE '+421%') OR (sender_country_code='SI' AND sender_prefix LIKE '+386%') OR (sender_country_code='ES' AND sender_prefix LIKE '+34%') OR (sender_country_code='SE' AND sender_prefix LIKE '+46%')),
 CHECK((destination_country_code='AT' AND destination_prefix LIKE '+43%') OR (destination_country_code='BE' AND destination_prefix LIKE '+32%') OR (destination_country_code='BG' AND destination_prefix LIKE '+359%') OR (destination_country_code='HR' AND destination_prefix LIKE '+385%') OR (destination_country_code='CY' AND destination_prefix LIKE '+357%') OR (destination_country_code='CZ' AND destination_prefix LIKE '+420%') OR (destination_country_code='DK' AND destination_prefix LIKE '+45%') OR (destination_country_code='EE' AND destination_prefix LIKE '+372%') OR (destination_country_code='FI' AND destination_prefix LIKE '+358%') OR (destination_country_code='FR' AND destination_prefix LIKE '+33%') OR (destination_country_code='DE' AND destination_prefix LIKE '+49%') OR (destination_country_code='GR' AND destination_prefix LIKE '+30%') OR (destination_country_code='HU' AND destination_prefix LIKE '+36%') OR (destination_country_code='IS' AND destination_prefix LIKE '+354%') OR (destination_country_code='IE' AND destination_prefix LIKE '+353%') OR (destination_country_code='IT' AND destination_prefix LIKE '+39%') OR (destination_country_code='LV' AND destination_prefix LIKE '+371%') OR (destination_country_code='LI' AND destination_prefix LIKE '+423%') OR (destination_country_code='LT' AND destination_prefix LIKE '+370%') OR (destination_country_code='LU' AND destination_prefix LIKE '+352%') OR (destination_country_code='MT' AND destination_prefix LIKE '+356%') OR (destination_country_code='NL' AND destination_prefix LIKE '+31%') OR (destination_country_code='NO' AND destination_prefix LIKE '+47%') OR (destination_country_code='PL' AND destination_prefix LIKE '+48%') OR (destination_country_code='PT' AND destination_prefix LIKE '+351%') OR (destination_country_code='RO' AND destination_prefix LIKE '+40%') OR (destination_country_code='SK' AND destination_prefix LIKE '+421%') OR (destination_country_code='SI' AND destination_prefix LIKE '+386%') OR (destination_country_code='ES' AND destination_prefix LIKE '+34%') OR (destination_country_code='SE' AND destination_prefix LIKE '+46%')),
 CHECK(route_allowed=0 OR destination_category='fixed'),
 CHECK((origin_class='local' AND sender_country_code=destination_country_code AND local_calling_verified=1) OR (origin_class='eea' AND sender_country_code<>destination_country_code))
);
CREATE UNIQUE INDEX qualified_fax_usage_route ON trusted_fax_usage_tariffs(organization_id,sender_id,account_id,connection_id,outbound_profile_id,destination_prefix,options_json) WHERE status='qualified';
CREATE TRIGGER immutable_fax_usage_tariff BEFORE UPDATE ON trusted_fax_usage_tariffs WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.sender_id IS NOT OLD.sender_id OR NEW.provider IS NOT OLD.provider OR NEW.account_id IS NOT OLD.account_id OR NEW.connection_id IS NOT OLD.connection_id OR NEW.outbound_profile_id IS NOT OLD.outbound_profile_id OR NEW.sender_prefix IS NOT OLD.sender_prefix OR NEW.destination_prefix IS NOT OLD.destination_prefix OR NEW.sender_country_code IS NOT OLD.sender_country_code OR NEW.destination_country_code IS NOT OLD.destination_country_code OR NEW.origin_class IS NOT OLD.origin_class OR NEW.destination_category IS NOT OLD.destination_category OR NEW.route_allowed IS NOT OLD.route_allowed OR NEW.local_calling_verified IS NOT OLD.local_calling_verified OR NEW.options_json IS NOT OLD.options_json OR NEW.currency IS NOT OLD.currency OR NEW.page_nano_usd IS NOT OLD.page_nano_usd OR NEW.minute_nano_usd IS NOT OLD.minute_nano_usd OR NEW.call_nano_usd IS NOT OLD.call_nano_usd OR NEW.initial_seconds IS NOT OLD.initial_seconds OR NEW.increment_seconds IS NOT OLD.increment_seconds OR NEW.duration_base_seconds IS NOT OLD.duration_base_seconds OR NEW.duration_low_per_page_seconds IS NOT OLD.duration_low_per_page_seconds OR NEW.duration_high_per_page_seconds IS NOT OLD.duration_high_per_page_seconds OR NEW.fx_numerator IS NOT OLD.fx_numerator OR NEW.fx_denominator IS NOT OLD.fx_denominator OR NEW.fx_date IS NOT OLD.fx_date OR NEW.fx_source IS NOT OLD.fx_source OR NEW.max_pages IS NOT OLD.max_pages OR NEW.quote_ttl_seconds IS NOT OLD.quote_ttl_seconds OR NEW.source_reference IS NOT OLD.source_reference OR NEW.source_sha256 IS NOT OLD.source_sha256 OR NEW.valid_from IS NOT OLD.valid_from OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at IS NOT OLD.created_at OR (OLD.status='revoked' AND NEW.status<>'revoked') BEGIN SELECT RAISE(ABORT,'immutable_fax_usage_tariff'); END;
CREATE INDEX fax_usage_scope ON trusted_fax_usage_tariffs(organization_id,sender_id,account_id,connection_id);
CREATE TRIGGER retained_fax_usage_tariff BEFORE DELETE ON trusted_fax_usage_tariffs WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id) BEGIN SELECT RAISE(ABORT,'immutable_fax_usage_tariff'); END;
CREATE TABLE live_fax_quotes_v3 (
 dispatch_id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 tariff_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 dispatch_fingerprint TEXT NOT NULL CHECK(length(dispatch_fingerprint)=64),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 input_fingerprint TEXT NOT NULL CHECK(length(input_fingerprint)=64),
 account_id TEXT NOT NULL,
 connection_id TEXT NOT NULL,
 outbound_profile_id TEXT NOT NULL,
 pricing_version INTEGER NOT NULL CHECK(typeof(pricing_version)='integer' AND pricing_version=3),
 price_rule TEXT NOT NULL CHECK(price_rule='usage_x2_customer_cap'),
 fiscal_basis TEXT NOT NULL CHECK(fiscal_basis='qualified_usage_ex_tax'),
 estimated_low_nanoeur INTEGER NOT NULL CHECK(typeof(estimated_low_nanoeur)='integer' AND estimated_low_nanoeur BETWEEN 0 AND 10000000000000),
 estimated_high_nanoeur INTEGER NOT NULL CHECK(typeof(estimated_high_nanoeur)='integer' AND estimated_high_nanoeur BETWEEN estimated_low_nanoeur AND 10000000000000),
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor=(estimated_high_nanoeur+9999999)/10000000),
 ceiling_minor INTEGER NOT NULL CHECK(typeof(ceiling_minor)='integer' AND ceiling_minor BETWEEN amount_minor AND 1000000),
 currency TEXT NOT NULL CHECK(currency='EUR'),
 fx_numerator INTEGER NOT NULL CHECK(typeof(fx_numerator)='integer' AND fx_numerator BETWEEN 1 AND 1000000),
 fx_denominator INTEGER NOT NULL CHECK(typeof(fx_denominator)='integer' AND fx_denominator BETWEEN 1 AND 1000000),
 fx_date TEXT NOT NULL,
 fx_source TEXT NOT NULL,
 source_reference TEXT NOT NULL,
 source_sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL CHECK(expires_at>created_at),
 FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,tariff_id) REFERENCES trusted_fax_usage_tariffs(organization_id,id)
);
CREATE TRIGGER immutable_live_fax_quote_v3 BEFORE UPDATE ON live_fax_quotes_v3 BEGIN SELECT RAISE(ABORT,'immutable_live_fax_quote'); END;
CREATE TRIGGER retained_live_fax_quote_v3 BEFORE DELETE ON live_fax_quotes_v3 WHEN EXISTS(SELECT 1 FROM dispatches WHERE organization_id=OLD.organization_id AND id=OLD.dispatch_id) BEGIN SELECT RAISE(ABORT,'immutable_live_fax_quote'); END;
CREATE VIEW valid_live_fax_quotes_v3 AS
 SELECT q.*,t.valid_from AS tariff_valid_from,t.expires_at AS tariff_expires_at
 FROM live_fax_quotes_v3 q
 JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id
 JOIN trusted_fax_usage_tariffs t ON t.organization_id=q.organization_id AND t.id=q.tariff_id
 JOIN senders s ON s.organization_id=d.organization_id AND s.id=d.sender_id
 JOIN documents doc ON doc.organization_id=d.organization_id AND doc.id=d.document_id
 WHERE d.mode='production' AND d.channel='fax' AND d.quote_fingerprint=q.fingerprint AND d.fingerprint=q.dispatch_fingerprint
 AND t.status='qualified' AND t.route_allowed=1 AND t.destination_category='fixed' AND t.sender_id=d.sender_id AND t.provider='telnyx'
 AND t.account_id=q.account_id AND t.connection_id=q.connection_id AND t.outbound_profile_id=q.outbound_profile_id AND t.options_json=d.options_json
 AND s.status='verified' AND s.mode='production' AND s.channel='fax' AND s.address=d.sender_address AND substr(s.address,1,length(t.sender_prefix))=t.sender_prefix
 AND EXISTS(SELECT 1 FROM audit_log scan WHERE scan.organization_id=doc.organization_id AND scan.action='document.scan_verified' AND scan.resource_id=doc.sha256)
 AND doc.status='ready' AND doc.pages BETWEEN 1 AND t.max_pages AND doc.sha256=json_extract(q.input_json,'$.documentSha256')
 AND substr(json_extract(d.recipient_json,'$.phone'),1,length(t.destination_prefix))=t.destination_prefix
 AND NOT EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs specific WHERE specific.organization_id=t.organization_id AND specific.sender_id=t.sender_id AND specific.account_id=t.account_id AND specific.connection_id=t.connection_id AND specific.outbound_profile_id=t.outbound_profile_id AND specific.options_json=t.options_json AND specific.status='qualified' AND length(specific.destination_prefix)>length(t.destination_prefix) AND substr(json_extract(d.recipient_json,'$.phone'),1,length(specific.destination_prefix))=specific.destination_prefix)
 AND q.estimated_low_nanoeur=2*((((t.page_nano_usd*doc.pages+t.minute_nano_usd*((t.duration_base_seconds+doc.pages*t.duration_low_per_page_seconds+59)/60)+t.call_nano_usd)*t.fx_numerator)+t.fx_denominator-1)/t.fx_denominator)
 AND q.estimated_high_nanoeur=2*((((t.page_nano_usd*doc.pages+t.minute_nano_usd*((t.duration_base_seconds+doc.pages*t.duration_high_per_page_seconds+59)/60)+t.call_nano_usd)*t.fx_numerator)+t.fx_denominator-1)/t.fx_denominator)
 AND q.amount_minor=d.estimated_minor AND q.ceiling_minor=d.ceiling_minor AND q.currency=d.currency
 AND q.fx_numerator=t.fx_numerator AND q.fx_denominator=t.fx_denominator AND q.fx_date=t.fx_date AND q.fx_source=t.fx_source AND q.source_reference=t.source_reference AND q.source_sha256=t.source_sha256
 AND q.expires_at<=t.expires_at AND q.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ',q.created_at,'+'||t.quote_ttl_seconds||' seconds')
 AND json_extract(q.input_json,'$.channel') IS d.channel AND json_extract(q.input_json,'$.recipient') IS d.recipient_json
 AND json_extract(q.input_json,'$.documentId') IS d.document_id AND json_extract(q.input_json,'$.senderId') IS d.sender_id AND json_extract(q.input_json,'$.senderAddress') IS d.sender_address
 AND json_extract(q.input_json,'$.subject') IS d.subject AND json_extract(q.input_json,'$.html') IS d.html AND json_extract(q.input_json,'$.text') IS d.text
 AND json_extract(q.input_json,'$.options') IS d.options_json AND json_extract(q.input_json,'$.campaignId') IS d.campaign_id
 AND json_extract(q.input_json,'$.estimatedMinor') IS d.estimated_minor AND json_extract(q.input_json,'$.ceilingMinor') IS d.ceiling_minor AND json_extract(q.input_json,'$.currency') IS d.currency AND json_extract(q.input_json,'$.mode') IS d.mode;
CREATE TRIGGER preparation_live_fax_quote_v3 AFTER INSERT ON live_fax_quotes_v3 BEGIN
 SELECT RAISE(ABORT,'live_quote_invalid') WHERE EXISTS(SELECT 1 FROM live_fax_quotes_v2 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) OR EXISTS(SELECT 1 FROM live_fax_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id);
 SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM valid_live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND created_at<=NEW.created_at AND expires_at>NEW.created_at AND tariff_valid_from<=NEW.created_at AND tariff_expires_at>NEW.created_at);
END;
CREATE TRIGGER fax_quote_version_exclusive BEFORE INSERT ON live_fax_quotes_v2 WHEN EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) BEGIN SELECT RAISE(ABORT,'live_quote_invalid'); END;
DROP TRIGGER approval_live_fax_quote_insert;
CREATE TRIGGER approval_live_fax_quote_insert BEFORE INSERT ON approvals WHEN EXISTS(SELECT 1 FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id AND mode='production' AND channel='fax') BEGIN SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM (SELECT organization_id,dispatch_id,dispatch_fingerprint,created_at,expires_at,tariff_valid_from,tariff_expires_at FROM valid_live_fax_quotes UNION ALL SELECT organization_id,dispatch_id,dispatch_fingerprint,created_at,expires_at,tariff_valid_from,tariff_expires_at FROM valid_live_fax_quotes_v3) WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND dispatch_fingerprint=NEW.fingerprint AND created_at<=NEW.created_at AND expires_at>NEW.created_at AND tariff_valid_from<=NEW.created_at AND tariff_expires_at>NEW.created_at); END;
DROP TRIGGER approval_live_fax_quote_update;
CREATE TRIGGER approval_live_fax_quote_update BEFORE UPDATE ON approvals WHEN EXISTS(SELECT 1 FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id AND mode='production' AND channel='fax') BEGIN SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM (SELECT organization_id,dispatch_id,dispatch_fingerprint,created_at,expires_at,tariff_valid_from,tariff_expires_at FROM valid_live_fax_quotes UNION ALL SELECT organization_id,dispatch_id,dispatch_fingerprint,created_at,expires_at,tariff_valid_from,tariff_expires_at FROM valid_live_fax_quotes_v3) WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND dispatch_fingerprint=NEW.fingerprint AND created_at<=NEW.created_at AND expires_at>NEW.created_at AND tariff_valid_from<=NEW.created_at AND tariff_expires_at>NEW.created_at); END;
DROP TRIGGER acceptance_live_fax_quote;
CREATE TRIGGER acceptance_live_fax_quote BEFORE UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' AND NEW.mode='production' AND NEW.channel='fax' BEGIN SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM (SELECT organization_id,dispatch_id,dispatch_fingerprint,created_at,expires_at,tariff_valid_from,tariff_expires_at FROM valid_live_fax_quotes UNION ALL SELECT organization_id,dispatch_id,dispatch_fingerprint,created_at,expires_at,tariff_valid_from,tariff_expires_at FROM valid_live_fax_quotes_v3) WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND created_at<=NEW.updated_at AND expires_at>NEW.updated_at AND tariff_valid_from<=NEW.updated_at AND tariff_expires_at>NEW.updated_at); END;
DROP TRIGGER preflight_live_fax_quote;
CREATE TRIGGER preflight_live_fax_quote BEFORE UPDATE OF status ON dispatches WHEN OLD.status='queued' AND NEW.status='submitting' AND NEW.mode='production' AND NEW.channel='fax' BEGIN SELECT RAISE(ABORT,'live_quote_invalid') WHERE NEW.provider IS NOT 'telnyx' OR NOT EXISTS(SELECT 1 FROM (SELECT organization_id,dispatch_id,dispatch_fingerprint,created_at,expires_at,tariff_valid_from,tariff_expires_at FROM valid_live_fax_quotes UNION ALL SELECT organization_id,dispatch_id,dispatch_fingerprint,created_at,expires_at,tariff_valid_from,tariff_expires_at FROM valid_live_fax_quotes_v3) WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND created_at<=NEW.updated_at AND expires_at>NEW.updated_at AND tariff_valid_from<=NEW.updated_at AND tariff_expires_at>NEW.updated_at); END;

-- Only a private, explicitly reconciled final usage proof may settle v3.
-- These references survive deletion of historical dispatches; they are not
-- cascading foreign keys to mutable transport records.
CREATE TABLE fax_usage_settlements (
 organization_id TEXT NOT NULL REFERENCES welcome_credit_grants(organization_id) ON DELETE CASCADE,
 dispatch_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider='telnyx'),
 provider_id TEXT NOT NULL CHECK(length(provider_id) BETWEEN 1 AND 200),
 account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 200),
 connection_id TEXT NOT NULL CHECK(length(connection_id) BETWEEN 1 AND 200),
 quote_fingerprint TEXT NOT NULL CHECK(length(quote_fingerprint)=64),
 proof_source TEXT NOT NULL CHECK(proof_source='operator_reconciled_usage'),
 reviewer_id TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 500),
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64 AND evidence_sha256 NOT GLOB '*[^0-9a-f]*'),
 proof_fingerprint TEXT NOT NULL CHECK(length(proof_fingerprint)=64 AND proof_fingerprint NOT GLOB '*[^0-9a-f]*'),
 supplier_nano_usd INTEGER NOT NULL CHECK(typeof(supplier_nano_usd)='integer' AND supplier_nano_usd BETWEEN 0 AND 1000000000000),
 supplier_nanoeur INTEGER NOT NULL CHECK(typeof(supplier_nanoeur)='integer' AND supplier_nanoeur BETWEEN 0 AND 9000000000000000),
 customer_nanoeur INTEGER NOT NULL CHECK(typeof(customer_nanoeur)='integer' AND customer_nanoeur BETWEEN 0 AND 50000000000),
 guteneo_absorbed_nanoeur INTEGER NOT NULL CHECK(typeof(guteneo_absorbed_nanoeur)='integer' AND guteneo_absorbed_nanoeur BETWEEN 0 AND 9000000000000000),
 created_at TEXT NOT NULL CHECK(created_at>=observed_at),
 PRIMARY KEY(organization_id,dispatch_id),
 UNIQUE(organization_id,provider,account_id,provider_id)
);
CREATE TRIGGER immutable_fax_usage_settlement BEFORE UPDATE ON fax_usage_settlements BEGIN SELECT RAISE(ABORT,'immutable_fax_usage_settlement'); END;
CREATE TRIGGER retained_fax_usage_settlement BEFORE DELETE ON fax_usage_settlements WHEN EXISTS(SELECT 1 FROM welcome_credit_grants WHERE organization_id=OLD.organization_id) BEGIN SELECT RAISE(ABORT,'immutable_fax_usage_settlement'); END;
CREATE TRIGGER valid_fax_usage_settlement BEFORE INSERT ON fax_usage_settlements BEGIN
 SELECT RAISE(ABORT,'fax_usage_settlement_invalid') WHERE NOT EXISTS(
  SELECT 1 FROM live_fax_quotes_v3 q
  JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id
  JOIN attempts a ON a.organization_id=d.organization_id AND a.dispatch_id=d.id AND a.id=d.active_attempt_id
  JOIN welcome_credit_reservations r ON r.organization_id=d.organization_id AND r.dispatch_id=d.id
  JOIN reservations monthly ON monthly.organization_id=d.organization_id AND monthly.dispatch_id=d.id
  JOIN memberships m ON m.organization_id=d.organization_id AND m.user_id=NEW.reviewer_id AND m.role='admin'
  WHERE q.organization_id=NEW.organization_id AND q.dispatch_id=NEW.dispatch_id
  AND d.mode='production' AND d.channel='fax' AND d.status IN ('delivered','failed')
  AND d.provider=NEW.provider AND d.provider_id=NEW.provider_id AND d.active_attempt_id=NEW.attempt_id
  AND a.provider=NEW.provider AND a.provider_id=NEW.provider_id AND a.status IN ('started','accepted','unknown') AND a.bridge_claimed_at IS NOT NULL AND a.bridge_claimed_at<=NEW.observed_at
  AND q.account_id=NEW.account_id AND q.connection_id=NEW.connection_id AND q.fingerprint=NEW.quote_fingerprint AND d.quote_fingerprint=q.fingerprint
  AND r.status='reserved' AND r.amount_minor=q.ceiling_minor AND monthly.status='reserved' AND monthly.channel='fax' AND monthly.amount_minor=q.ceiling_minor
  AND NEW.observed_at>=a.created_at
  AND NEW.supplier_nanoeur=(NEW.supplier_nano_usd*q.fx_numerator+q.fx_denominator-1)/q.fx_denominator
  AND NEW.customer_nanoeur=MIN(2*NEW.supplier_nanoeur,q.ceiling_minor*10000000)
  AND NEW.guteneo_absorbed_nanoeur=MAX(0,NEW.supplier_nanoeur-NEW.customer_nanoeur)
 );
END;
CREATE TRIGGER fax_usage_settle AFTER INSERT ON fax_usage_settlements BEGIN
 UPDATE welcome_credit_reservations SET status='settled',updated_at=NEW.created_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved';
END;
DROP TRIGGER welcome_credit_confirm;
CREATE TRIGGER welcome_credit_confirm AFTER UPDATE OF status ON dispatches WHEN NEW.mode='production' AND NEW.status IN ('accepted','delivered','printed','handed_to_post','bounced','complained') AND NOT EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id) BEGIN
 SELECT RAISE(ABORT,'credit_reservation_closed') WHERE EXISTS(SELECT 1 FROM welcome_credit_reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND status='released');
 UPDATE welcome_credit_reservations SET status='settled',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND status='reserved';
END;
DROP TRIGGER welcome_credit_attempt_accepted;
CREATE TRIGGER welcome_credit_attempt_accepted AFTER UPDATE OF status ON attempts WHEN NEW.status='accepted' AND NEW.provider_id IS NOT NULL AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND d.active_attempt_id=NEW.id AND d.mode='production' AND d.status='failed' AND d.provider=NEW.provider AND d.provider_id=NEW.provider_id) AND NOT EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) BEGIN
 SELECT RAISE(ABORT,'credit_reservation_closed') WHERE EXISTS(SELECT 1 FROM welcome_credit_reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='released');
 UPDATE welcome_credit_reservations SET status='settled',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved';
END;
DROP TRIGGER welcome_credit_event_accepted;
CREATE TRIGGER welcome_credit_event_accepted AFTER UPDATE OF applied_at ON provider_events WHEN OLD.applied_at IS NULL AND NEW.applied_at IS NOT NULL AND NEW.kind='accepted' AND NEW.provider_id IS NOT NULL AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND d.mode='production' AND d.status='failed' AND d.provider=NEW.provider AND d.provider_id=NEW.provider_id) AND NOT EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) BEGIN
 SELECT RAISE(ABORT,'credit_reservation_closed') WHERE EXISTS(SELECT 1 FROM welcome_credit_reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='released');
 UPDATE welcome_credit_reservations SET status='settled',updated_at=NEW.applied_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved';
END;
DROP TRIGGER welcome_credit_settlement_guard;
CREATE TRIGGER welcome_credit_settlement_guard BEFORE UPDATE ON welcome_credit_reservations BEGIN
 SELECT RAISE(ABORT,'credit_settlement_invalid') WHERE NEW.status='settled' AND ((EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) AND NOT EXISTS(SELECT 1 FROM fax_usage_settlements WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id)) OR (NOT EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) AND NOT EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND (d.status IN ('accepted','delivered','printed','handed_to_post','bounced','complained') OR (d.status='failed' AND (EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id AND a.id=d.active_attempt_id AND a.status='accepted' AND a.provider=d.provider AND a.provider_id=d.provider_id) OR EXISTS(SELECT 1 FROM provider_events e WHERE e.organization_id=d.organization_id AND e.dispatch_id=d.id AND e.provider=d.provider AND e.provider_id=d.provider_id AND e.kind='accepted' AND e.applied_at IS NOT NULL)))))));
 SELECT RAISE(ABORT,'credit_settlement_invalid') WHERE NEW.status='released' AND NOT EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND d.status IN ('cancelled','failed') AND d.provider_id IS NULL AND ((d.active_attempt_id IS NULL AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id)) OR (d.status='failed' AND EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id AND a.id=d.active_attempt_id AND a.status='rejected'))));
END;
DROP TRIGGER valid_delivery_charge;
CREATE TRIGGER valid_delivery_charge BEFORE INSERT ON delivery_charge_entries BEGIN SELECT RAISE(ABORT,'delivery_charge_invalid') WHERE NEW.charged_minor<>((COALESCE((SELECT SUM(amount_nanoeur) FROM delivery_charge_entries WHERE organization_id=NEW.organization_id),0)+NEW.amount_nanoeur+9999999)/10000000-(COALESCE((SELECT SUM(amount_nanoeur) FROM delivery_charge_entries WHERE organization_id=NEW.organization_id),0)+9999999)/10000000) OR (NOT EXISTS(SELECT 1 FROM live_delivery_quotes q JOIN welcome_credit_reservations r ON r.organization_id=q.organization_id AND r.dispatch_id=q.dispatch_id WHERE q.organization_id=NEW.organization_id AND q.dispatch_id=NEW.dispatch_id AND r.status='settled' AND q.customer_nanoeur=NEW.amount_nanoeur AND NEW.charged_minor<=r.charge_minor) AND NOT EXISTS(SELECT 1 FROM fax_usage_settlements f JOIN welcome_credit_reservations r ON r.organization_id=f.organization_id AND r.dispatch_id=f.dispatch_id WHERE f.organization_id=NEW.organization_id AND f.dispatch_id=NEW.dispatch_id AND r.status='settled' AND f.customer_nanoeur=NEW.amount_nanoeur AND NEW.charged_minor<=r.amount_minor)); END;
DROP TRIGGER welcome_credit_settlement_entry;
CREATE TRIGGER welcome_credit_settlement_entry AFTER UPDATE ON welcome_credit_reservations WHEN NEW.status='settled' BEGIN
 INSERT INTO delivery_charge_entries(organization_id,dispatch_id,amount_nanoeur,charged_minor,created_at) SELECT NEW.organization_id,NEW.dispatch_id,q.customer_nanoeur,(COALESCE((SELECT SUM(amount_nanoeur) FROM delivery_charge_entries WHERE organization_id=NEW.organization_id),0)+q.customer_nanoeur+9999999)/10000000-(COALESCE((SELECT SUM(amount_nanoeur) FROM delivery_charge_entries WHERE organization_id=NEW.organization_id),0)+9999999)/10000000,NEW.updated_at FROM live_delivery_quotes q WHERE q.organization_id=NEW.organization_id AND q.dispatch_id=NEW.dispatch_id;
 INSERT INTO delivery_charge_entries(organization_id,dispatch_id,amount_nanoeur,charged_minor,created_at) SELECT NEW.organization_id,NEW.dispatch_id,f.customer_nanoeur,(COALESCE((SELECT SUM(amount_nanoeur) FROM delivery_charge_entries WHERE organization_id=NEW.organization_id),0)+f.customer_nanoeur+9999999)/10000000-(COALESCE((SELECT SUM(amount_nanoeur) FROM delivery_charge_entries WHERE organization_id=NEW.organization_id),0)+9999999)/10000000,NEW.updated_at FROM fax_usage_settlements f WHERE f.organization_id=NEW.organization_id AND f.dispatch_id=NEW.dispatch_id;
 INSERT INTO welcome_credit_entries(organization_id,dispatch_id,kind,reserved_delta,spent_delta,created_at) VALUES(NEW.organization_id,NEW.dispatch_id,'settled',-NEW.amount_minor,COALESCE((SELECT charged_minor FROM delivery_charge_entries WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id),NEW.charge_minor),NEW.updated_at);
 UPDATE usage SET reserved_count=reserved_count-1,confirmed_count=confirmed_count+1,reserved_minor=reserved_minor-(SELECT amount_minor FROM reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id),confirmed_minor=confirmed_minor+(SELECT charged_minor FROM delivery_charge_entries WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) WHERE organization_id=NEW.organization_id AND (channel,period) IN (SELECT channel,period FROM reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved') AND EXISTS(SELECT 1 FROM delivery_charge_entries WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id);
 UPDATE reservations SET status='confirmed' WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved' AND EXISTS(SELECT 1 FROM delivery_charge_entries WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id);
END;
DROP TRIGGER confirm_reservation;
CREATE TRIGGER confirm_reservation AFTER UPDATE OF status ON dispatches WHEN NEW.status IN ('accepted','delivered','printed','handed_to_post','bounced','complained') AND EXISTS(SELECT 1 FROM reservations WHERE dispatch_id=NEW.id AND status='reserved') AND NOT EXISTS(SELECT 1 FROM live_delivery_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id) BEGIN
 UPDATE usage SET reserved_count=reserved_count-1,reserved_minor=reserved_minor-(SELECT amount_minor FROM reservations WHERE dispatch_id=NEW.id),confirmed_count=confirmed_count+1,confirmed_minor=confirmed_minor+(SELECT amount_minor FROM reservations WHERE dispatch_id=NEW.id) WHERE organization_id=NEW.organization_id AND channel=NEW.channel AND period=(SELECT period FROM reservations WHERE dispatch_id=NEW.id);
 UPDATE reservations SET status='confirmed',updated_at=NEW.updated_at WHERE dispatch_id=NEW.id AND status='reserved';
END;
DROP TRIGGER release_reservation;
CREATE TRIGGER release_reservation AFTER UPDATE OF status ON dispatches WHEN NEW.status IN ('cancelled','failed') AND EXISTS(SELECT 1 FROM reservations WHERE dispatch_id=NEW.id AND status='reserved') AND NOT EXISTS(SELECT 1 FROM live_delivery_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id) BEGIN
 UPDATE usage SET reserved_count=reserved_count-1,reserved_minor=reserved_minor-(SELECT amount_minor FROM reservations WHERE dispatch_id=NEW.id),confirmed_count=confirmed_count,confirmed_minor=confirmed_minor WHERE organization_id=NEW.organization_id AND channel=NEW.channel AND period=(SELECT period FROM reservations WHERE dispatch_id=NEW.id);
 UPDATE reservations SET status='released',updated_at=NEW.updated_at WHERE dispatch_id=NEW.id AND status='reserved';
END;
DROP TRIGGER delivery_quota_release;
CREATE TRIGGER delivery_quota_release AFTER UPDATE ON welcome_credit_reservations WHEN NEW.status='released' AND (EXISTS(SELECT 1 FROM live_delivery_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) OR EXISTS(SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id)) BEGIN
 UPDATE usage SET reserved_count=reserved_count-1,reserved_minor=reserved_minor-(SELECT amount_minor FROM reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id) WHERE organization_id=NEW.organization_id AND (channel,period) IN (SELECT channel,period FROM reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved');
 UPDATE reservations SET status='released' WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved';
END;
