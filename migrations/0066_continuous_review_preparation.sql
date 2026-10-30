-- Continuous review is an explicit operator opt-in over an archived, unsendable
-- reference. It does not extend or rewrite provider evidence or old authorities.
CREATE TABLE fax_review_preparation_access (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 reviewer_user_id TEXT NOT NULL REFERENCES users(id),
 tariff_id TEXT NOT NULL,
 authority_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','revoked')),
 created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds') IS created_at),
 authorization_reference TEXT NOT NULL CHECK(length(authorization_reference) BETWEEN 1 AND 500 AND instr(authorization_reference,char(10))=0 AND instr(authorization_reference,char(13))=0),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,tariff_id),
 FOREIGN KEY(organization_id,tariff_id) REFERENCES trusted_fax_usage_tariffs(organization_id,id),
 FOREIGN KEY(organization_id,authority_id) REFERENCES fax_review_preparation_authorities(organization_id,id)
);
CREATE TRIGGER immutable_fax_review_preparation_access BEFORE UPDATE ON fax_review_preparation_access
WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id
 OR NEW.reviewer_user_id IS NOT OLD.reviewer_user_id OR NEW.tariff_id IS NOT OLD.tariff_id
 OR NEW.authority_id IS NOT OLD.authority_id OR NEW.created_at IS NOT OLD.created_at
 OR NEW.authorization_reference IS NOT OLD.authorization_reference
 OR (OLD.status='revoked' AND NEW.status<>'revoked')
BEGIN
 SELECT RAISE(ABORT,'immutable_fax_review_preparation_access');
END;
CREATE TRIGGER retained_fax_review_preparation_access BEFORE DELETE ON fax_review_preparation_access
WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id)
BEGIN
 SELECT RAISE(ABORT,'immutable_fax_review_preparation_access');
END;

-- Current tenant membership, the durable identity restriction and both execution
-- gates remain live conditions. An unrelated member invalidates this narrow opt-in.
CREATE VIEW valid_continuous_review_fax_access AS
 SELECT access.* FROM fax_review_preparation_access access
 JOIN organizations organization ON organization.id=access.organization_id AND organization.mode='production'
 JOIN trusted_fax_usage_tariffs tariff ON tariff.organization_id=access.organization_id AND tariff.id=access.tariff_id
 JOIN fax_review_preparation_authorities authority ON authority.organization_id=access.organization_id AND authority.id=access.authority_id
 JOIN memberships membership ON membership.organization_id=access.organization_id AND membership.user_id=access.reviewer_user_id AND membership.role='admin'
 JOIN senders sender ON sender.organization_id=tariff.organization_id AND sender.id=tariff.sender_id AND sender.channel='fax' AND sender.mode='production' AND sender.status='verified'
 WHERE access.status='active' AND tariff.status='qualified' AND authority.status='active'
 AND tariff.execution_scope='review_prepare_only' AND tariff.review_authority_id=authority.id
 AND tariff.sender_id=authority.sender_id AND tariff.account_id=authority.account_id
 AND sender.address=authority.recipient_phone
 AND tariff.connection_id=authority.connection_id AND tariff.outbound_profile_id=authority.outbound_profile_id
 AND tariff.valid_from>=authority.valid_from AND tariff.expires_at<=authority.expires_at
 AND substr(authority.recipient_phone,1,length(tariff.destination_prefix))=tariff.destination_prefix
 AND tariff.max_pages<=7 AND tariff.operator_test_ceiling_minor<=200
 AND EXISTS(SELECT 1 FROM prepare_only_users restricted WHERE restricted.user_id=access.reviewer_user_id)
 AND NOT EXISTS(SELECT 1 FROM memberships other WHERE other.organization_id=access.organization_id AND other.user_id<>access.reviewer_user_id)
 AND EXISTS(SELECT 1 FROM channel_controls control WHERE control.organization_id=access.organization_id AND control.channel='fax' AND control.enabled=0)
 AND NOT EXISTS(SELECT 1 FROM expert_approval_policies policy WHERE policy.organization_id=access.organization_id AND policy.enabled=1);
CREATE TRIGGER qualified_fax_review_preparation_access AFTER INSERT ON fax_review_preparation_access
BEGIN
 SELECT RAISE(ABORT,'fax_review_preparation_access_invalid') WHERE NEW.status<>'active' OR NOT EXISTS(
  SELECT 1 FROM valid_continuous_review_fax_access access WHERE access.organization_id=NEW.organization_id AND access.id=NEW.id
 );
