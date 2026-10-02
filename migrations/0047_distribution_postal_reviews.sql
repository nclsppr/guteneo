-- A postal analysis is attached separately from the immutable distribution manifest.
-- It grants no transfer consent, provider draft, quote, approval or sending authority.
CREATE TABLE distribution_postal_reviews (
 organization_id TEXT NOT NULL,
 plan_id TEXT NOT NULL,
 entry_id TEXT NOT NULL,
 preflight_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,plan_id,entry_id),
 UNIQUE(organization_id,preflight_id),
 FOREIGN KEY(organization_id,plan_id,entry_id) REFERENCES distribution_entries(organization_id,plan_id,entry_id),
 FOREIGN KEY(organization_id,preflight_id) REFERENCES postal_preflights(organization_id,id)
);
CREATE TRIGGER immutable_distribution_postal_review BEFORE UPDATE ON distribution_postal_reviews BEGIN SELECT RAISE(ABORT,'immutable_distribution_postal_review'); END;
CREATE TRIGGER distribution_postal_review_binding BEFORE INSERT ON distribution_postal_reviews
BEGIN
 SELECT RAISE(ABORT,'distribution_postal_review_mismatch') WHERE NOT EXISTS(
  SELECT 1 FROM distribution_plans p,json_each(p.manifest_json) e JOIN postal_preflights r ON r.organization_id=p.organization_id AND r.id=NEW.preflight_id
  WHERE p.organization_id=NEW.organization_id AND p.id=NEW.plan_id AND r.user_id=p.owner_id
   AND json_extract(e.value,'$.entryId')=NEW.entry_id AND json_extract(e.value,'$.channel')='postal'
   AND json_extract(e.value,'$.documentId')=r.document_id AND json_extract(e.value,'$.documentHash')=r.document_sha256
   AND json_extract(e.value,'$.senderId')=r.sender_id AND json_extract(e.value,'$.ceilingMinor')=r.ceiling_minor
   AND json_extract(e.value,'$.recipient')=json(r.recipient_json)
   AND json_extract(e.value,'$.options.deliveryProduct')=json_extract(r.options_json,'$.deliveryProduct')
   AND json_extract(e.value,'$.options.printMode')=json_extract(r.options_json,'$.printMode')
   AND json_extract(e.value,'$.options.printSpectrum')=json_extract(r.options_json,'$.printSpectrum')
 );
END;
