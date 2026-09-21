-- Non-sending marketplace review. No authority, tariff or channel is activated here.
-- Existing tariff/quote columns and historical hashes are preserved unchanged.
CREATE TABLE fax_review_preparation_authorities (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 sender_id TEXT NOT NULL,
 account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 200),
 connection_id TEXT NOT NULL CHECK(length(connection_id) BETWEEN 1 AND 200),
 outbound_profile_id TEXT NOT NULL CHECK(length(outbound_profile_id) BETWEEN 1 AND 200),
 recipient_phone TEXT NOT NULL CHECK(length(recipient_phone) BETWEEN 8 AND 16 AND substr(recipient_phone,1,4)='+352' AND substr(recipient_phone,2) NOT GLOB '*[^0-9]*'),
 valid_from TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',valid_from,'+0 seconds') IS valid_from),
 expires_at TEXT NOT NULL CHECK(expires_at>valid_from AND strftime('%Y-%m-%dT%H:%M:%fZ',expires_at,'+0 seconds') IS expires_at AND expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ',valid_from,'+30 days')),
 status TEXT NOT NULL CHECK(status IN ('active','revoked')),
 authorization_reference TEXT NOT NULL CHECK(length(authorization_reference) BETWEEN 1 AND 500),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'),
 created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds') IS created_at),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,sender_id) REFERENCES senders(organization_id,id)
);
CREATE TRIGGER immutable_fax_review_authority BEFORE UPDATE ON fax_review_preparation_authorities
BEGIN
 SELECT RAISE(ABORT,'immutable_fax_review_authority') WHERE NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.sender_id IS NOT OLD.sender_id OR NEW.account_id IS NOT OLD.account_id OR NEW.connection_id IS NOT OLD.connection_id OR NEW.outbound_profile_id IS NOT OLD.outbound_profile_id OR NEW.recipient_phone IS NOT OLD.recipient_phone OR NEW.valid_from IS NOT OLD.valid_from OR NEW.expires_at IS NOT OLD.expires_at OR NEW.authorization_reference IS NOT OLD.authorization_reference OR NEW.source_sha256 IS NOT OLD.source_sha256 OR NEW.created_at IS NOT OLD.created_at OR (OLD.status='revoked' AND NEW.status<>'revoked');
END;
CREATE TRIGGER retained_fax_review_authority BEFORE DELETE ON fax_review_preparation_authorities
BEGIN
 SELECT RAISE(ABORT,'immutable_fax_review_authority');
