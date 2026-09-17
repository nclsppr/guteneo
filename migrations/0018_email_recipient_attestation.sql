-- A browser approval records the human's statement for the exact recipient and
-- immutable dispatch fingerprint. It is not independent proof of consent.
ALTER TABLE approvals ADD COLUMN recipient_requested INTEGER NOT NULL DEFAULT 0 CHECK(recipient_requested IN (0,1));
CREATE TRIGGER email_recipient_attestation_acceptance BEFORE UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' AND NEW.mode='production' AND NEW.channel='email' BEGIN
  SELECT RAISE(ABORT,'recipient_request_required') WHERE NOT EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.fingerprint=NEW.fingerprint AND a.recipient_requested=1 AND a.expires_at>NEW.updated_at);
END;
CREATE TRIGGER email_recipient_attestation_submission BEFORE UPDATE OF status ON dispatches WHEN OLD.status='queued' AND NEW.status='submitting' AND NEW.mode='production' AND NEW.channel='email' BEGIN
  SELECT RAISE(ABORT,'recipient_request_required') WHERE NOT EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=NEW.organization_id AND a.dispatch_id=NEW.id AND a.fingerprint=NEW.fingerprint AND a.recipient_requested=1);
END;
