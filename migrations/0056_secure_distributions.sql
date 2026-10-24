-- One immutable document/recipient/policy per distribution. No invitation joins an atelier.
CREATE TABLE secure_distributions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
 source_id TEXT NOT NULL, source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 source_name TEXT NOT NULL, source_pages INTEGER NOT NULL CHECK(source_pages BETWEEN 1 AND 100),
 created_by TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 recipient_address TEXT NOT NULL, recipient_name TEXT NOT NULL DEFAULT '',
 recipient_user_id TEXT REFERENCES users(id), claimed_at TEXT, binding_method TEXT, binding_by TEXT, bound_at TEXT,
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64), sealed_token TEXT NOT NULL,
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)), quote_json TEXT NOT NULL CHECK(json_valid(quote_json)),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)), service_fee_minor INTEGER NOT NULL CHECK(service_fee_minor>=0),
 price_version TEXT NOT NULL CHECK(price_version='secure-distribution-2026-10-24-v1'),
 status TEXT NOT NULL CHECK(status IN ('preparing','prepared','active','revoked','expired','failed')),
 dispatch_id TEXT, manifest_sha256 TEXT, original_key TEXT, created_at TEXT NOT NULL,
 prepared_expires_at TEXT NOT NULL, activated_at TEXT, expires_at TEXT, revoked_at TEXT,
 error_code TEXT, lease_token TEXT, lease_expires_at TEXT, next_page INTEGER NOT NULL DEFAULT 1,
 UNIQUE(organization_id,id), UNIQUE(organization_id,request_key), UNIQUE(organization_id,dispatch_id),
 FOREIGN KEY(organization_id,source_id) REFERENCES documents(organization_id,id),
 FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id)
);
CREATE INDEX secure_distribution_recipient ON secure_distributions(recipient_user_id,status,created_at,id);
CREATE INDEX secure_distribution_pending ON secure_distributions(status,lease_expires_at,created_at);
CREATE TRIGGER secure_distribution_immutable BEFORE UPDATE ON secure_distributions WHEN
 NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.source_id IS NOT OLD.source_id OR
 NEW.source_sha256 IS NOT OLD.source_sha256 OR NEW.source_name IS NOT OLD.source_name OR NEW.source_pages IS NOT OLD.source_pages OR
 NEW.created_by IS NOT OLD.created_by OR NEW.request_key IS NOT OLD.request_key OR NEW.request_hash IS NOT OLD.request_hash OR
 NEW.recipient_address IS NOT OLD.recipient_address OR NEW.recipient_name IS NOT OLD.recipient_name OR
 NEW.token_hash IS NOT OLD.token_hash OR NEW.policy_json IS NOT OLD.policy_json OR NEW.service_fee_minor IS NOT OLD.service_fee_minor OR
 NEW.price_version IS NOT OLD.price_version OR NEW.created_at IS NOT OLD.created_at OR NEW.prepared_expires_at IS NOT OLD.prepared_expires_at OR
 (OLD.manifest_sha256 IS NOT NULL AND NEW.manifest_sha256 IS NOT OLD.manifest_sha256) OR
 (OLD.dispatch_id IS NOT NULL AND NEW.dispatch_id IS NOT OLD.dispatch_id) OR
 (OLD.original_key IS NOT NULL AND NEW.original_key IS NOT OLD.original_key) OR
 (OLD.recipient_user_id IS NOT NULL AND NEW.recipient_user_id IS NOT OLD.recipient_user_id) OR
 (OLD.bound_at IS NOT NULL AND (NEW.bound_at IS NOT OLD.bound_at OR NEW.binding_by IS NOT OLD.binding_by OR NEW.binding_method IS NOT OLD.binding_method)) OR
 (OLD.activated_at IS NOT NULL AND (NEW.activated_at IS NOT OLD.activated_at OR NEW.expires_at IS NOT OLD.expires_at)) OR
 (OLD.status IN ('revoked','expired','failed') AND NEW.status<>OLD.status) OR
 (OLD.status<>'preparing' AND NEW.input_json IS NOT OLD.input_json) OR
 (OLD.status<>'preparing' AND NEW.quote_json IS NOT OLD.quote_json AND NOT (OLD.status='prepared' AND OLD.dispatch_id IS NULL AND NEW.dispatch_id IS NOT NULL))
 BEGIN
 SELECT RAISE(ABORT,'secure_distribution_immutable');
