-- Commercial source deadlines govern refresh. The immutable customer quote has its own TTL.
-- Account, route, sender, document, approval, currency, amount and revocation checks still apply.
-- Automatic replacement preserves already-bound and in-progress quotes for their own short TTL.
CREATE TABLE superseded_email_prices (
  organization_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  replaced_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, policy_id),
  FOREIGN KEY (organization_id, policy_id) REFERENCES trusted_delivery_costs(organization_id,id) ON DELETE CASCADE
);
-- PDF inclusion on the published schedule is a Guteneo commercial term on either email transport.
DROP TRIGGER qualified_email_attachment_scope;
CREATE TRIGGER qualified_email_attachment_scope BEFORE INSERT ON trusted_delivery_costs WHEN NEW.channel='email'
BEGIN
  SELECT RAISE(ABORT,'email_attachment_scope_invalid') WHERE NEW.source_reference='guteneo:email:2026-09-21'
    AND (NEW.options_json<>'{"guteneoEmailTariff":1}' OR NEW.rate_json<>'{"attachmentBasis":"included_pdf","customerNanoEur":1560000}'
      OR NEW.base_numerator<>780000 OR NEW.byte_numerator<>0 OR NEW.rate_denominator<>1);
  SELECT RAISE(ABORT,'email_attachment_scope_invalid') WHERE json_extract(NEW.rate_json,'$.attachmentBasis')='included_pdf'
    AND NEW.provider<>'resend' AND NEW.source_reference<>'guteneo:email:2026-09-21';
  SELECT RAISE(ABORT,'email_attachment_scope_invalid') WHERE
    COALESCE(json_extract(NEW.rate_json,'$.attachmentBasis') IN ('no_attachments','raw_pdf_bytes','included_pdf'),0)=0
    OR (json_extract(NEW.rate_json,'$.attachmentBasis') IN ('no_attachments','included_pdf') AND
      (NEW.byte_numerator<>0 OR json_type(NEW.rate_json,'$.usdMicrosPerGb') IS NOT NULL OR json_type(NEW.rate_json,'$.bytesPerGb') IS NOT NULL));
END;

