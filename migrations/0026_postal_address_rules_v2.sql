-- Syntax checks in v2 invalidate v1 evidence. Preserve the existing atomic
-- acceptance/dispatch guard; no records, quotas or delegated authority change.
DROP TRIGGER require_postal_review_on_commit;
CREATE TRIGGER require_postal_review_on_commit BEFORE UPDATE OF status ON dispatches
WHEN NEW.mode='production' AND NEW.channel='postal' AND NEW.status IN ('queued','submitting') AND NEW.status<>OLD.status
BEGIN
  SELECT RAISE(ABORT,'postal_preflight_required') WHERE NOT EXISTS(SELECT 1 FROM valid_postal_draft_reviews p JOIN live_delivery_quotes q ON q.organization_id=p.organization_id AND q.provider_draft_id=p.provider_draft_id WHERE p.organization_id=NEW.organization_id AND q.dispatch_id=NEW.id AND p.document_id=NEW.document_id AND p.document_sha256=json_extract(q.input_json,'$.documentSha256') AND json_extract(p.profile_json,'$.accountId')=q.account_id AND json_extract(p.profile_json,'$.version')='pingen-2026-09-17-v2');
END;