END;

CREATE TABLE secure_distribution_pages (
 organization_id TEXT NOT NULL, distribution_id TEXT NOT NULL, page_number INTEGER NOT NULL CHECK(page_number BETWEEN 1 AND 100),
 image_key TEXT NOT NULL UNIQUE, image_sha256 TEXT NOT NULL CHECK(length(image_sha256)=64),
 text_key TEXT NOT NULL UNIQUE, text_sha256 TEXT NOT NULL CHECK(length(text_sha256)=64),
 width INTEGER NOT NULL CHECK(width>0), height INTEGER NOT NULL CHECK(height>0), created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,distribution_id,page_number),
 FOREIGN KEY(organization_id,distribution_id) REFERENCES secure_distributions(organization_id,id)
);
CREATE TRIGGER secure_page_immutable BEFORE UPDATE ON secure_distribution_pages BEGIN
 SELECT RAISE(ABORT,'secure_page_immutable');
END;

-- A prepaid service/capacity term, distinct from email transport. Revoke never credits this ledger.
CREATE TABLE secure_distribution_charges (
 organization_id TEXT NOT NULL REFERENCES organizations(id), distribution_id TEXT NOT NULL,
 dispatch_id TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 evidence TEXT NOT NULL CHECK(evidence IN ('simulation','production')), created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,distribution_id),
 FOREIGN KEY(organization_id,distribution_id) REFERENCES secure_distributions(organization_id,id),
 FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id)
);
CREATE TRIGGER secure_charge_immutable BEFORE UPDATE ON secure_distribution_charges BEGIN
 SELECT RAISE(ABORT,'secure_charge_immutable');
END;
CREATE TRIGGER secure_charge_retained BEFORE DELETE ON secure_distribution_charges BEGIN
 SELECT RAISE(ABORT,'secure_charge_immutable');
END;

CREATE TABLE secure_personal_documents (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 source_organization_id TEXT NOT NULL, source_distribution_id TEXT NOT NULL,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64), source_name TEXT NOT NULL,
 sender_name TEXT NOT NULL, policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
 original_key TEXT NOT NULL UNIQUE, manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
 status TEXT NOT NULL CHECK(status IN ('active','deleted','expired')), created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 UNIQUE(user_id,id), UNIQUE(user_id,source_organization_id,source_distribution_id)
);
CREATE TABLE secure_personal_pages (
 user_id TEXT NOT NULL, personal_document_id TEXT NOT NULL, page_number INTEGER NOT NULL,
 image_key TEXT NOT NULL UNIQUE, image_sha256 TEXT NOT NULL, text_key TEXT NOT NULL UNIQUE, text_sha256 TEXT NOT NULL,
 width INTEGER NOT NULL, height INTEGER NOT NULL,
 PRIMARY KEY(user_id,personal_document_id,page_number),
 FOREIGN KEY(user_id,personal_document_id) REFERENCES secure_personal_documents(user_id,id)
);
CREATE TRIGGER secure_personal_immutable BEFORE UPDATE ON secure_personal_documents WHEN
 NEW.user_id IS NOT OLD.user_id OR NEW.id IS NOT OLD.id OR NEW.source_organization_id IS NOT OLD.source_organization_id OR
 NEW.source_distribution_id IS NOT OLD.source_distribution_id OR NEW.source_sha256 IS NOT OLD.source_sha256 OR
 NEW.source_name IS NOT OLD.source_name OR NEW.sender_name IS NOT OLD.sender_name OR NEW.policy_json IS NOT OLD.policy_json OR
 NEW.original_key IS NOT OLD.original_key OR NEW.manifest_sha256 IS NOT OLD.manifest_sha256 OR
 NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at OR
 (OLD.status<>'active' AND NEW.status<>OLD.status)
 BEGIN
 SELECT RAISE(ABORT,'secure_personal_immutable');