END;

ALTER TABLE live_fax_quotes_v3 ADD COLUMN review_access_id TEXT;
CREATE TRIGGER continuous_review_fax_quote_insert BEFORE INSERT ON live_fax_quotes_v3
WHEN NEW.review_access_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(
  SELECT 1 FROM valid_continuous_review_fax_access access
  WHERE access.organization_id=NEW.organization_id AND access.id=NEW.review_access_id
  AND access.tariff_id=NEW.tariff_id AND NEW.created_at>=access.created_at
 );
END;

DROP VIEW valid_review_fax_usage_tariffs;
CREATE VIEW valid_review_fax_usage_tariffs AS
 SELECT t.*,a.recipient_phone AS review_recipient_phone,a.valid_from AS authority_valid_from,a.expires_at AS authority_expires_at,
  continuous.id AS continuous_review_access_id,continuous.created_at AS continuous_review_access_created_at
 FROM trusted_fax_usage_tariffs t JOIN fax_review_preparation_authorities a ON a.organization_id=t.organization_id AND a.id=t.review_authority_id
 LEFT JOIN fax_review_preparation_access access ON access.organization_id=t.organization_id AND access.tariff_id=t.id
 LEFT JOIN valid_continuous_review_fax_access continuous ON continuous.organization_id=t.organization_id AND continuous.id=access.id
 WHERE t.execution_scope='review_prepare_only' AND a.status='active' AND a.sender_id=t.sender_id AND a.account_id=t.account_id AND a.connection_id=t.connection_id AND a.outbound_profile_id=t.outbound_profile_id
 AND t.valid_from>=a.valid_from AND t.expires_at<=a.expires_at AND t.max_pages<=7 AND t.operator_test_ceiling_minor<=200
 AND (access.id IS NULL OR continuous.id IS NOT NULL)
 AND EXISTS(SELECT 1 FROM channel_controls c WHERE c.organization_id=t.organization_id AND c.channel='fax' AND c.enabled=0)
 AND NOT EXISTS(SELECT 1 FROM expert_approval_policies p WHERE p.organization_id=t.organization_id AND p.enabled=1);

