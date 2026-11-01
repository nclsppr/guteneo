-- Add an explicit address-block branch without rewriting historical records,
-- quote JSON, fingerprints, approvals, policies or limits. The existing v2
-- legacy branch retains its exact guard. This migration is safe before the
-- new runtime: legacy writers continue to produce the same v1 pages/v2 proof.
DROP TRIGGER require_postal_review_on_commit;
CREATE TRIGGER require_postal_review_on_commit BEFORE UPDATE OF status ON dispatches
WHEN NEW.mode='production' AND NEW.channel='postal' AND NEW.status IN ('queued','submitting') AND NEW.status<>OLD.status
BEGIN
  -- Keep the existing sensitive-source denial first even when SQLite runs this
  -- recreated trigger before legacy_dispatch_sensitive_accept_guard (0056).
  SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE NEW.document_id IS NOT NULL AND EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id);
  SELECT RAISE(ABORT,'postal_preflight_required') WHERE NOT EXISTS(
    SELECT 1 FROM valid_postal_draft_reviews p
    JOIN live_delivery_quotes q ON q.organization_id=p.organization_id AND q.provider_draft_id=p.provider_draft_id
    JOIN postal_preflights f ON f.organization_id=p.organization_id AND f.id=p.preflight_id
    WHERE p.organization_id=NEW.organization_id AND q.dispatch_id=NEW.id
      AND p.document_id=NEW.document_id AND p.document_sha256=json_extract(q.input_json,'$.documentSha256')
      AND json_extract(p.profile_json,'$.accountId')=q.account_id
      AND (
        (json_extract(p.profile_json,'$.version')='pingen-2026-09-17-v2' AND json_type(f.recipient_json,'$.addressLines') IS NULL)
        OR (
          json_extract(p.profile_json,'$.version')='pingen-2026-11-01-address-block-v3'
          AND json_extract(f.report_json,'$.version')='pingen-2026-11-01-address-block-v3'
          AND json_type(f.recipient_json,'$.addressLines')='array'
          AND json_array_length(f.recipient_json,'$.addressLines') BETWEEN 2 AND 6
          AND (SELECT count(*) FROM json_each(f.recipient_json))=2
          AND json_type(f.recipient_json,'$.country')='text'
          AND NOT EXISTS(SELECT 1 FROM json_each(f.recipient_json,'$.addressLines') WHERE type<>'text' OR length(trim(value))=0)
          AND f.recipient_json=NEW.recipient_json
          AND json_extract(q.input_json,'$.recipient')=NEW.recipient_json
        )
      )
  );
END;

DROP TRIGGER postal_address_page_preflight_guard;
CREATE TRIGGER postal_address_page_preflight_guard BEFORE INSERT ON postal_preflights
WHEN EXISTS(SELECT 1 FROM postal_address_pages p WHERE p.organization_id=NEW.organization_id AND (p.planned_document_id=NEW.document_id OR p.generated_document_id=NEW.document_id))
BEGIN
  SELECT RAISE(ABORT,'postal_address_page_binding_invalid') WHERE NOT EXISTS(
    SELECT 1 FROM postal_address_pages p
    WHERE p.organization_id=NEW.organization_id AND p.generated_document_id=NEW.document_id
      AND p.generated_sha256=NEW.document_sha256 AND p.recipient_json=NEW.recipient_json
      AND p.print_mode=json_extract(NEW.options_json,'$.printMode') AND p.profile_json=NEW.profile_json
      AND (
        (p.version='postal-address-page-2026-09-20-v1' AND json_type(p.recipient_json,'$.addressLines') IS NULL)
        OR (
          p.version='postal-address-page-2026-11-01-address-block-v2'
          AND json_extract(NEW.profile_json,'$.version')='pingen-2026-11-01-address-block-v3'
          AND json_type(p.recipient_json,'$.addressLines')='array'
          AND json_array_length(p.recipient_json,'$.addressLines') BETWEEN 2 AND 6
          AND (SELECT count(*) FROM json_each(p.recipient_json))=2
          AND json_type(p.recipient_json,'$.country')='text'
          AND NOT EXISTS(SELECT 1 FROM json_each(p.recipient_json,'$.addressLines') WHERE type<>'text' OR length(trim(value))=0)
        )
      )
      AND EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=p.organization_id AND d.id=p.generated_document_id AND d.pages=p.source_pages+p.added_pages)
  );
END;