END;

CREATE TABLE secure_deposit_operations (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, distribution_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
 personal_document_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('preparing','active','aborted')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, lease_token TEXT NOT NULL, lease_expires_at TEXT NOT NULL,
 UNIQUE(organization_id,distribution_id,user_id),
 FOREIGN KEY(organization_id,distribution_id) REFERENCES secure_distributions(organization_id,id)
);
CREATE TABLE secure_document_events (
 id TEXT PRIMARY KEY, organization_id TEXT, distribution_id TEXT, personal_document_id TEXT,
 user_id TEXT REFERENCES users(id), session_hash TEXT,
 type TEXT NOT NULL, provenance TEXT NOT NULL CHECK(provenance IN ('server','browser','provider')),
 page_number INTEGER, created_at TEXT NOT NULL,
 CHECK((organization_id IS NOT NULL AND distribution_id IS NOT NULL AND personal_document_id IS NULL) OR
       (organization_id IS NULL AND distribution_id IS NULL AND personal_document_id IS NOT NULL)),
 FOREIGN KEY(organization_id,distribution_id) REFERENCES secure_distributions(organization_id,id)
);
CREATE INDEX secure_events_workshop ON secure_document_events(organization_id,distribution_id,created_at,id);
CREATE INDEX secure_events_personal ON secure_document_events(user_id,personal_document_id,created_at,id);
CREATE TRIGGER secure_event_immutable BEFORE UPDATE ON secure_document_events BEGIN
 SELECT RAISE(ABORT,'secure_event_immutable');
END;
CREATE TABLE secure_document_rate_limits(scope_hash TEXT NOT NULL,window INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(scope_hash,window));