END;
PRAGMA defer_foreign_keys=ON;
CREATE TABLE fax_review_tariff_backup AS SELECT * FROM trusted_fax_usage_tariffs;
DROP TABLE trusted_fax_usage_tariffs;
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
 destination_category TEXT NOT NULL CHECK(destination_category IN ('fixed','special','mobile','ngn','freephone')),
 route_allowed INTEGER NOT NULL CHECK(typeof(route_allowed)='integer' AND route_allowed IN (0,1)),
 route_qualification TEXT NOT NULL DEFAULT 'provider_verified' CHECK(route_qualification IN ('provider_verified','operator_test')),
 operator_authorization_reference TEXT,
 operator_test_ceiling_minor INTEGER,
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
 execution_scope TEXT NOT NULL DEFAULT 'live' CHECK(execution_scope IN ('live','review_prepare_only')),
 review_authority_id TEXT,
 evidence_observed_at TEXT,
 FOREIGN KEY(organization_id,review_authority_id) REFERENCES fax_review_preparation_authorities(organization_id,id),
 CHECK((execution_scope='live' AND review_authority_id IS NULL AND evidence_observed_at IS NULL) OR (execution_scope='review_prepare_only' AND review_authority_id IS NOT NULL AND evidence_observed_at IS NOT NULL AND route_qualification='operator_test' AND route_allowed=1 AND max_pages<=7 AND operator_test_ceiling_minor<=200 AND strftime('%Y-%m-%dT%H:%M:%fZ',evidence_observed_at,'+0 seconds') IS evidence_observed_at AND evidence_observed_at<=valid_from AND expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ',evidence_observed_at,'+168 hours') AND fx_date>=date(evidence_observed_at,'-7 days') AND fx_date<=substr(evidence_observed_at,1,10))),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,sender_id) REFERENCES senders(organization_id,id),
 CHECK((sender_country_code='AT' AND sender_prefix LIKE '+43%') OR (sender_country_code='BE' AND sender_prefix LIKE '+32%') OR (sender_country_code='BG' AND sender_prefix LIKE '+359%') OR (sender_country_code='HR' AND sender_prefix LIKE '+385%') OR (sender_country_code='CY' AND sender_prefix LIKE '+357%') OR (sender_country_code='CZ' AND sender_prefix LIKE '+420%') OR (sender_country_code='DK' AND sender_prefix LIKE '+45%') OR (sender_country_code='EE' AND sender_prefix LIKE '+372%') OR (sender_country_code='FI' AND sender_prefix LIKE '+358%') OR (sender_country_code='FR' AND sender_prefix LIKE '+33%') OR (sender_country_code='DE' AND sender_prefix LIKE '+49%') OR (sender_country_code='GR' AND sender_prefix LIKE '+30%') OR (sender_country_code='HU' AND sender_prefix LIKE '+36%') OR (sender_country_code='IS' AND sender_prefix LIKE '+354%') OR (sender_country_code='IE' AND sender_prefix LIKE '+353%') OR (sender_country_code='IT' AND sender_prefix LIKE '+39%') OR (sender_country_code='LV' AND sender_prefix LIKE '+371%') OR (sender_country_code='LI' AND sender_prefix LIKE '+423%') OR (sender_country_code='LT' AND sender_prefix LIKE '+370%') OR (sender_country_code='LU' AND sender_prefix LIKE '+352%') OR (sender_country_code='MT' AND sender_prefix LIKE '+356%') OR (sender_country_code='NL' AND sender_prefix LIKE '+31%') OR (sender_country_code='NO' AND sender_prefix LIKE '+47%') OR (sender_country_code='PL' AND sender_prefix LIKE '+48%') OR (sender_country_code='PT' AND sender_prefix LIKE '+351%') OR (sender_country_code='RO' AND sender_prefix LIKE '+40%') OR (sender_country_code='SK' AND sender_prefix LIKE '+421%') OR (sender_country_code='SI' AND sender_prefix LIKE '+386%') OR (sender_country_code='ES' AND sender_prefix LIKE '+34%') OR (sender_country_code='SE' AND sender_prefix LIKE '+46%')),
 CHECK((destination_country_code='AT' AND destination_prefix LIKE '+43%') OR (destination_country_code='BE' AND destination_prefix LIKE '+32%') OR (destination_country_code='BG' AND destination_prefix LIKE '+359%') OR (destination_country_code='HR' AND destination_prefix LIKE '+385%') OR (destination_country_code='CY' AND destination_prefix LIKE '+357%') OR (destination_country_code='CZ' AND destination_prefix LIKE '+420%') OR (destination_country_code='DK' AND destination_prefix LIKE '+45%') OR (destination_country_code='EE' AND destination_prefix LIKE '+372%') OR (destination_country_code='FI' AND destination_prefix LIKE '+358%') OR (destination_country_code='FR' AND destination_prefix LIKE '+33%') OR (destination_country_code='DE' AND destination_prefix LIKE '+49%') OR (destination_country_code='GR' AND destination_prefix LIKE '+30%') OR (destination_country_code='HU' AND destination_prefix LIKE '+36%') OR (destination_country_code='IS' AND destination_prefix LIKE '+354%') OR (destination_country_code='IE' AND destination_prefix LIKE '+353%') OR (destination_country_code='IT' AND destination_prefix LIKE '+39%') OR (destination_country_code='LV' AND destination_prefix LIKE '+371%') OR (destination_country_code='LI' AND destination_prefix LIKE '+423%') OR (destination_country_code='LT' AND destination_prefix LIKE '+370%') OR (destination_country_code='LU' AND destination_prefix LIKE '+352%') OR (destination_country_code='MT' AND destination_prefix LIKE '+356%') OR (destination_country_code='NL' AND destination_prefix LIKE '+31%') OR (destination_country_code='NO' AND destination_prefix LIKE '+47%') OR (destination_country_code='PL' AND destination_prefix LIKE '+48%') OR (destination_country_code='PT' AND destination_prefix LIKE '+351%') OR (destination_country_code='RO' AND destination_prefix LIKE '+40%') OR (destination_country_code='SK' AND destination_prefix LIKE '+421%') OR (destination_country_code='SI' AND destination_prefix LIKE '+386%') OR (destination_country_code='ES' AND destination_prefix LIKE '+34%') OR (destination_country_code='SE' AND destination_prefix LIKE '+46%')),
 CHECK(route_allowed=0 OR destination_category='fixed' OR (route_qualification='operator_test' AND destination_category IN ('mobile','ngn','freephone'))),
 CHECK(
  (route_qualification='provider_verified' AND operator_authorization_reference IS NULL AND operator_test_ceiling_minor IS NULL AND
   ((origin_class='local' AND sender_country_code=destination_country_code AND local_calling_verified=1) OR (origin_class='eea' AND sender_country_code<>destination_country_code)))
  OR
  (route_qualification='operator_test' AND origin_class='local' AND sender_country_code='LU' AND destination_country_code='LU'
   AND ((destination_category='fixed' AND destination_prefix IN ('+35222','+35223','+35224','+35225','+35226','+35227','+35228','+35229','+3523','+3524','+3525','+3527','+352802','+352803','+352804','+352805','+352806','+352807','+352808','+352809','+35281','+35283','+35284','+35285','+35286','+35287','+35288','+35289','+352908','+352909','+35292','+35293','+35294','+35295','+35297','+35299')) OR (destination_category='ngn' AND destination_prefix IN ('+35220','+352291','+352801','+35260')) OR (destination_category='mobile' AND destination_prefix IN ('+3526')) OR (destination_category='freephone' AND destination_prefix IN ('+352800'))) AND route_allowed=1 AND local_calling_verified=0
   AND operator_authorization_reference IS NOT NULL AND length(operator_authorization_reference) BETWEEN 1 AND 500
   AND operator_test_ceiling_minor IS NOT NULL AND typeof(operator_test_ceiling_minor)='integer' AND operator_test_ceiling_minor BETWEEN 1 AND 200
   AND (execution_scope='review_prepare_only' OR expires_at<='2026-09-24T09:00:01.620Z')
   AND expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ',valid_from,'+7 days'))
 )
);
CREATE UNIQUE INDEX qualified_fax_usage_route ON trusted_fax_usage_tariffs(organization_id,sender_id,account_id,connection_id,outbound_profile_id,destination_prefix,options_json) WHERE status='qualified';
CREATE TRIGGER immutable_fax_usage_tariff BEFORE UPDATE ON trusted_fax_usage_tariffs WHEN NEW.execution_scope IS NOT OLD.execution_scope OR NEW.review_authority_id IS NOT OLD.review_authority_id OR NEW.evidence_observed_at IS NOT OLD.evidence_observed_at OR NEW.route_qualification IS NOT OLD.route_qualification OR NEW.operator_authorization_reference IS NOT OLD.operator_authorization_reference OR NEW.operator_test_ceiling_minor IS NOT OLD.operator_test_ceiling_minor OR NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.sender_id IS NOT OLD.sender_id OR NEW.provider IS NOT OLD.provider OR NEW.account_id IS NOT OLD.account_id OR NEW.connection_id IS NOT OLD.connection_id OR NEW.outbound_profile_id IS NOT OLD.outbound_profile_id OR NEW.sender_prefix IS NOT OLD.sender_prefix OR NEW.destination_prefix IS NOT OLD.destination_prefix OR NEW.sender_country_code IS NOT OLD.sender_country_code OR NEW.destination_country_code IS NOT OLD.destination_country_code OR NEW.origin_class IS NOT OLD.origin_class OR NEW.destination_category IS NOT OLD.destination_category OR NEW.route_allowed IS NOT OLD.route_allowed OR NEW.local_calling_verified IS NOT OLD.local_calling_verified OR NEW.options_json IS NOT OLD.options_json OR NEW.currency IS NOT OLD.currency OR NEW.page_nano_usd IS NOT OLD.page_nano_usd OR NEW.minute_nano_usd IS NOT OLD.minute_nano_usd OR NEW.call_nano_usd IS NOT OLD.call_nano_usd OR NEW.initial_seconds IS NOT OLD.initial_seconds OR NEW.increment_seconds IS NOT OLD.increment_seconds OR NEW.duration_base_seconds IS NOT OLD.duration_base_seconds OR NEW.duration_low_per_page_seconds IS NOT OLD.duration_low_per_page_seconds OR NEW.duration_high_per_page_seconds IS NOT OLD.duration_high_per_page_seconds OR NEW.fx_numerator IS NOT OLD.fx_numerator OR NEW.fx_denominator IS NOT OLD.fx_denominator OR NEW.fx_date IS NOT OLD.fx_date OR NEW.fx_source IS NOT OLD.fx_source OR NEW.max_pages IS NOT OLD.max_pages OR NEW.quote_ttl_seconds IS NOT OLD.quote_ttl_seconds OR NEW.source_reference IS NOT OLD.source_reference OR NEW.source_sha256 IS NOT OLD.source_sha256 OR NEW.valid_from IS NOT OLD.valid_from OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at IS NOT OLD.created_at OR (OLD.status='revoked' AND NEW.status<>'revoked') BEGIN SELECT RAISE(ABORT,'immutable_fax_usage_tariff'); END;
CREATE INDEX fax_usage_scope ON trusted_fax_usage_tariffs(organization_id,sender_id,account_id,connection_id);
CREATE TRIGGER retained_fax_usage_tariff BEFORE DELETE ON trusted_fax_usage_tariffs WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id) BEGIN SELECT RAISE(ABORT,'immutable_fax_usage_tariff'); END;
INSERT INTO trusted_fax_usage_tariffs SELECT *, 'live', NULL, NULL FROM fax_review_tariff_backup;
DROP TABLE fax_review_tariff_backup;
CREATE VIEW valid_review_fax_usage_tariffs AS
 SELECT t.*,a.recipient_phone AS review_recipient_phone,a.valid_from AS authority_valid_from,a.expires_at AS authority_expires_at
 FROM trusted_fax_usage_tariffs t JOIN fax_review_preparation_authorities a ON a.organization_id=t.organization_id AND a.id=t.review_authority_id
 WHERE t.execution_scope='review_prepare_only' AND a.status='active' AND a.sender_id=t.sender_id AND a.account_id=t.account_id AND a.connection_id=t.connection_id AND a.outbound_profile_id=t.outbound_profile_id
 AND t.valid_from>=a.valid_from AND t.expires_at<=a.expires_at AND t.max_pages<=7 AND t.operator_test_ceiling_minor<=200
 AND EXISTS(SELECT 1 FROM channel_controls c WHERE c.organization_id=t.organization_id AND c.channel='fax' AND c.enabled=0)
 AND NOT EXISTS(SELECT 1 FROM expert_approval_policies p WHERE p.organization_id=t.organization_id AND p.enabled=1);
CREATE TRIGGER review_fax_tariff_insert BEFORE INSERT ON trusted_fax_usage_tariffs WHEN NEW.execution_scope='review_prepare_only'
BEGIN
 SELECT RAISE(ABORT,'fax_review_authority_invalid') WHERE NOT EXISTS(SELECT 1 FROM fax_review_preparation_authorities a WHERE a.organization_id=NEW.organization_id AND a.id=NEW.review_authority_id AND a.status='active' AND a.sender_id=NEW.sender_id AND a.account_id=NEW.account_id AND a.connection_id=NEW.connection_id AND a.outbound_profile_id=NEW.outbound_profile_id AND NEW.valid_from>=a.valid_from AND NEW.expires_at<=a.expires_at AND substr(a.recipient_phone,1,length(NEW.destination_prefix))=NEW.destination_prefix);
END;
DROP VIEW valid_live_fax_quotes_v3;
CREATE VIEW valid_live_fax_quotes_v3 AS
 SELECT q.*,t.valid_from AS tariff_valid_from,t.expires_at AS tariff_expires_at
 FROM live_fax_quotes_v3 q
 JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id
 JOIN trusted_fax_usage_tariffs t ON t.organization_id=q.organization_id AND t.id=q.tariff_id
 JOIN senders s ON s.organization_id=d.organization_id AND s.id=d.sender_id
 JOIN documents doc ON doc.organization_id=d.organization_id AND doc.id=d.document_id
 WHERE (t.execution_scope='live' OR EXISTS(SELECT 1 FROM valid_review_fax_usage_tariffs rt WHERE rt.organization_id=t.organization_id AND rt.id=t.id AND rt.review_recipient_phone=json_extract(d.recipient_json,'$.phone') AND q.created_at>=rt.authority_valid_from AND q.expires_at<=rt.authority_expires_at AND q.ceiling_minor<=200)) AND d.mode='production' AND d.channel='fax' AND d.quote_fingerprint=q.fingerprint AND d.fingerprint=q.dispatch_fingerprint
 AND (t.route_qualification<>'operator_test' OR (
  q.ceiling_minor<=t.operator_test_ceiling_minor
  AND EXISTS(SELECT 1 FROM luxembourg_operator_fax_routes route WHERE route.prefix=t.destination_prefix AND route.category=t.destination_category)
  AND NOT EXISTS(SELECT 1 FROM luxembourg_operator_fax_routes route WHERE length(route.prefix)>length(t.destination_prefix) AND substr(json_extract(d.recipient_json,'$.phone'),1,length(route.prefix))=route.prefix)
 ))
 AND t.status='qualified' AND t.route_allowed=1 AND (t.destination_category='fixed' OR (t.route_qualification='operator_test' AND t.destination_category IN ('mobile','ngn','freephone'))) AND t.sender_id=d.sender_id AND t.provider='telnyx'
 AND t.account_id=q.account_id AND t.connection_id=q.connection_id AND t.outbound_profile_id=q.outbound_profile_id AND t.options_json=d.options_json
 AND s.status='verified' AND s.mode='production' AND s.channel='fax' AND s.address=d.sender_address AND substr(s.address,1,length(t.sender_prefix))=t.sender_prefix
 AND EXISTS(SELECT 1 FROM audit_log scan WHERE scan.organization_id=doc.organization_id AND scan.action='document.scan_verified' AND scan.resource_id=doc.sha256)
 AND doc.status='ready' AND doc.pages BETWEEN 1 AND t.max_pages AND doc.sha256=json_extract(q.input_json,'$.documentSha256')
 AND substr(json_extract(d.recipient_json,'$.phone'),1,length(t.destination_prefix))=t.destination_prefix
 AND NOT EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs specific WHERE specific.organization_id=t.organization_id AND specific.sender_id=t.sender_id AND specific.account_id=t.account_id AND specific.connection_id=t.connection_id AND specific.outbound_profile_id=t.outbound_profile_id AND specific.options_json=t.options_json AND length(specific.destination_prefix)>length(t.destination_prefix) AND substr(json_extract(d.recipient_json,'$.phone'),1,length(specific.destination_prefix))=specific.destination_prefix)
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