DROP VIEW valid_live_delivery_quotes;
CREATE VIEW valid_live_delivery_quotes AS
SELECT q.*,p.valid_from AS policy_valid_from,p.expires_at AS policy_expires_at
FROM live_delivery_quotes q
JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id
JOIN trusted_delivery_costs p ON p.organization_id=q.organization_id AND p.id=q.policy_id
JOIN senders s ON s.organization_id=d.organization_id AND s.id=d.sender_id
LEFT JOIN documents doc ON doc.organization_id=d.organization_id AND doc.id=d.document_id
WHERE (json_extract(d.options_json,'$.emailDeliveryMode') IS NOT 'protected_link' OR EXISTS(SELECT 1 FROM protected_document_hostings h WHERE h.organization_id=d.organization_id AND h.id=json_extract(d.options_json,'$.protectedDocument.hostingId') AND h.document_id=d.document_id AND h.document_sha256=doc.sha256 AND h.status IN ('draft','active') AND h.expires_at=json_extract(d.options_json,'$.protectedDocument.expiresAt') AND h.duration_days=json_extract(d.options_json,'$.protectedDocument.durationDays') AND h.expires_at>q.created_at AND json_extract(d.options_json,'$.protectedDocument.hostingFeeMinor') IN (0,100) AND (h.status='active' OR json_extract(d.options_json,'$.protectedDocument.hostingFeeMinor')=100))) AND (d.provider IS NULL OR d.provider=q.provider)
  AND d.mode='production' AND d.channel=q.channel AND d.quote_fingerprint=q.fingerprint AND d.fingerprint=q.dispatch_fingerprint AND (p.status='qualified' OR (p.channel='email' AND EXISTS (
    SELECT 1 FROM superseded_email_prices r WHERE r.organization_id=q.organization_id
      AND r.policy_id=q.policy_id AND q.created_at<=r.replaced_at
  ))) AND p.sender_id=d.sender_id AND p.channel=d.channel AND p.provider=q.provider AND p.account_id=q.account_id AND p.route_id=q.route_id
  AND s.status='verified' AND s.mode='production' AND s.channel=d.channel AND s.address=d.sender_address AND (d.document_id IS NULL OR (doc.status='ready' AND doc.sha256=json_extract(q.input_json,'$.documentSha256')))
  AND q.attachment_bytes=iif(json_extract(d.options_json,'$.emailDeliveryMode')='protected_link',0,COALESCE(doc.size,0))
  AND q.amount_minor+(iif(json_extract(d.options_json,'$.emailDeliveryMode')='protected_link',COALESCE(json_extract(d.options_json,'$.protectedDocument.hostingFeeMinor'),0),0))+COALESCE(json_extract(d.options_json,'$.secureDistribution.serviceFeeMinor'),0)=d.estimated_minor
  AND q.ceiling_minor=d.ceiling_minor
  AND q.currency=d.currency
  AND q.source_reference=p.source_reference
  AND q.source_sha256=p.source_sha256 AND (
    (q.fiscal_basis=p.pricing_basis AND p.source_reference<>'guteneo:email:2026-09-21') OR
    (q.fiscal_basis='published_customer_tariff'
      AND json_extract(q.input_json,'$.pricingBasis')='published_customer_tariff'
      AND json_type(q.input_json,'$.fx') IS NULL AND (
        (q.channel='email' AND p.source_reference='guteneo:email:2026-09-21'
          AND p.options_json='{"guteneoEmailTariff":1}'
          AND p.rate_json='{"attachmentBasis":"included_pdf","customerNanoEur":1560000}'
          AND p.base_numerator=780000 AND p.byte_numerator=0 AND p.rate_denominator=1)
        OR (q.channel='postal'
          AND json_extract(q.input_json,'$.postalPriceReference.source')='guteneo_continuity_v1'
          AND q.amount_minor=250 AND q.supplier_nanoeur=1250000000)
      ))
  ) AND (p.pricing_basis='qualified_final_variable_cost' OR (json_extract(q.input_json,'$.pricingBasis')='public_list_price_ex_tax'
  AND json_extract(q.input_json,'$.fx.numerator')=json_extract(p.rate_json,'$.eurPerUsdNumerator')
  AND json_extract(q.input_json,'$.fx.denominator')=json_extract(p.rate_json,'$.eurPerUsdDenominator')
  AND json_extract(q.input_json,'$.fx.date')=json_extract(p.rate_json,'$.fxDate')
  AND json_extract(q.input_json,'$.fx.source')=json_extract(p.rate_json,'$.fxSource') AND p.channel='email') OR (p.pricing_basis='public_list_price_ex_tax' AND p.channel='postal' AND p.provider='pingen' AND p.account_id=p.route_id AND p.base_numerator=0 AND p.byte_numerator=0 AND p.rate_denominator=1 AND json_type(p.rate_json)='object' AND (SELECT count(*) FROM json_each(p.rate_json))=8 AND json_extract(p.rate_json,'$.pricingBasis')='public_list_price_ex_tax' AND json_extract(p.rate_json,'$.method')='pingen_price_calculator' AND json_extract(p.rate_json,'$.currency')='EUR' AND json_extract(p.rate_json,'$.unit')='letter' AND json_extract(p.rate_json,'$.tariffSource')='https://api.pingen.com/documentation/swagger-docs' AND json_extract(p.rate_json,'$.taxBasis')='shipping_price_excluding_vat' AND json_extract(p.rate_json,'$.taxSource')='https://help.pingen.com/en/credits-and-billing/introduction-balance-and-credits' AND json_type(p.rate_json,'$.tariffDate')='text' AND length(json_extract(p.rate_json,'$.tariffDate'))=10 AND json_extract(p.rate_json,'$.tariffDate')=date(json_extract(p.rate_json,'$.tariffDate'),'+0 days') AND json_extract(p.rate_json,'$.tariffDate')<=substr(p.valid_from,1,10) AND json_extract(p.options_json,'$.addressPosition') IN ('left','right') AND json_extract(p.options_json,'$.deliveryProduct') IN ('cheap','fast') AND json_extract(p.options_json,'$.printMode') IN ('simplex','duplex') AND json_extract(p.options_json,'$.printSpectrum') IN ('grayscale','color') AND p.options_json=json_object('addressPosition',json_extract(p.options_json,'$.addressPosition'),'deliveryProduct',json_extract(p.options_json,'$.deliveryProduct'),'printMode',json_extract(p.options_json,'$.printMode'),'printSpectrum',json_extract(p.options_json,'$.printSpectrum')) AND (json_extract(q.input_json,'$.pricingBasis')='public_list_price_ex_tax' OR q.fiscal_basis='published_customer_tariff') AND json_type(q.input_json,'$.fx') IS NULL))
  AND q.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ',q.created_at,'+'||p.quote_ttl_seconds||' seconds')
  AND json_extract(q.input_json,'$.channel') IS d.channel
  AND json_extract(q.input_json,'$.recipient') IS d.recipient_json
  AND json_extract(q.input_json,'$.documentId') IS d.document_id
  AND json_extract(q.input_json,'$.senderId') IS d.sender_id
  AND json_extract(q.input_json,'$.senderAddress') IS d.sender_address
  AND json_extract(q.input_json,'$.subject') IS d.subject
  AND json_extract(q.input_json,'$.html') IS d.html
  AND json_extract(q.input_json,'$.text') IS d.text
  AND json_extract(q.input_json,'$.options') IS d.options_json
  AND json_extract(q.input_json,'$.campaignId') IS d.campaign_id
  AND json_extract(q.input_json,'$.estimatedMinor') IS d.estimated_minor
  AND json_extract(q.input_json,'$.ceilingMinor') IS d.ceiling_minor
  AND json_extract(q.input_json,'$.currency') IS d.currency
  AND json_extract(q.input_json,'$.mode') IS d.mode
  AND ((d.channel='email' AND (json_extract(p.rate_json,'$.attachmentBasis')='raw_pdf_bytes' OR ((p.provider='resend' OR p.source_reference='guteneo:email:2026-09-21') AND json_extract(p.rate_json,'$.attachmentBasis')='included_pdf' AND p.byte_numerator=0) OR (json_extract(p.rate_json,'$.attachmentBasis')='no_attachments' AND (d.document_id IS NULL OR json_extract(d.options_json,'$.emailDeliveryMode')='protected_link')
  AND q.attachment_bytes=0 AND p.byte_numerator=0 AND json_type(p.rate_json,'$.usdMicrosPerGb') IS NULL AND json_type(p.rate_json,'$.bytesPerGb') IS NULL)) AND (p.options_json=d.options_json OR (p.provider='resend' AND p.options_json='{}') OR (p.source_reference='guteneo:email:2026-09-21'
  AND q.fiscal_basis='published_customer_tariff'))
  AND q.provider_draft_id IS NULL
  AND q.prepared_letter_id IS NULL
  AND q.supplier_numerator=CAST(p.base_numerator+p.byte_numerator*q.attachment_bytes AS TEXT)
  AND q.supplier_denominator=CAST(p.rate_denominator AS TEXT)
  AND q.supplier_nanoeur=(p.base_numerator+p.byte_numerator*q.attachment_bytes+p.rate_denominator-1)/p.rate_denominator
  AND q.evidence_sha256=p.source_sha256)
    OR (d.channel='postal' AND doc.id IS NOT NULL
  AND q.supplier_nanoeur%10000000=0
  AND q.supplier_numerator=CAST(q.supplier_nanoeur AS TEXT)
  AND q.supplier_denominator='1' AND EXISTS(SELECT 1 FROM provider_drafts pd WHERE pd.organization_id=d.organization_id AND pd.id=q.provider_draft_id AND pd.provider='pingen' AND pd.status='prepared' AND pd.provider_id=q.prepared_letter_id AND pd.document_id=doc.id AND pd.document_sha256=doc.sha256 AND pd.sender_id=s.id AND pd.sender_address=s.address AND pd.recipient_json=d.recipient_json AND pd.options_json=p.options_json AND pd.ceiling_minor=d.ceiling_minor AND pd.currency=d.currency AND (pd.claimed_dispatch_id IS NULL OR pd.claimed_dispatch_id=d.id) AND json_extract(d.options_json,'$.providerDraftId')=pd.id AND json_extract(d.options_json,'$.preparedLetterId')=pd.provider_id AND json_extract(d.options_json,'$.expectedAddress')=pd.expected_address AND json_extract(d.options_json,'$.addressPosition')=json_extract(pd.options_json,'$.addressPosition') AND json_extract(d.options_json,'$.deliveryProduct')=json_extract(pd.options_json,'$.deliveryProduct') AND json_extract(d.options_json,'$.printMode')=json_extract(pd.options_json,'$.printMode') AND json_extract(d.options_json,'$.printSpectrum')=json_extract(pd.options_json,'$.printSpectrum'))));