-- Keep every original amount, exact-input, scan, sender and route constraint.
-- Only a newly hash-bound quote may use the current continuous access record.
DROP VIEW valid_live_fax_quotes_v3;
CREATE VIEW valid_live_fax_quotes_v3 AS
 SELECT q.*,t.valid_from AS tariff_valid_from,CASE WHEN q.review_access_id IS NOT NULL THEN q.expires_at ELSE t.expires_at END AS tariff_expires_at
 FROM live_fax_quotes_v3 q
 JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id
 JOIN trusted_fax_usage_tariffs t ON t.organization_id=q.organization_id AND t.id=q.tariff_id
 JOIN senders s ON s.organization_id=d.organization_id AND s.id=d.sender_id
 JOIN documents doc ON doc.organization_id=d.organization_id AND doc.id=d.document_id
 WHERE ((((((((t.execution_scope='live' AND q.review_access_id IS NULL) OR EXISTS(
  SELECT 1 FROM valid_review_fax_usage_tariffs rt
  WHERE rt.organization_id=t.organization_id AND rt.id=t.id
  AND rt.review_recipient_phone=json_extract(d.recipient_json,'$.phone') AND q.ceiling_minor<=200
  AND ((q.review_access_id IS NULL AND q.created_at>=rt.authority_valid_from AND q.expires_at<=rt.authority_expires_at)
   OR (q.review_access_id=rt.continuous_review_access_id AND q.created_at>=rt.continuous_review_access_created_at))
 )))
 AND ((d.mode='production')
 AND (d.channel='fax')))
 AND ((d.quote_fingerprint=q.fingerprint)
 AND ((d.fingerprint=q.dispatch_fingerprint)
 AND ((t.route_qualification<>'operator_test' OR (
  q.ceiling_minor<=t.operator_test_ceiling_minor
  AND EXISTS(SELECT 1 FROM luxembourg_operator_fax_routes route WHERE route.prefix=t.destination_prefix AND route.category=t.destination_category)
  AND NOT EXISTS(SELECT 1 FROM luxembourg_operator_fax_routes route WHERE length(route.prefix)>length(t.destination_prefix) AND substr(json_extract(d.recipient_json,'$.phone'),1,length(route.prefix))=route.prefix)
 ))))))
 AND (((t.status='qualified')
 AND ((t.route_allowed=1)
 AND ((t.destination_category='fixed' OR (t.route_qualification='operator_test' AND t.destination_category IN ('mobile','ngn','freephone'))))))
 AND (((t.sender_id=d.sender_id)
 AND (t.provider='telnyx'))
 AND ((t.account_id=q.account_id)
 AND (t.connection_id=q.connection_id)))))
 AND ((((t.outbound_profile_id=q.outbound_profile_id)
 AND ((t.options_json=d.options_json)
 AND (s.status='verified')))
 AND ((s.mode='production')
 AND ((s.channel='fax')
 AND (s.address=d.sender_address))))
 AND (((substr(s.address,1,length(t.sender_prefix))=t.sender_prefix)
 AND ((EXISTS(SELECT 1 FROM audit_log scan WHERE scan.organization_id=doc.organization_id AND scan.action='document.scan_verified' AND scan.resource_id=doc.sha256))
 AND (doc.status='ready')))
 AND ((((doc.pages BETWEEN 1 AND t.max_pages))
 AND (doc.sha256=json_extract(q.input_json,'$.documentSha256')))
 AND ((substr(json_extract(d.recipient_json,'$.phone'),1,length(t.destination_prefix))=t.destination_prefix)
 AND (NOT EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs specific WHERE specific.organization_id=t.organization_id AND specific.sender_id=t.sender_id AND specific.account_id=t.account_id AND specific.connection_id=t.connection_id AND specific.outbound_profile_id=t.outbound_profile_id AND specific.options_json=t.options_json AND length(specific.destination_prefix)>length(t.destination_prefix) AND substr(json_extract(d.recipient_json,'$.phone'),1,length(specific.destination_prefix))=specific.destination_prefix)))))))
 AND (((((q.estimated_low_nanoeur=2*((((t.page_nano_usd*doc.pages+t.minute_nano_usd*((t.duration_base_seconds+doc.pages*t.duration_low_per_page_seconds+59)/60)+t.call_nano_usd)*t.fx_numerator)+t.fx_denominator-1)/t.fx_denominator))
 AND ((q.estimated_high_nanoeur=2*((((t.page_nano_usd*doc.pages+t.minute_nano_usd*((t.duration_base_seconds+doc.pages*t.duration_high_per_page_seconds+59)/60)+t.call_nano_usd)*t.fx_numerator)+t.fx_denominator-1)/t.fx_denominator))
 AND (q.amount_minor=d.estimated_minor)))
 AND ((q.ceiling_minor=d.ceiling_minor)
 AND ((q.currency=d.currency)
 AND (q.fx_numerator=t.fx_numerator))))
 AND (((q.fx_denominator=t.fx_denominator)
 AND ((q.fx_date=t.fx_date)
 AND (q.fx_source=t.fx_source)))
 AND (((q.source_reference=t.source_reference)
 AND (q.source_sha256=t.source_sha256))
 AND (((q.review_access_id IS NOT NULL OR q.expires_at<=t.expires_at))
 AND (q.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ',q.created_at,'+'||t.quote_ttl_seconds||' seconds'))))))
 AND ((((json_extract(q.input_json,'$.channel') IS d.channel)
 AND ((json_extract(q.input_json,'$.recipient') IS d.recipient_json)
 AND (json_extract(q.input_json,'$.documentId') IS d.document_id)))
 AND (((json_extract(q.input_json,'$.senderId') IS d.sender_id)
 AND (json_extract(q.input_json,'$.senderAddress') IS d.sender_address))
 AND ((json_extract(q.input_json,'$.subject') IS d.subject)
 AND (json_extract(q.input_json,'$.html') IS d.html))))
 AND (((json_extract(q.input_json,'$.text') IS d.text)
 AND ((json_extract(q.input_json,'$.options') IS d.options_json)
 AND (json_extract(q.input_json,'$.campaignId') IS d.campaign_id)))
 AND (((json_extract(q.input_json,'$.estimatedMinor') IS d.estimated_minor)
 AND (json_extract(q.input_json,'$.ceilingMinor') IS d.ceiling_minor))
 AND ((json_extract(q.input_json,'$.currency') IS d.currency)
 AND (json_extract(q.input_json,'$.mode') IS d.mode)))))));