-- Drafts and paid terms retain their exact source; personal objects have a separate lifecycle.
CREATE TRIGGER secure_source_retained BEFORE UPDATE OF status ON documents WHEN NEW.status='purged' AND EXISTS(
 SELECT 1 FROM secure_distributions s WHERE s.organization_id=OLD.organization_id AND s.source_id=OLD.id AND
 ((s.status IN ('preparing','prepared') AND s.prepared_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) OR
  (s.status IN ('active','revoked') AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
) BEGIN
 SELECT RAISE(IGNORE);
END;

CREATE TRIGGER secure_distribution_acceptance_guard BEFORE UPDATE OF status ON dispatches
 WHEN OLD.status='prepared' AND NEW.status='queued' AND json_type(NEW.options_json,'$.secureDistribution')='object'
 BEGIN
 SELECT RAISE(ABORT,'secure_distribution_invalid') WHERE NEW.channel<>'email' OR NEW.document_id IS NOT NULL OR
 NOT EXISTS(SELECT 1 FROM secure_distributions s JOIN documents doc ON doc.organization_id=s.organization_id AND doc.id=s.source_id
 WHERE s.organization_id=NEW.organization_id AND s.dispatch_id=NEW.id AND s.id=json_extract(NEW.options_json,'$.secureDistribution.distributionId')
 AND s.status='prepared' AND s.prepared_expires_at>NEW.updated_at AND doc.status='ready' AND doc.sha256=s.source_sha256
 AND s.source_sha256=json_extract(NEW.options_json,'$.secureDistribution.sourceSha256')
 AND s.manifest_sha256=json_extract(NEW.options_json,'$.secureDistribution.manifestSha256')
 AND s.policy_json=json_extract(NEW.options_json,'$.secureDistribution.policy')
 AND s.recipient_address=lower(json_extract(NEW.recipient_json,'$.email'))
 AND s.service_fee_minor=json_extract(NEW.options_json,'$.secureDistribution.serviceFeeMinor')
 AND s.service_fee_minor=iif(json_extract(s.policy_json,'$.retentionDays')=7,49,iif(json_extract(s.policy_json,'$.retentionDays')=30,99,iif(json_extract(s.policy_json,'$.retentionDays')=90,199,iif(json_extract(s.policy_json,'$.retentionDays')=365,499,-100000))))+
 iif(json_extract(s.policy_json,'$.allowVaultDeposit')=1,iif(json_extract(s.policy_json,'$.personalRetentionDays')=365,199,iif(json_extract(s.policy_json,'$.personalRetentionDays')=1095,499,-100000)),0)
 AND s.price_version=json_extract(NEW.options_json,'$.secureDistribution.priceVersion')
 AND (SELECT count(*) FROM secure_distribution_pages p WHERE p.organization_id=s.organization_id AND p.distribution_id=s.id)=s.source_pages);
 SELECT RAISE(ABORT,'credit_exhausted') WHERE NEW.mode='production' AND NOT EXISTS(SELECT 1 FROM welcome_credit_balances WHERE organization_id=NEW.organization_id AND available_minor>=NEW.ceiling_minor);
 END;

CREATE TRIGGER secure_distribution_acceptance AFTER UPDATE OF status ON dispatches
 WHEN OLD.status='prepared' AND NEW.status='queued' AND json_type(NEW.options_json,'$.secureDistribution')='object'
 BEGIN
 INSERT INTO secure_distribution_charges(organization_id,distribution_id,dispatch_id,amount_minor,evidence,created_at)
 SELECT NEW.organization_id,s.id,NEW.id,s.service_fee_minor,NEW.mode,NEW.updated_at FROM secure_distributions s
 WHERE s.organization_id=NEW.organization_id AND s.dispatch_id=NEW.id AND s.status='prepared';
 UPDATE secure_distributions SET status='active',activated_at=NEW.updated_at,
 expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at,'+'||json_extract(policy_json,'$.retentionDays')||' days')
 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND status='prepared';
 UPDATE usage SET reserved_minor=reserved_minor-json_extract(NEW.options_json,'$.secureDistribution.serviceFeeMinor'),
 confirmed_minor=confirmed_minor+json_extract(NEW.options_json,'$.secureDistribution.serviceFeeMinor')
 WHERE organization_id=NEW.organization_id AND channel=NEW.channel AND period=substr(NEW.updated_at,1,7);
 UPDATE reservations SET amount_minor=amount_minor-json_extract(NEW.options_json,'$.secureDistribution.serviceFeeMinor')
 WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND status='reserved';
 INSERT INTO secure_document_events(id,organization_id,distribution_id,type,provenance,created_at)
 VALUES('secure_activated_'||NEW.id,NEW.organization_id,json_extract(NEW.options_json,'$.secureDistribution.distributionId'),'distribution_activated','server',NEW.updated_at);
 END;

CREATE TRIGGER secure_distribution_submission_guard BEFORE UPDATE OF status ON dispatches
 WHEN OLD.status='queued' AND NEW.status='submitting' AND json_type(NEW.options_json,'$.secureDistribution')='object'
 BEGIN
 SELECT RAISE(ABORT,'secure_distribution_unavailable') WHERE NOT EXISTS(
 SELECT 1 FROM secure_distributions s JOIN documents d ON d.organization_id=s.organization_id AND d.id=s.source_id
 WHERE s.organization_id=NEW.organization_id AND s.dispatch_id=NEW.id AND s.status='active' AND s.expires_at>NEW.updated_at
 AND d.status='ready' AND d.sha256=s.source_sha256 AND s.manifest_sha256=json_extract(NEW.options_json,'$.secureDistribution.manifestSha256'));
 END;

-- Preserve all existing transport/hosting/Horizon ledgers, adding secure terms.
DROP VIEW welcome_credit_balances;
CREATE VIEW welcome_credit_balances AS SELECT g.organization_id,g.currency,g.amount_minor AS granted_minor,g.created_at AS granted_at,COALESCE((SELECT SUM(e.reserved_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0) AS reserved_minor,COALESCE((SELECT SUM(e.spent_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0)+COALESCE((SELECT SUM(h.amount_minor) FROM protected_hosting_charges h WHERE h.organization_id=g.organization_id),0)+COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='production'),0)+COALESCE((SELECT SUM(s.amount_minor) FROM secure_distribution_charges s WHERE s.organization_id=g.organization_id AND s.evidence='production'),0) AS spent_minor,g.amount_minor-COALESCE((SELECT SUM(e.reserved_delta+e.spent_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0)-COALESCE((SELECT SUM(h.amount_minor) FROM protected_hosting_charges h WHERE h.organization_id=g.organization_id),0)-COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='production'),0)-COALESCE((SELECT SUM(s.amount_minor) FROM secure_distribution_charges s WHERE s.organization_id=g.organization_id AND s.evidence='production'),0) AS available_minor FROM welcome_credit_grants g;

DROP TRIGGER welcome_credit_reservation_guard;
CREATE TRIGGER welcome_credit_reservation_guard BEFORE INSERT ON welcome_credit_reservations BEGIN
 SELECT RAISE(ABORT,'credit_reservation_invalid') WHERE NEW.status<>'reserved' OR NOT EXISTS(SELECT 1 FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id AND mode='production' AND status='queued' AND currency='EUR' AND ceiling_minor-(iif(json_extract(options_json,'$.emailDeliveryMode')='protected_link',COALESCE(json_extract(options_json,'$.protectedDocument.hostingFeeMinor'),0),0))-COALESCE(json_extract(options_json,'$.secureDistribution.serviceFeeMinor'),0)=NEW.amount_minor AND estimated_minor-(iif(json_extract(options_json,'$.emailDeliveryMode')='protected_link',COALESCE(json_extract(options_json,'$.protectedDocument.hostingFeeMinor'),0),0))-COALESCE(json_extract(options_json,'$.secureDistribution.serviceFeeMinor'),0)=NEW.charge_minor);
 SELECT RAISE(ABORT,'credit_exhausted') WHERE NOT EXISTS(SELECT 1 FROM welcome_credit_balances WHERE organization_id=NEW.organization_id AND available_minor>0 AND available_minor>=NEW.amount_minor);
END;

DROP TRIGGER welcome_credit_accept;
CREATE TRIGGER welcome_credit_accept AFTER UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' AND NEW.mode='production' BEGIN INSERT INTO welcome_credit_reservations(organization_id,dispatch_id,amount_minor,charge_minor,status,created_at,updated_at) VALUES(NEW.organization_id,NEW.id,NEW.ceiling_minor-(iif(json_extract(NEW.options_json,'$.emailDeliveryMode')='protected_link',COALESCE(json_extract(NEW.options_json,'$.protectedDocument.hostingFeeMinor'),0),0))-COALESCE(json_extract(NEW.options_json,'$.secureDistribution.serviceFeeMinor'),0),NEW.estimated_minor-(iif(json_extract(NEW.options_json,'$.emailDeliveryMode')='protected_link',COALESCE(json_extract(NEW.options_json,'$.protectedDocument.hostingFeeMinor'),0),0))-COALESCE(json_extract(NEW.options_json,'$.secureDistribution.serviceFeeMinor'),0),'reserved',NEW.updated_at,NEW.updated_at);
END;

DROP VIEW valid_live_delivery_quotes;
CREATE VIEW valid_live_delivery_quotes AS SELECT q.*,p.valid_from AS policy_valid_from,p.expires_at AS policy_expires_at FROM live_delivery_quotes q JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id JOIN trusted_delivery_costs p ON p.organization_id=q.organization_id AND p.id=q.policy_id JOIN senders s ON s.organization_id=d.organization_id AND s.id=d.sender_id LEFT JOIN documents doc ON doc.organization_id=d.organization_id AND doc.id=d.document_id WHERE (json_extract(d.options_json,'$.emailDeliveryMode') IS NOT 'protected_link' OR EXISTS(SELECT 1 FROM protected_document_hostings h WHERE h.organization_id=d.organization_id AND h.id=json_extract(d.options_json,'$.protectedDocument.hostingId') AND h.document_id=d.document_id AND h.document_sha256=doc.sha256 AND h.status IN ('draft','active') AND h.expires_at=json_extract(d.options_json,'$.protectedDocument.expiresAt') AND h.duration_days=json_extract(d.options_json,'$.protectedDocument.durationDays') AND h.expires_at>q.created_at AND json_extract(d.options_json,'$.protectedDocument.hostingFeeMinor') IN (0,100) AND (h.status='active' OR json_extract(d.options_json,'$.protectedDocument.hostingFeeMinor')=100))) AND (d.provider IS NULL OR d.provider=q.provider) AND d.mode='production' AND d.channel=q.channel AND d.quote_fingerprint=q.fingerprint AND d.fingerprint=q.dispatch_fingerprint AND p.status='qualified' AND p.sender_id=d.sender_id AND p.channel=d.channel AND p.provider=q.provider AND p.account_id=q.account_id AND p.route_id=q.route_id AND s.status='verified' AND s.mode='production' AND s.channel=d.channel AND s.address=d.sender_address AND (d.document_id IS NULL OR (doc.status='ready' AND doc.sha256=json_extract(q.input_json,'$.documentSha256'))) AND q.attachment_bytes=iif(json_extract(d.options_json,'$.emailDeliveryMode')='protected_link',0,COALESCE(doc.size,0)) AND q.amount_minor+(iif(json_extract(d.options_json,'$.emailDeliveryMode')='protected_link',COALESCE(json_extract(d.options_json,'$.protectedDocument.hostingFeeMinor'),0),0))+COALESCE(json_extract(d.options_json,'$.secureDistribution.serviceFeeMinor'),0)=d.estimated_minor AND q.ceiling_minor=d.ceiling_minor AND q.currency=d.currency AND q.source_reference=p.source_reference AND q.source_sha256=p.source_sha256 AND q.fiscal_basis=p.pricing_basis AND (p.pricing_basis='qualified_final_variable_cost' OR (json_extract(q.input_json,'$.pricingBasis')='public_list_price_ex_tax' AND json_extract(q.input_json,'$.fx.numerator')=json_extract(p.rate_json,'$.eurPerUsdNumerator') AND json_extract(q.input_json,'$.fx.denominator')=json_extract(p.rate_json,'$.eurPerUsdDenominator') AND json_extract(q.input_json,'$.fx.date')=json_extract(p.rate_json,'$.fxDate') AND json_extract(q.input_json,'$.fx.source')=json_extract(p.rate_json,'$.fxSource') AND p.channel='email') OR (p.pricing_basis='public_list_price_ex_tax' AND p.channel='postal' AND p.provider='pingen' AND p.account_id=p.route_id AND p.base_numerator=0 AND p.byte_numerator=0 AND p.rate_denominator=1 AND json_type(p.rate_json)='object' AND (SELECT count(*) FROM json_each(p.rate_json))=8 AND json_extract(p.rate_json,'$.pricingBasis')='public_list_price_ex_tax' AND json_extract(p.rate_json,'$.method')='pingen_price_calculator' AND json_extract(p.rate_json,'$.currency')='EUR' AND json_extract(p.rate_json,'$.unit')='letter' AND json_extract(p.rate_json,'$.tariffSource')='https://api.pingen.com/documentation/swagger-docs' AND json_extract(p.rate_json,'$.taxBasis')='shipping_price_excluding_vat' AND json_extract(p.rate_json,'$.taxSource')='https://help.pingen.com/en/credits-and-billing/introduction-balance-and-credits' AND json_type(p.rate_json,'$.tariffDate')='text' AND length(json_extract(p.rate_json,'$.tariffDate'))=10 AND json_extract(p.rate_json,'$.tariffDate')=date(json_extract(p.rate_json,'$.tariffDate'),'+0 days') AND json_extract(p.rate_json,'$.tariffDate')<=substr(p.valid_from,1,10) AND json_extract(p.options_json,'$.addressPosition') IN ('left','right') AND json_extract(p.options_json,'$.deliveryProduct') IN ('cheap','fast') AND json_extract(p.options_json,'$.printMode') IN ('simplex','duplex') AND json_extract(p.options_json,'$.printSpectrum') IN ('grayscale','color') AND p.options_json=json_object('addressPosition',json_extract(p.options_json,'$.addressPosition'),'deliveryProduct',json_extract(p.options_json,'$.deliveryProduct'),'printMode',json_extract(p.options_json,'$.printMode'),'printSpectrum',json_extract(p.options_json,'$.printSpectrum')) AND json_extract(q.input_json,'$.pricingBasis')='public_list_price_ex_tax' AND json_type(q.input_json,'$.fx') IS NULL)) AND q.expires_at<=p.expires_at AND q.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ',q.created_at,'+'||p.quote_ttl_seconds||' seconds') AND json_extract(q.input_json,'$.channel') IS d.channel AND json_extract(q.input_json,'$.recipient') IS d.recipient_json AND json_extract(q.input_json,'$.documentId') IS d.document_id AND json_extract(q.input_json,'$.senderId') IS d.sender_id AND json_extract(q.input_json,'$.senderAddress') IS d.sender_address AND json_extract(q.input_json,'$.subject') IS d.subject AND json_extract(q.input_json,'$.html') IS d.html AND json_extract(q.input_json,'$.text') IS d.text AND json_extract(q.input_json,'$.options') IS d.options_json AND json_extract(q.input_json,'$.campaignId') IS d.campaign_id AND json_extract(q.input_json,'$.estimatedMinor') IS d.estimated_minor AND json_extract(q.input_json,'$.ceilingMinor') IS d.ceiling_minor AND json_extract(q.input_json,'$.currency') IS d.currency AND json_extract(q.input_json,'$.mode') IS d.mode AND ((d.channel='email' AND (json_extract(p.rate_json,'$.attachmentBasis')='raw_pdf_bytes' OR (p.provider='resend' AND json_extract(p.rate_json,'$.attachmentBasis')='included_pdf' AND p.byte_numerator=0) OR (json_extract(p.rate_json,'$.attachmentBasis')='no_attachments' AND (d.document_id IS NULL OR json_extract(d.options_json,'$.emailDeliveryMode')='protected_link') AND q.attachment_bytes=0 AND p.byte_numerator=0 AND json_type(p.rate_json,'$.usdMicrosPerGb') IS NULL AND json_type(p.rate_json,'$.bytesPerGb') IS NULL)) AND (p.options_json=d.options_json OR (p.provider='resend' AND p.options_json='{}')) AND q.provider_draft_id IS NULL AND q.prepared_letter_id IS NULL AND q.supplier_numerator=CAST(p.base_numerator+p.byte_numerator*q.attachment_bytes AS TEXT) AND q.supplier_denominator=CAST(p.rate_denominator AS TEXT) AND q.supplier_nanoeur=(p.base_numerator+p.byte_numerator*q.attachment_bytes+p.rate_denominator-1)/p.rate_denominator AND q.evidence_sha256=p.source_sha256) OR (d.channel='postal' AND doc.id IS NOT NULL AND q.supplier_nanoeur%10000000=0 AND q.supplier_numerator=CAST(q.supplier_nanoeur AS TEXT) AND q.supplier_denominator='1' AND EXISTS(SELECT 1 FROM provider_drafts pd WHERE pd.organization_id=d.organization_id AND pd.id=q.provider_draft_id AND pd.provider='pingen' AND pd.status='prepared' AND pd.provider_id=q.prepared_letter_id AND pd.document_id=doc.id AND pd.document_sha256=doc.sha256 AND pd.sender_id=s.id AND pd.sender_address=s.address AND pd.recipient_json=d.recipient_json AND pd.options_json=p.options_json AND pd.ceiling_minor=d.ceiling_minor AND pd.currency=d.currency AND (pd.claimed_dispatch_id IS NULL OR pd.claimed_dispatch_id=d.id) AND json_extract(d.options_json,'$.providerDraftId')=pd.id AND json_extract(d.options_json,'$.preparedLetterId')=pd.provider_id AND json_extract(d.options_json,'$.expectedAddress')=pd.expected_address AND json_extract(d.options_json,'$.addressPosition')=json_extract(pd.options_json,'$.addressPosition') AND json_extract(d.options_json,'$.deliveryProduct')=json_extract(pd.options_json,'$.deliveryProduct') AND json_extract(d.options_json,'$.printMode')=json_extract(pd.options_json,'$.printMode') AND json_extract(d.options_json,'$.printSpectrum')=json_extract(pd.options_json,'$.printSpectrum'))));

-- Sensitive sources cannot coexist with legacy original-byte sharing or a
-- reserved postal derivative. Both directions are fenced at the SQL write,
-- including the async crash window before derivative registration completes.
CREATE INDEX secure_distribution_source ON secure_distributions(organization_id,source_id);
CREATE INDEX postal_address_pages_source ON postal_address_pages(organization_id,source_document_id);
CREATE TRIGGER secure_source_legacy_exposure_guard BEFORE INSERT ON secure_distributions
BEGIN
 SELECT RAISE(ABORT,'secure_source_legacy_exposure') WHERE EXISTS(SELECT 1 FROM protected_document_hostings h WHERE h.organization_id=NEW.organization_id AND h.document_id=NEW.source_id AND h.status IN ('draft','active') AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) OR EXISTS(SELECT 1 FROM postal_address_pages p WHERE p.organization_id=NEW.organization_id AND p.source_document_id=NEW.source_id) OR EXISTS(SELECT 1 FROM postal_preflights p WHERE p.organization_id=NEW.organization_id AND p.document_id=NEW.source_id) OR EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.document_id=NEW.source_id) OR EXISTS(SELECT 1 FROM provider_drafts d WHERE d.organization_id=NEW.organization_id AND d.document_id=NEW.source_id);
END;
CREATE TRIGGER legacy_hosting_sensitive_insert_guard BEFORE INSERT ON protected_document_hostings WHEN NEW.status IN ('draft','active')
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id);
END;
CREATE TRIGGER legacy_hosting_sensitive_update_guard BEFORE UPDATE ON protected_document_hostings WHEN NEW.status IN ('draft','active')
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id);
END;
CREATE TRIGGER legacy_postal_sensitive_insert_guard BEFORE INSERT ON postal_address_pages
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.source_document_id);
END;
CREATE TRIGGER legacy_postal_sensitive_update_guard BEFORE UPDATE ON postal_address_pages
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.source_document_id);
END;

CREATE INDEX postal_preflights_source ON postal_preflights(organization_id,document_id);
CREATE TRIGGER legacy_preflight_sensitive_insert_guard BEFORE INSERT ON postal_preflights
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id);
END;
CREATE TRIGGER legacy_provider_draft_sensitive_insert_guard BEFORE INSERT ON provider_drafts
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id);
END;
CREATE TRIGGER legacy_dispatch_sensitive_insert_guard BEFORE INSERT ON dispatches WHEN NEW.document_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id);
END;
CREATE TRIGGER legacy_dispatch_sensitive_accept_guard BEFORE UPDATE OF status ON dispatches WHEN NEW.document_id IS NOT NULL AND NEW.status IN ('queued','submitting')
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id);
END;