DROP TRIGGER preparation_live_delivery_quote;
CREATE TRIGGER preparation_live_delivery_quote AFTER INSERT ON live_delivery_quotes
BEGIN
  SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM valid_live_delivery_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND created_at<=NEW.created_at AND expires_at>NEW.created_at AND policy_valid_from<=NEW.created_at);
END;

DROP TRIGGER approval_live_delivery_insert;
CREATE TRIGGER approval_live_delivery_insert BEFORE INSERT ON approvals WHEN EXISTS(SELECT 1 FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id AND mode='production' AND channel IN ('email','postal'))
BEGIN
  SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM valid_live_delivery_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND created_at<=NEW.created_at AND expires_at>NEW.created_at AND policy_valid_from<=NEW.created_at);
END;

DROP TRIGGER approval_live_delivery_update;
CREATE TRIGGER approval_live_delivery_update BEFORE UPDATE ON approvals WHEN EXISTS(SELECT 1 FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id AND mode='production' AND channel IN ('email','postal'))
BEGIN
  SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM valid_live_delivery_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND created_at<=NEW.created_at AND expires_at>NEW.created_at AND policy_valid_from<=NEW.created_at);
END;

DROP TRIGGER acceptance_live_delivery;
CREATE TRIGGER acceptance_live_delivery BEFORE UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' AND NEW.mode='production' AND NEW.channel IN ('email','postal')
BEGIN
  SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM valid_live_delivery_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND created_at<=NEW.updated_at AND expires_at>NEW.updated_at AND policy_valid_from<=NEW.updated_at);
END;

DROP TRIGGER preflight_live_delivery;
CREATE TRIGGER preflight_live_delivery BEFORE UPDATE OF status ON dispatches WHEN OLD.status='queued' AND NEW.status='submitting' AND NEW.mode='production' AND NEW.channel IN ('email','postal')
BEGIN
  SELECT RAISE(ABORT,'live_quote_invalid') WHERE NOT EXISTS(SELECT 1 FROM valid_live_delivery_quotes WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND provider=NEW.provider AND created_at<=NEW.updated_at AND expires_at>NEW.updated_at AND policy_valid_from<=NEW.updated_at);
END;