CREATE VIEW review_only_fax_dispatches AS SELECT q.organization_id,q.dispatch_id FROM live_fax_quotes_v3 q JOIN trusted_fax_usage_tariffs t ON t.organization_id=q.organization_id AND t.id=q.tariff_id WHERE t.execution_scope='review_prepare_only';
CREATE TRIGGER review_fax_quote_prepared BEFORE INSERT ON live_fax_quotes_v3 WHEN EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs t WHERE t.organization_id=NEW.organization_id AND t.id=NEW.tariff_id AND t.execution_scope='review_prepare_only')
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE NOT EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND d.status='prepared' AND d.provider IS NULL AND d.provider_id IS NULL AND d.active_attempt_id IS NULL) OR EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.dispatch_id) OR EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.dispatch_id) OR EXISTS(SELECT 1 FROM outbox o WHERE o.organization_id=NEW.organization_id AND o.dispatch_id=NEW.dispatch_id) OR EXISTS(SELECT 1 FROM reservations r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_approval_insert BEFORE INSERT ON approvals
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_approval_update BEFORE UPDATE ON approvals
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_dispatch_execution BEFORE UPDATE OF status ON dispatches WHEN NEW.status IN ('queued','submitting')
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.id);
END;
CREATE TRIGGER review_fax_attempts_insert BEFORE INSERT ON attempts
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_outbox_insert BEFORE INSERT ON outbox
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_reservations_insert BEFORE INSERT ON reservations
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_welcome_credit_reservations_insert BEFORE INSERT ON welcome_credit_reservations
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_expert_dispatch_reviews_insert BEFORE INSERT ON expert_dispatch_reviews
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_expert_approval_acceptances_insert BEFORE INSERT ON expert_approval_acceptances
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_fax_usage_settlements_insert BEFORE INSERT ON fax_usage_settlements
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
CREATE TRIGGER review_fax_media_insert BEFORE INSERT ON document_access_grants
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_only') WHERE EXISTS(SELECT 1 FROM review_only_fax_dispatches r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id);
END;
